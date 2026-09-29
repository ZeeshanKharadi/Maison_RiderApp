using Rider.Domain.Entities;

namespace Rider.Application.Interfaces.Repositories
{
    public interface IRiderNotificationRepository : IRepository<RiderNotification>
    {
        Task<List<RiderNotification>> ListForUserAsync(Guid userId, int take);
        Task<RiderNotification> GetForUserAsync(Guid userId, long id);

        /// <summary>
        /// Unread cancel-inbox rows for this rider (durable catch-up; no time window).
        /// Excludes soft-deleted rows.
        /// </summary>
        Task<List<RiderNotification>> ListUnreadOrderCancellationsAsync(Guid userId, int take = 100);

        /// <summary>
        /// Marks unread cancel notifications for the given assigned-order ids as read (this user only).
        /// Soft-deleted rows are left alone (already hidden from the rider).
        /// </summary>
        Task<int> MarkOrderCancellationsReadAsync(Guid userId, IReadOnlyCollection<long> assignedOrderIds);

        /// <summary>Soft-delete one inbox row for this user. Returns false if missing / other user.</summary>
        Task<bool> SoftDeleteForUserAsync(Guid userId, long id);

        /// <summary>Soft-delete all non-deleted inbox rows for this user. Returns count updated.</summary>
        Task<int> SoftDeleteAllForUserAsync(Guid userId);
    }
}
