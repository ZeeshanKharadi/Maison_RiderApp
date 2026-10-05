import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert } from 'react-native';
import * as accountRepository from '../repositories/accountRepository';
import * as authRepository from '../repositories/authRepository';
import * as notificationsRepository from '../repositories/notificationsRepository';
import { useAuth } from '../services/AuthContext';
import {
  AppNotification,
  AppSettings,
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  NotificationCategory,
  RiderProfile,
} from '../data/account';
import notificationService from '../services/NotificationService';
import { buildRiderProfilePatchBody } from '../utils/riderProfilePatch';
import { shouldRegisterPushToken } from '../utils/pushRegistration';
import {
  profileSeedForUser,
  shouldApplyInboxForRider,
} from '../utils/accountSession';

export type UpdateProfileResult = {
  ok: boolean;
  /** True when phone/emergency were written to the server. */
  serverSynced: boolean;
  /** True when only local prefs (e.g. language) changed. */
  localOnly: boolean;
  message?: string;
};

type AccountContextValue = {
  profile: RiderProfile;
  settings: AppSettings;
  notifications: AppNotification[];
  unreadCount: number;
  /** Set when the latest inbox fetch for this rider failed. */
  notificationsError: string | null;
  updateProfile: (patch: Partial<RiderProfile>) => Promise<UpdateProfileResult>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<boolean>;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  deleteNotification: (id: string) => Promise<void>;
  clearAllNotifications: () => Promise<void>;
  filterNotifications: (
    query: string,
    category: NotificationCategory | 'all',
  ) => AppNotification[];
  syncNotifications: (items: AppNotification[]) => Promise<void>;
  refreshNotifications: () => Promise<void>;
  ready: boolean;
};

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState<RiderProfile>(DEFAULT_PROFILE);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsError, setNotificationsError] = useState<string | null>(
    null,
  );
  const [ready, setReady] = useState(false);
  const clearAllInFlightRef = useRef(false);
  /** Active rider id for ignoring late inbox responses after logout/switch. */
  const activeUserIdRef = useRef<string | null>(user?.id ?? null);
  const settingsLanguageRef = useRef<AppSettings['language']>(
    DEFAULT_SETTINGS.language,
  );

  useEffect(() => {
    settingsLanguageRef.current = settings.language;
  }, [settings.language]);

  useEffect(() => {
    const nextUserId = user?.id ?? null;
    activeUserIdRef.current = nextUserId;

    // Clear rider-scoped UI immediately — never show the previous rider's data.
    setNotifications([]);
    setNotificationsError(null);
    setProfile(profileSeedForUser(user, settingsLanguageRef.current));
    void accountRepository.saveNotifications([]);

    let cancelled = false;

    (async () => {
      // Device-level settings (incl. push preference) survive rider changes.
      const s = await accountRepository.loadSettings();
      if (cancelled) return;
      if (s.ok) {
        setSettings(s.data);
        settingsLanguageRef.current = s.data.language;
        notificationService.setPushPreferred(s.data.pushNotifications);
        // Re-apply language onto the cleared profile seed.
        setProfile(profileSeedForUser(user, s.data.language));
      }

      if (!nextUserId) {
        setReady(true);
        return;
      }

      const n = await notificationsRepository.fetchNotifications();
      if (cancelled) return;
      if (!shouldApplyInboxForRider(nextUserId, activeUserIdRef.current)) {
        return;
      }

      if (n.ok) {
        setNotifications(n.data);
        setNotificationsError(null);
        await accountRepository.saveNotifications(n.data);
      } else {
        setNotifications([]);
        setNotificationsError(
          n.error.message || 'Could not load notifications.',
        );
        await accountRepository.saveNotifications([]);
      }

      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Keep local profile identity fields in sync with backend auth user.
  useEffect(() => {
    if (!user) return;
    setProfile(prev => {
      const next = {
        ...prev,
        fullName: user.name || prev.fullName,
        email: user.email || prev.email,
        phone: user.phone ?? prev.phone,
        emergencyContact: user.emergencyContact ?? prev.emergencyContact,
      };
      if (
        next.fullName === prev.fullName &&
        next.email === prev.email &&
        next.phone === prev.phone &&
        next.emergencyContact === prev.emergencyContact
      ) {
        return prev;
      }
      void accountRepository.saveProfile(next);
      return next;
    });
  }, [
    user?.name,
    user?.email,
    user?.phone,
    user?.emergencyContact,
  ]);

  const updateProfile = useCallback(
    async (patch: Partial<RiderProfile>): Promise<UpdateProfileResult> => {
      const languageChanged =
        patch.language !== undefined && patch.language !== profile.language;

      const body = buildRiderProfilePatchBody({
        currentPhone: profile.phone,
        currentEmergency: profile.emergencyContact,
        nextPhone: patch.phone,
        nextEmergency: patch.emergencyContact,
      });
      const serverFieldsChanged = body != null;

      if (serverFieldsChanged) {
        const api = await authRepository.patchRiderProfile(body);
        if (!api.ok) {
          return {
            ok: false,
            serverSynced: false,
            localOnly: false,
            message: api.error.message,
          };
        }

        await refreshUser();

        const next: RiderProfile = {
          ...profile,
          ...patch,
          phone: api.data.phone ?? patch.phone ?? profile.phone,
          emergencyContact:
            api.data.emergencyContact ??
            patch.emergencyContact ??
            profile.emergencyContact,
          fullName: api.data.name || profile.fullName,
          email: api.data.email || profile.email,
        };
        const saved = await accountRepository.saveProfile(next);
        if (saved.ok) setProfile(saved.data);
        else setProfile(next);

        if (languageChanged) {
          const s = await accountRepository.saveSettings({
            ...settings,
            language: patch.language!,
          });
          if (s.ok) setSettings(s.data);
        }

        return {
          ok: true,
          serverSynced: true,
          localOnly: false,
          message: api.message || 'Profile updated',
        };
      }

      if (!languageChanged) {
        return {
          ok: true,
          serverSynced: false,
          localOnly: false,
          message: 'No changes to save',
        };
      }

      const next = { ...profile, language: patch.language! };
      const result = await accountRepository.saveProfile(next);
      if (!result.ok) {
        return {
          ok: false,
          serverSynced: false,
          localOnly: true,
          message: result.error.message,
        };
      }
      setProfile(result.data);
      if (languageChanged) {
        const s = await accountRepository.saveSettings({
          ...settings,
          language: patch.language!,
        });
        if (s.ok) setSettings(s.data);
      }
      return {
        ok: true,
        serverSynced: false,
        localOnly: true,
        message: 'Saved on this device',
      };
    },
    [profile, settings, refreshUser],
  );

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      if (
        patch.pushNotifications !== undefined &&
        patch.pushNotifications !== settings.pushNotifications
      ) {
        const pushResult = await notificationService.applyPushPreference(
          patch.pushNotifications,
        );
        if (!pushResult.ok) {
          Alert.alert(
            'Push notifications',
            pushResult.message ||
              'Could not update push registration on the server.',
          );
          return false;
        }
      }

      const next = { ...settings, ...patch };
      const result = await accountRepository.saveSettings(next);
      if (!result.ok) {
        if (patch.pushNotifications !== undefined) {
          notificationService.setPushPreferred(settings.pushNotifications);
          if (shouldRegisterPushToken(settings.pushNotifications)) {
            void notificationService.saveTokensToBackend();
          } else {
            void notificationService.removeTokenFromBackend();
          }
        }
        Alert.alert(
          'Settings',
          result.error.message || 'Could not save settings on this device.',
        );
        return false;
      }
      setSettings(result.data);
      notificationService.setPushPreferred(result.data.pushNotifications);
      if (patch.language) {
        const p = await accountRepository.saveProfile({
          ...profile,
          language: patch.language,
        });
        if (p.ok) setProfile(p.data);
      }
      return true;
    },
    [settings, profile],
  );

  const syncNotifications = useCallback(async (items: AppNotification[]) => {
    const uid = activeUserIdRef.current;
    if (!uid) return;
    setNotifications(items);
    setNotificationsError(null);
    await accountRepository.saveNotifications(items);
  }, []);

  const refreshNotifications = useCallback(async () => {
    const uid = activeUserIdRef.current;
    if (!uid) {
      setNotifications([]);
      setNotificationsError(null);
      return;
    }

    const result = await notificationsRepository.fetchNotifications();
    if (!shouldApplyInboxForRider(uid, activeUserIdRef.current)) return;

    if (result.ok) {
      await syncNotifications(result.data);
      return;
    }

    setNotifications([]);
    setNotificationsError(
      result.error.message || 'Could not load notifications.',
    );
    await accountRepository.saveNotifications([]);
  }, [syncNotifications]);

  const markNotificationRead = useCallback(
    (id: string) => {
      if (!activeUserIdRef.current) return;
      const next = notifications.map(n =>
        n.id === id ? { ...n, read: true } : n,
      );
      void syncNotifications(next);
      void notificationsRepository.markNotificationRead(id);
    },
    [notifications, syncNotifications],
  );

  const markAllNotificationsRead = useCallback(() => {
    if (!activeUserIdRef.current) return;
    const next = notifications.map(n => ({ ...n, read: true }));
    void syncNotifications(next);
    void notificationsRepository.markAllNotificationsRead();
  }, [notifications, syncNotifications]);

  const deleteNotification = useCallback(
    async (id: string) => {
      const uid = activeUserIdRef.current;
      if (!uid) return;

      let snapshot: AppNotification[] = [];
      setNotifications(prev => {
        snapshot = prev;
        return prev.filter(n => n.id !== id);
      });

      const result = await notificationsRepository.deleteNotification(id);
      if (!shouldApplyInboxForRider(uid, activeUserIdRef.current)) return;

      if (result.ok) {
        setNotifications(current => {
          const persist = current.filter(n => n.id !== id);
          void accountRepository.saveNotifications(persist);
          return persist;
        });
        return;
      }

      const refreshed = await notificationsRepository.fetchNotifications();
      if (!shouldApplyInboxForRider(uid, activeUserIdRef.current)) return;

      if (refreshed.ok) {
        await syncNotifications(refreshed.data);
      } else {
        setNotifications(snapshot);
      }

      Alert.alert(
        'Delete failed',
        result.error.message ||
          'Could not delete on the server. The notification is still in your inbox.',
      );
    },
    [syncNotifications],
  );

  const clearAllNotifications = useCallback(async () => {
    if (clearAllInFlightRef.current) return;
    const uid = activeUserIdRef.current;
    if (!uid) return;

    clearAllInFlightRef.current = true;

    let snapshot: AppNotification[] = [];
    try {
      setNotifications(prev => {
        snapshot = prev;
        return [];
      });

      const result = await notificationsRepository.deleteAllNotifications();
      if (!shouldApplyInboxForRider(uid, activeUserIdRef.current)) return;

      if (result.ok) {
        setNotifications([]);
        setNotificationsError(null);
        await accountRepository.saveNotifications([]);
        return;
      }

      const refreshed = await notificationsRepository.fetchNotifications();
      if (!shouldApplyInboxForRider(uid, activeUserIdRef.current)) return;

      if (refreshed.ok) {
        await syncNotifications(refreshed.data);
      } else {
        setNotifications(snapshot);
      }

      Alert.alert(
        'Clear all failed',
        result.error.message ||
          'Could not clear notifications on the server. Your inbox was not cleared.',
      );
    } finally {
      clearAllInFlightRef.current = false;
    }
  }, [syncNotifications]);

  const filterNotifications = useCallback(
    (query: string, category: NotificationCategory | 'all') => {
      const q = query.trim().toLowerCase();
      return notifications
        .filter(n => {
          if (category !== 'all' && n.category !== category) return false;
          if (!q) return true;
          return (
            n.title.toLowerCase().includes(q) ||
            n.description.toLowerCase().includes(q) ||
            n.category.includes(q)
          );
        })
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );
    },
    [notifications],
  );

  const unreadCount = useMemo(
    () => notifications.filter(n => !n.read).length,
    [notifications],
  );

  const value = useMemo(
    () => ({
      profile,
      settings,
      notifications,
      unreadCount,
      notificationsError,
      updateProfile,
      updateSettings,
      markNotificationRead,
      markAllNotificationsRead,
      deleteNotification,
      clearAllNotifications,
      filterNotifications,
      syncNotifications,
      refreshNotifications,
      ready,
    }),
    [
      profile,
      settings,
      notifications,
      unreadCount,
      notificationsError,
      updateProfile,
      updateSettings,
      markNotificationRead,
      markAllNotificationsRead,
      deleteNotification,
      clearAllNotifications,
      filterNotifications,
      syncNotifications,
      refreshNotifications,
      ready,
    ],
  );

  return (
    <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
  );
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) {
    throw new Error('useAccount must be used within AccountProvider');
  }
  return ctx;
}
