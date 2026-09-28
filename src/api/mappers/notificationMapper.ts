import { AppNotification, NotificationCategory } from '../../data/account';

export type ApiRiderNotification = {
  id: number;
  category: string;
  title: string;
  description: string;
  orderId?: string | null;
  assignedOrderId?: number | null;
  priority: string;
  read: boolean;
  createdAt: string;
};

const CATEGORIES: ReadonlySet<NotificationCategory> = new Set([
  'orders',
  'payments',
  'bonuses',
  'system',
  'announcements',
  'achievements',
  'support',
]);

function mapCategory(raw: string): NotificationCategory {
  if (CATEGORIES.has(raw as NotificationCategory)) {
    return raw as NotificationCategory;
  }
  if (raw === 'updates') return 'system';
  return 'orders';
}

export function mapApiNotification(dto: ApiRiderNotification): AppNotification {
  const category = mapCategory(dto.category);

  const priority =
    dto.priority === 'low' || dto.priority === 'high' || dto.priority === 'normal'
      ? dto.priority
      : 'normal';

  return {
    id: String(dto.id),
    category,
    title: dto.title,
    description: dto.description,
    timestamp: dto.createdAt,
    read: dto.read,
    priority,
    icon: category === 'orders' ? 'package-variant' : 'bell-outline',
  };
}
