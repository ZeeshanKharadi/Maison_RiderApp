import { DeliveryHistoryItem } from '../../data/deliveryHistory';
import { AvailableOrder } from '../../data/orders';
import { DeliveryTimelineStep } from '../../delivery/types';

/**
 * Map a completed/history API order into the archive card shape.
 * Does not invent delivery fee, tip, distance, or ratings — those are omitted
 * when the History DTO does not supply them.
 */
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

  // API currently hardcodes deliveryFee to 0 and distanceMiles to null — treat
  // zero fee as unavailable so archive stats do not show fake earnings.
  const feeRaw = order.deliveryFee;
  const deliveryFee =
    feeRaw != null && Number.isFinite(feeRaw) && feeRaw > 0 ? feeRaw : null;

  const distanceMiles =
    order.distanceMiles != null &&
    Number.isFinite(order.distanceMiles) &&
    order.distanceMiles > 0
      ? order.distanceMiles
      : null;

  const cashAmount =
    order.isCod &&
    order.cashCollectedAmount != null &&
    Number.isFinite(order.cashCollectedAmount)
      ? Number(order.cashCollectedAmount)
      : null;

  return {
    id: order.id,
    restaurant: order.restaurant,
    customerName: order.customerName,
    pickupAddress: order.pickupAddress,
    dropoffAddress: order.dropoffAddress,
    deliveredAt,
    orderAmount: order.orderAmount,
    deliveryFee,
    tip: null,
    distanceMiles,
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
    cashCollected: order.isCod ? cashAmount != null : null,
    cashCollectedAmount: cashAmount,
    cashVerified: order.isCod ? cashAmount != null : null,
    timeline,
  };
}
