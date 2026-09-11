import { DeliveryHistoryItem } from '../../data/deliveryHistory';
import { AvailableOrder } from '../../data/orders';
import { DeliveryTimelineStep } from '../../delivery/types';

/** Map a completed/history API order into the archive card shape (no fabricated timeline). */
export function mapOrderToHistoryItem(order: AvailableOrder): DeliveryHistoryItem {
  const deliveredAt =
    order.completedAt ||
    order.pickedUpAt ||
    order.acceptedAt ||
    order.postedAt ||
    new Date().toISOString();

  const timeline: DeliveryTimelineStep[] = [];
  if (order.acceptedAt) {
    timeline.push({
      state: 'ACCEPTED',
      label: 'Accepted',
      at: order.acceptedAt,
      status: 'done',
    });
  }
  if (order.pickedUpAt) {
    timeline.push({
      state: 'PICKUP_CONFIRMED',
      label: 'Picked up',
      at: order.pickedUpAt,
      status: 'done',
    });
  }
  if (order.completedAt) {
    timeline.push({
      state: 'COMPLETED',
      label: 'Completed',
      at: order.completedAt,
      status: 'done',
    });
  }

  let durationMin = 0;
  if (order.acceptedAt && order.completedAt) {
    const start = new Date(order.acceptedAt).getTime();
    const end = new Date(order.completedAt).getTime();
    if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
      durationMin = Math.max(1, Math.round((end - start) / 60000));
    }
  }

  const cancelled = /cancel/i.test(order.backendStatus ?? '');

  return {
    id: order.id,
    restaurant: order.restaurant,
    customerName: order.customerName,
    pickupAddress: order.pickupAddress,
    dropoffAddress: order.dropoffAddress,
    deliveredAt,
    orderAmount: order.orderAmount,
    deliveryFee: order.deliveryFee,
    tip: 0,
    distanceMiles: order.distanceMiles ?? 0,
    durationMin,
    items: order.items,
    paymentMethod: order.paymentMethod,
    status: cancelled ? 'cancelled' : 'delivered',
    imageColor: order.imageColor,
    isCod: order.isCod,
    express: order.express,
    priority: order.priority !== 'normal',
    fragile: order.fragile,
    packageInfo: order.packageInfo,
    specialInstructions: order.specialInstructions,
    cashCollected: order.isCod ? true : null,
    timeline,
  };
}
