import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import notificationService from '../services/NotificationService';

type NotificationContextValue = {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
  incrementUnreadCount: () => void;
  markAllAsRead: () => void;
};

export const NotificationContext = createContext<NotificationContextValue>({
  unreadCount: 0,
  setUnreadCount: () => {},
  incrementUnreadCount: () => {},
  markAllAsRead: () => {},
});

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [unreadCount, setUnreadCount] = useState(0);

  const incrementUnreadCount = useCallback(() => {
    setUnreadCount(c => c + 1);
  }, []);

  const markAllAsRead = useCallback(() => {
    setUnreadCount(0);
    void notificationService.markAllNotificationsRead();
  }, []);

  const value = useMemo(
    () => ({
      unreadCount,
      setUnreadCount,
      incrementUnreadCount,
      markAllAsRead,
    }),
    [unreadCount, incrementUnreadCount, markAllAsRead],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationBadge() {
  return useContext(NotificationContext);
}
