using Microsoft.EntityFrameworkCore;
using Rider.Application.Interfaces.Repositories;
using Rider.Domain.Common;
using Rider.Domain.Entities;
using Rider.Persistence.Contexts;

namespace Rider.Persistence.Repositories
{
    public class RiderNotificationRepository : Repository<RiderNotification>, IRiderNotificationRepository
    {
        public RiderNotificationRepository(ApplicationDbContext context) : base(context)
        {
        }

        public async Task<List<RiderNotification>> ListForUserAsync(Guid userId, int take)
            => await _entities
                .AsNoTracking()
                .Where(n => n.UserId == userId && !n.IsDeleted)
                .OrderByDescending(n => n.CreatedAt)
                .Take(take)
                .ToListAsync();

        public async Task<RiderNotification> GetForUserAsync(Guid userId, long id)
            => await _entities.FirstOrDefaultAsync(n =>
                n.Id == id && n.UserId == userId && !n.IsDeleted);

        public async Task<List<RiderNotification>> ListUnreadOrderCancellationsAsync(Guid userId, int take = 100)
        {
            if (take < 1) take = 1;
            if (take > 200) take = 200;
            return await _entities
                .AsNoTracking()
                .Where(n => n.UserId == userId
                    && !n.IsDeleted
                    && !n.IsRead
                    && n.Title == RiderNotificationTitles.OrderCancelled
                    && n.AssignedOrderId != null)
                .OrderByDescending(n => n.CreatedAt)
                .Take(take)
                .ToListAsync();
        }

        public async Task<int> MarkOrderCancellationsReadAsync(
            Guid userId, IReadOnlyCollection<long> assignedOrderIds)
        {
            if (assignedOrderIds == null || assignedOrderIds.Count == 0)
                return 0;

            var ids = assignedOrderIds.Where(id => id > 0).Distinct().ToList();
            if (ids.Count == 0) return 0;

            var rows = await _entities
                .Where(n => n.UserId == userId
                    && !n.IsDeleted
                    && !n.IsRead
                    && n.Title == RiderNotificationTitles.OrderCancelled
                    && n.AssignedOrderId != null
                    && ids.Contains(n.AssignedOrderId.Value))
                .ToListAsync();

            foreach (var row in rows)
                row.IsRead = true;

            return rows.Count;
        }

        public async Task<bool> SoftDeleteForUserAsync(Guid userId, long id)
        {
            var row = await _entities.FirstOrDefaultAsync(n =>
                n.Id == id && n.UserId == userId && !n.IsDeleted);
            if (row == null)
                return false;

            row.IsDeleted = true;
            row.DeletedAt = DateTime.UtcNow;
            row.IsRead = true;
            return true;
        }

        public async Task<int> SoftDeleteAllForUserAsync(Guid userId)
        {
            var rows = await _entities
                .Where(n => n.UserId == userId && !n.IsDeleted)
                .ToListAsync();
            var now = DateTime.UtcNow;
            foreach (var row in rows)
            {
                row.IsDeleted = true;
                row.DeletedAt = now;
                row.IsRead = true;
            }
            return rows.Count;
        }
    }
}
