using Microsoft.EntityFrameworkCore;
using Rider.Application.Interfaces.Repositories;
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
        public AssignedOrderRepository(ApplicationDbContext context) : base(context)
        {
        }

        public async Task<AssignedOrder> GetByExternalOrderIdAsync(string orderId)
            => await _entities
                .Include(o => o.Items)
                .Include(o => o.Batch)
                .FirstOrDefaultAsync(o => o.OrderId == orderId);

        public async Task<List<AssignedOrder>> GetAvailableWithItemsAsync(Guid riderUserId)
            => await _entities
                .AsNoTracking()
                .Include(o => o.Items)
                .Include(o => o.Batch)
                .Where(o => o.Status == "Available"
                    && (o.AcceptedByUserId == null || o.AcceptedByUserId == riderUserId))
                .OrderByDescending(o => o.CreatedAt)
                .ToListAsync();

        public async Task<AssignedOrder> GetByIdWithItemsAsync(long id)
            => await _entities
                .AsNoTracking()
                .Include(o => o.Items)
                .Include(o => o.Batch)
                .Include(o => o.AcceptedByUser)
                .FirstOrDefaultAsync(o => o.Id == id);

        public async Task<AssignedOrder> GetByIdForUpdateAsync(long id)
            => await _entities
                .Include(o => o.Items)
                .Include(o => o.Batch)
                .Include(o => o.AcceptedByUser)
                .FirstOrDefaultAsync(o => o.Id == id);

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
    }

    public class AssignedOrderItemRepository : Repository<AssignedOrderItem>, IAssignedOrderItemRepository
    {
        public AssignedOrderItemRepository(ApplicationDbContext context) : base(context)
        {
        }
    }
}
