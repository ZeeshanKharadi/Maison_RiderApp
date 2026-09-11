using Microsoft.EntityFrameworkCore;
using Rider.Application.Interfaces.Repositories;
using Rider.Domain.Common;
using Rider.Domain.Entities;
using Rider.Persistence.Contexts;

namespace Rider.Persistence.Repositories
{
    public class AssignedOrderBatchRepository : Repository<AssignedOrderBatch>, IAssignedOrderBatchRepository
    {
        public AssignedOrderBatchRepository(ApplicationDbContext context) : base(context)
        {
        }
    }

    public class AssignedOrderRepository : Repository<AssignedOrder>, IAssignedOrderRepository
    {
        private readonly ApplicationDbContext _appContext;

        public AssignedOrderRepository(ApplicationDbContext context) : base(context)
        {
            _appContext = context;
        }

        public async Task<AssignedOrder?> GetByExternalOrderIdAsync(string orderId)
            => await _entities
                .Include(o => o.Items)
                .Include(o => o.Batch)
                    .ThenInclude(b => b.Store)
                .FirstOrDefaultAsync(o => o.OrderId == orderId);

        public async Task<List<AssignedOrder>> GetAvailableWithItemsAsync(Guid riderUserId)
        {
            var rejectedIds = await _appContext.OrderRejections
                .AsNoTracking()
                .Where(r => r.RiderUserId == riderUserId)
                .Select(r => r.AssignedOrderId)
                .ToListAsync();

            return await _entities
                .AsNoTracking()
                .Include(o => o.Items)
                .Include(o => o.Batch)
                    .ThenInclude(b => b.Store)
                .Where(o => o.Status == OrderStatuses.Available
                    && !rejectedIds.Contains(o.Id)
                    && (
                        // Open pool: not direct-held, unreserved
                        (!o.IsDirectAssignment && o.AcceptedByUserId == null)
                        // Reserved / direct for this rider
                        || o.AcceptedByUserId == riderUserId
                    )
                    // Direct assignments with no assignee stay out of public pool until admin requeues
                    && !(o.IsDirectAssignment && o.AcceptedByUserId == null))
                .OrderByDescending(o => o.CreatedAt)
                .ToListAsync();
        }

        public async Task<AssignedOrder?> GetByIdWithItemsAsync(long id)
            => await _entities
                .AsNoTracking()
                .Include(o => o.Items)
                .Include(o => o.Batch)
                    .ThenInclude(b => b.Store)
                .Include(o => o.AcceptedByUser)
                .FirstOrDefaultAsync(o => o.Id == id);

        public async Task<AssignedOrder?> GetByIdForUpdateAsync(long id)
        {
            // SQL Server: row lock for accept/status races. Other providers (tests): tracked load.
            if (_appContext.Database.IsSqlServer())
            {
                var locked = await _entities
                    .FromSqlRaw(
                        "SELECT * FROM AssignedOrders WITH (UPDLOCK, ROWLOCK) WHERE Id = {0}",
                        id)
                    .AsTracking()
                    .FirstOrDefaultAsync();

                if (locked == null)
                    return null;

                await _appContext.Entry(locked).Collection(o => o.Items).LoadAsync();
                await _appContext.Entry(locked).Reference(o => o.Batch).LoadAsync();
                if (locked.Batch != null)
                    await _appContext.Entry(locked.Batch).Reference(b => b.Store).LoadAsync();
                await _appContext.Entry(locked).Reference(o => o.AcceptedByUser).LoadAsync();
                return locked;
            }

            return await _entities
                .Include(o => o.Items)
                .Include(o => o.Batch)
                    .ThenInclude(b => b.Store)
                .Include(o => o.AcceptedByUser)
                .FirstOrDefaultAsync(o => o.Id == id);
        }

