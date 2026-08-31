export type AppLanguage = 'en' | 'ur' | 'ar';
export type AppearanceMode = 'light' | 'dark' | 'system';

export type RiderProfile = {
  fullName: string;
  phone: string;
  email: string;
  vehicle: string;
  vehicleNumber: string;
  licenseNumber: string;
  emergencyContact: string;
  language: AppLanguage;
};

export type DocumentStatus = 'verified' | 'pending' | 'expired';

export type RiderDocument = {
  id: string;
  title: string;
  status: DocumentStatus;
  expiryDate: string;
};

export type NotificationCategory =
  | 'orders'
  | 'payments'
  | 'bonuses'
  | 'system'
  | 'announcements'
  | 'achievements'
  | 'support';

export type NotificationPriority = 'low' | 'normal' | 'high';

export type AppNotification = {
  id: string;
  category: NotificationCategory;
  title: string;
  description: string;
  timestamp: string;
  read: boolean;
  priority: NotificationPriority;
  icon: string;
};

export type AppSettings = {
  pushNotifications: boolean;
  appearance: AppearanceMode;
  language: AppLanguage;
};

export const LANGUAGE_LABELS: Record<AppLanguage, string> = {
  en: 'English',
  ur: 'Urdu',
  ar: 'Arabic',
};

export const APPEARANCE_LABELS: Record<AppearanceMode, string> = {
  light: 'Light',
  dark: 'Dark (Coming soon)',
  system: 'System (Coming soon)',
};

export const DEFAULT_PROFILE: RiderProfile = {
  fullName: '',
  phone: '',
  email: '',
  vehicle: 'Scooter · Honda Activa',
  vehicleNumber: '',
  licenseNumber: '',
  emergencyContact: '',
  language: 'en',
};

export const DEFAULT_SETTINGS: AppSettings = {
  pushNotifications: true,
  appearance: 'light',
  language: 'en',
};

export const MOCK_DOCUMENTS: RiderDocument[] = [
  {
    id: 'doc-license',
    title: 'Driving License',
    status: 'verified',
    expiryDate: '2028-04-12',
  },
  {
    id: 'doc-reg',
    title: 'Vehicle Registration',
    status: 'verified',
    expiryDate: '2027-11-01',
  },
  {
    id: 'doc-ins',
    title: 'Insurance',
    status: 'pending',
    expiryDate: '2026-12-31',
  },
  {
    id: 'doc-id',
    title: 'National ID',
    status: 'verified',
    expiryDate: '2030-01-15',
  },
];

export const MOCK_APP_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'n1',
    category: 'orders',
    title: 'New order nearby',
    description: 'Burger House · 0.8 mi · Rs 12.50',
    timestamp: new Date(Date.now() - 2 * 60000).toISOString(),
    read: false,
    priority: 'high',
    icon: 'package-variant',
  },
  {
    id: 'n2',
    category: 'payments',
    title: 'Wallet credited',
    description: 'Delivery #ORD-2841 · +Rs 12.25',
    timestamp: new Date(Date.now() - 60 * 60000).toISOString(),
    read: false,
    priority: 'normal',
    icon: 'wallet-outline',
  },
  {
    id: 'n3',
    category: 'achievements',
    title: 'Weekly target achieved',
    description: 'You hit 150 deliveries this week.',
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    read: true,
    priority: 'normal',
    icon: 'trophy-outline',
  },
  {
    id: 'n4',
    category: 'bonuses',
    title: 'Bonus earned',
    description: 'Peak-hour bonus · +Rs 8.00',
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    read: true,
    priority: 'normal',
    icon: 'gift-outline',
  },
  {
    id: 'n5',
    category: 'system',
    title: 'Shift reminder',
    description: 'Your evening shift starts at 5:00 PM.',
    timestamp: new Date(Date.now() - 2 * 86400000).toISOString(),
    read: true,
    priority: 'low',
    icon: 'clock-outline',
  },
  {
    id: 'n6',
    category: 'announcements',
    title: 'Zone update',
    description: 'Downtown surge hours extended this weekend.',
    timestamp: new Date(Date.now() - 3 * 86400000).toISOString(),
    read: false,
    priority: 'normal',
    icon: 'bullhorn-outline',
  },
  {
    id: 'n7',
    category: 'support',
    title: 'Support reply',
    description: 'Your ticket #4421 has been updated.',
    timestamp: new Date(Date.now() - 4 * 86400000).toISOString(),
    read: true,
    priority: 'low',
    icon: 'headset',
  },
];

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  orders: 'Orders',
  payments: 'Payments',
  bonuses: 'Bonuses',
  system: 'System',
  announcements: 'Announcements',
  achievements: 'Achievements',
  support: 'Support',
};

export function formatNotificationTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs === 1 ? '1 hr ago' : `${hrs} hrs ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}
