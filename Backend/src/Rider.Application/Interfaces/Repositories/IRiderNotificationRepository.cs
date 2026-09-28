using Rider.Domain.Entities;

namespace Rider.Application.Interfaces.Repositories
{
    public interface IRiderNotificationRepository : IRepository<RiderNotification>
    {
        Task<List<RiderNotification>> ListForUserAsync(Guid userId, int take);
        Task<RiderNotification> GetForUserAsync(Guid userId, long id);

        /// <summary>
        /// Unread cancel-inbox rows for this rider (durable catch-up; no time window).
        /// </summary>
        Task<List<RiderNotification>> ListUnreadOrderCancellationsAsync(Guid userId, int take = 100);

        /// <summary>
        /// Marks unread cancel notifications for the given assigned-order ids as read (this user only).
        /// </summary>
        Task<int> MarkOrderCancellationsReadAsync(Guid userId, IReadOnlyCollection<long> assignedOrderIds);
    }
}
