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
import type { User } from '../services/AuthContext';
import notificationService from '../services/NotificationService';
import { buildRiderProfilePatchBody } from '../utils/riderProfilePatch';
import { shouldRegisterPushToken } from '../utils/pushRegistration';

function profileFromAuthUser(
  profile: RiderProfile,
  authUser: User | null,
): RiderProfile {
  if (!authUser) return profile;
  return {
    ...profile,
    fullName: authUser.name || profile.fullName,
    email: authUser.email || profile.email,
    phone: authUser.phone ?? profile.phone,
    emergencyContact: authUser.emergencyContact ?? profile.emergencyContact,
  };
}

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
  const [ready, setReady] = useState(false);
  const clearAllInFlightRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [p, s] = await Promise.all([
        accountRepository.loadProfile(),
        accountRepository.loadSettings(),
      ]);
      if (!mounted) return;
      // Prefer server auth user over stale local profile for identity fields.
      const base = p.ok ? p.data : DEFAULT_PROFILE;
      setProfile(profileFromAuthUser(base, user));
      if (s.ok) {
        setSettings(s.data);
        notificationService.setPushPreferred(s.data.pushNotifications);
      }

      if (user) {
        const n = await notificationsRepository.fetchNotifications();
        if (n.ok) setNotifications(n.data);
      }

      setReady(true);
    })();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  // Keep local profile in sync with backend auth user (login / CurrentUser).
  useEffect(() => {
    if (!user) return;
    setProfile(prev => {
      const next = profileFromAuthUser(prev, user);
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

        // Refresh auth user so other screens / second load see server values.
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

      // Local-only preferences (language).
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
        // Server push already changed — keep preference aligned with intent.
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
    setNotifications(items);
    await accountRepository.saveNotifications(items);
  }, []);

  const refreshNotifications = useCallback(async () => {
    const result = await notificationsRepository.fetchNotifications();
    if (result.ok) {
      await syncNotifications(result.data);
    }
  }, [syncNotifications]);

  const markNotificationRead = useCallback(
    (id: string) => {
      const next = notifications.map(n =>
        n.id === id ? { ...n, read: true } : n,
      );
      void syncNotifications(next);
      void notificationsRepository.markNotificationRead(id);
    },
    [notifications, syncNotifications],
  );

  const markAllNotificationsRead = useCallback(() => {
    const next = notifications.map(n => ({ ...n, read: true }));
    void syncNotifications(next);
    void notificationsRepository.markAllNotificationsRead();
  }, [notifications, syncNotifications]);

  const deleteNotification = useCallback(
    async (id: string) => {
      let snapshot: AppNotification[] = [];
      setNotifications(prev => {
        snapshot = prev;
        return prev.filter(n => n.id !== id);
      });

      const result = await notificationsRepository.deleteNotification(id);
      if (result.ok) {
        setNotifications(current => {
          const persist = current.filter(n => n.id !== id);
          void accountRepository.saveNotifications(persist);
          return persist;
        });
        return;
      }

      const refreshed = await notificationsRepository.fetchNotifications();
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
    clearAllInFlightRef.current = true;

    let snapshot: AppNotification[] = [];
    try {
      setNotifications(prev => {
        snapshot = prev;
        return [];
      });

      const result = await notificationsRepository.deleteAllNotifications();
      if (result.ok) {
        setNotifications([]);
        await accountRepository.saveNotifications([]);
        return;
      }

      const refreshed = await notificationsRepository.fetchNotifications();
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
