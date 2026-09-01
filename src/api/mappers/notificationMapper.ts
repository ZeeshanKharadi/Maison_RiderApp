import { AppNotification } from '../data/account';

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

export function mapApiNotification(dto: ApiRiderNotification): AppNotification {
  const category =
    dto.category === 'orders' ||
    dto.category === 'payments' ||
    dto.category === 'achievements' ||
    dto.category === 'bonuses' ||
    dto.category === 'system' ||
    dto.category === 'updates'
      ? dto.category
      : 'orders';

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
