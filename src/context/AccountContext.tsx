import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as accountRepository from '../repositories/accountRepository';
import { useAuth } from '../services/AuthContext';
import {
  AppNotification,
  AppSettings,
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  MOCK_APP_NOTIFICATIONS,
  MOCK_DOCUMENTS,
  NotificationCategory,
  RiderDocument,
  RiderProfile,
} from '../data/account';
import type { User } from '../services/AuthContext';

function profileFromAuthUser(
  profile: RiderProfile,
  authUser: User | null,
): RiderProfile {
  if (!authUser) return profile;
  return {
    ...profile,
    fullName: authUser.name || profile.fullName,
    email: authUser.email || profile.email,
    phone: authUser.phone || profile.phone,
  };
}

type AccountContextValue = {
  profile: RiderProfile;
  documents: RiderDocument[];
  settings: AppSettings;
  notifications: AppNotification[];
  unreadCount: number;
  updateProfile: (patch: Partial<RiderProfile>) => Promise<boolean>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<boolean>;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  deleteNotification: (id: string) => void;
  clearAllNotifications: () => void;
  filterNotifications: (
    query: string,
    category: NotificationCategory | 'all',
  ) => AppNotification[];
  ready: boolean;
};

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<RiderProfile>(DEFAULT_PROFILE);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [notifications, setNotifications] = useState<AppNotification[]>(
    MOCK_APP_NOTIFICATIONS,
  );
  const [ready, setReady] = useState(false);
  const documents = MOCK_DOCUMENTS;

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [p, s, n] = await Promise.all([
        accountRepository.loadProfile(),
        accountRepository.loadSettings(),
        accountRepository.loadNotifications(),
      ]);
      if (!mounted) return;
      if (p.ok) setProfile(p.data);
      if (s.ok) setSettings(s.data);
      if (n.ok) setNotifications(n.data);
      setReady(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Keep local profile in sync with backend auth user (login / CurrentUser).
  useEffect(() => {
    if (!user?.name && !user?.email) return;
    setProfile(prev => {
      const next = profileFromAuthUser(prev, user);
      if (
        next.fullName === prev.fullName &&
        next.email === prev.email &&
        next.phone === prev.phone
      ) {
        return prev;
      }
      void accountRepository.saveProfile(next);
      return next;
    });
  }, [user?.name, user?.email, user?.phone]);

  const updateProfile = useCallback(
    async (patch: Partial<RiderProfile>) => {
      const next = { ...profile, ...patch };
      const result = await accountRepository.saveProfile(next);
      if (!result.ok) return false;
      setProfile(result.data);
      if (patch.language) {
        const s = await accountRepository.saveSettings({
          ...settings,
          language: patch.language,
        });
        if (s.ok) setSettings(s.data);
      }
      return true;
    },
    [profile, settings],
  );

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      const next = { ...settings, ...patch };
      const result = await accountRepository.saveSettings(next);
      if (!result.ok) return false;
      setSettings(result.data);
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

  const persistNotifications = useCallback(async (next: AppNotification[]) => {
    setNotifications(next);
    await accountRepository.saveNotifications(next);
  }, []);

  const markNotificationRead = useCallback(
    (id: string) => {
      const next = notifications.map(n =>
        n.id === id ? { ...n, read: true } : n,
      );
      void persistNotifications(next);
    },
    [notifications, persistNotifications],
  );

  const markAllNotificationsRead = useCallback(() => {
    const next = notifications.map(n => ({ ...n, read: true }));
    void persistNotifications(next);
  }, [notifications, persistNotifications]);

  const deleteNotification = useCallback(
    (id: string) => {
      const next = notifications.filter(n => n.id !== id);
      void persistNotifications(next);
    },
    [notifications, persistNotifications],
  );

  const clearAllNotifications = useCallback(() => {
    void persistNotifications([]);
  }, [persistNotifications]);

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
      documents,
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
      ready,
    }),
    [
      profile,
      documents,
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
