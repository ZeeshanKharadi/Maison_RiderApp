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

        public async Task<List<AssignedOrder>> GetAvailableWithItemsAsync()
            => await _entities
                .AsNoTracking()
                .Include(o => o.Items)
                .Include(o => o.Batch)
                .Where(o => o.Status == "Available")
                .OrderByDescending(o => o.CreatedAt)
                .ToListAsync();

        public async Task<AssignedOrder> GetByIdWithItemsAsync(long id)
            => await _entities
                .AsNoTracking()
                .Include(o => o.Items)
                .Include(o => o.Batch)
                .FirstOrDefaultAsync(o => o.Id == id);
    }

    public class AssignedOrderItemRepository : Repository<AssignedOrderItem>, IAssignedOrderItemRepository
    {
        public AssignedOrderItemRepository(ApplicationDbContext context) : base(context)
        {
        }
    }
}
