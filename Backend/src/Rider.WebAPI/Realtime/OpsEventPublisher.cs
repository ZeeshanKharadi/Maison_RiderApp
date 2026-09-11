using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using Rider.Application.Interfaces;
using Rider.WebAPI.Hubs;

namespace Rider.WebAPI.Realtime
{
    public class OpsEventPublisher : IOpsEventPublisher
    {
        private readonly IHubContext<AdminOpsHub> _hub;
        private readonly ILogger<OpsEventPublisher> _logger;

        public OpsEventPublisher(IHubContext<AdminOpsHub> hub, ILogger<OpsEventPublisher> logger)
        {
            _hub = hub;
            _logger = logger;
        }

        public async Task PublishOrderChangedAsync(
            string? storeId, long assignedOrderId, string orderId, string status, CancellationToken ct = default)
        {
            var payload = new
            {
                assignedOrderId,
                orderId,
                status,
                storeId,
                at = DateTime.UtcNow
            };
            await PublishToGroupsAsync("OrderChanged", storeId, payload, ct);
        }

        public async Task PublishRiderAvailabilityChangedAsync(
            string? storeId, Guid riderUserId, bool isOnline, CancellationToken ct = default)
        {
            var payload = new
            {
                riderUserId,
                isOnline,
                storeId,
                at = DateTime.UtcNow
            };
            await PublishToGroupsAsync("RiderAvailabilityChanged", storeId, payload, ct);
        }

        public async Task PublishAdminNotificationCreatedAsync(
            string? storeId, long notificationId, string title, CancellationToken ct = default)
        {
            var payload = new
            {
                notificationId,
                title,
                storeId,
                at = DateTime.UtcNow
            };
            await PublishToGroupsAsync("AdminNotificationCreated", storeId, payload, ct);
        }

        private async Task PublishToGroupsAsync(string method, string? storeId, object payload, CancellationToken ct)
        {
            try
            {
                await _hub.Clients.Group(AdminOpsHub.HofficeGroup).SendAsync(method, payload, ct);
                if (!string.IsNullOrWhiteSpace(storeId))
                    await _hub.Clients.Group(AdminOpsHub.StoreGroup(storeId)).SendAsync(method, payload, ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "SignalR publish {Method} failed", method);
            }
        }
    }

    /// <summary>No-op publisher for unit tests / when SignalR is unavailable.</summary>
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
