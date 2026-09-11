using Rider.Application.Interfaces;

namespace Rider.Infrastructure.Services
{
    public class NoOpOpsEventPublisher : IOpsEventPublisher
    {
        public Task PublishOrderChangedAsync(string? storeId, long assignedOrderId, string orderId, string status, CancellationToken ct = default)
            => Task.CompletedTask;

        public Task PublishRiderAvailabilityChangedAsync(string? storeId, Guid riderUserId, bool isOnline, CancellationToken ct = default)
            => Task.CompletedTask;

        public Task PublishAdminNotificationCreatedAsync(string? storeId, long notificationId, string title, CancellationToken ct = default)
            => Task.CompletedTask;
    }
}
