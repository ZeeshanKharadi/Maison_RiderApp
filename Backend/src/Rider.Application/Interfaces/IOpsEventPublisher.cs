namespace Rider.Application.Interfaces
{
    public interface IOpsEventPublisher
    {
        Task PublishOrderChangedAsync(string? storeId, long assignedOrderId, string orderId, string status, CancellationToken ct = default);
        Task PublishRiderAvailabilityChangedAsync(string? storeId, Guid riderUserId, bool isOnline, CancellationToken ct = default);
        Task PublishAdminNotificationCreatedAsync(string? storeId, long notificationId, string title, CancellationToken ct = default);
        Task PublishRiderLocationChangedAsync(
            string? storeId,
            Guid riderUserId,
            double? latitude,
            double? longitude,
            DateTime? locationUpdatedAt,
            int activeOrderCount,
            string? deliveryStatus,
            bool cleared,
            CancellationToken ct = default);
    }
}