        public async Task<List<AssignedOrder>> QueryForAdminAsync(
            string storeId, string status, Guid? riderId, DateTime? fromUtc, DateTime? toUtc)
        {
            var q = _entities
                .AsNoTracking()
                .Include(o => o.Items)
                .Include(o => o.Batch)
                .Include(o => o.AcceptedByUser)
                .AsQueryable();

            if (!string.IsNullOrWhiteSpace(storeId))
                q = q.Where(o => o.Batch != null && o.Batch.StoreId == storeId);

            if (!string.IsNullOrWhiteSpace(status))
                q = q.Where(o => o.Status == status);

            if (riderId.HasValue)
                q = q.Where(o => o.AcceptedByUserId == riderId.Value);

            if (fromUtc.HasValue)
                q = q.Where(o => o.CreatedAt >= fromUtc.Value);

            if (toUtc.HasValue)
                q = q.Where(o => o.CreatedAt < toUtc.Value);

            return await q.OrderByDescending(o => o.CreatedAt).ToListAsync();
        }

        public Task<int> CountActiveForRiderAsync(Guid riderUserId)
            => _entities.CountAsync(o =>
                o.AcceptedByUserId == riderUserId
                && (o.Status == OrderStatuses.Accepted || o.Status == OrderStatuses.InProgress));

        public async Task<List<AssignedOrder>> GetActiveForRiderAsync(Guid riderUserId)
            => await _entities
                .AsNoTracking()
                .Include(o => o.Items)
                .Include(o => o.Batch)
                    .ThenInclude(b => b.Store)
                .Where(o => o.AcceptedByUserId == riderUserId
                    && (o.Status == OrderStatuses.Accepted || o.Status == OrderStatuses.InProgress))
                .OrderByDescending(o => o.AcceptedAt ?? o.CreatedAt)
                .ToListAsync();

        public async Task<bool> TryAcceptAvailableAsync(long id, Guid riderUserId, DateTime acceptedAtUtc)
        {
            // Prefer atomic conditional UPDATE (race-safe on SQL Server).
            try
            {
                var rows = await _entities
                    .Where(o => o.Id == id
                        && o.Status == OrderStatuses.Available
                        && (o.AcceptedByUserId == null || o.AcceptedByUserId == riderUserId)
                        && !(o.IsDirectAssignment && o.AcceptedByUserId == null))
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(o => o.Status, OrderStatuses.Accepted)
                        .SetProperty(o => o.AcceptedByUserId, riderUserId)
                        .SetProperty(o => o.AcceptedAt, acceptedAtUtc)
                        .SetProperty(o => o.UpdatedAt, acceptedAtUtc));

                return rows == 1;
            }
            catch (InvalidOperationException)
            {
                // Some providers / InMemory edge cases: fall back to tracked update
                var order = await _entities.FirstOrDefaultAsync(o => o.Id == id);
                if (order == null
                    || order.Status != OrderStatuses.Available
                    || (order.AcceptedByUserId.HasValue && order.AcceptedByUserId != riderUserId)
                    || (order.IsDirectAssignment && order.AcceptedByUserId == null))
                    return false;

                order.Status = OrderStatuses.Accepted;
                order.AcceptedByUserId = riderUserId;
                order.AcceptedAt = acceptedAtUtc;
                order.UpdatedAt = acceptedAtUtc;
                await _appContext.SaveChangesAsync();
                return true;
            }
        }

        public async Task<List<AssignedOrder>> GetHistoryForRiderAsync(Guid riderUserId, int skip, int take)
            => await _entities
                .AsNoTracking()
                .Include(o => o.Items)
                .Include(o => o.Batch)
                    .ThenInclude(b => b.Store)
                .Where(o => o.AcceptedByUserId == riderUserId
                    && (o.Status == OrderStatuses.Completed || o.Status == OrderStatuses.Cancelled))
                .OrderByDescending(o => o.CompletedAt ?? o.UpdatedAt ?? o.CreatedAt)
                .Skip(skip)
                .Take(take)
                .ToListAsync();

        public Task<bool> HasRiderRejectedAsync(long assignedOrderId, Guid riderUserId)
            => _appContext.OrderRejections.AnyAsync(r =>
                r.AssignedOrderId == assignedOrderId && r.RiderUserId == riderUserId);
    }

    public class AssignedOrderItemRepository : Repository<AssignedOrderItem>, IAssignedOrderItemRepository
    {
        public AssignedOrderItemRepository(ApplicationDbContext context) : base(context)
        {
        }
    }
}
