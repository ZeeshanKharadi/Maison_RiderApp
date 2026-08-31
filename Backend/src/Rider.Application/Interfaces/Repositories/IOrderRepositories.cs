using Rider.Domain.Entities;

namespace Rider.Application.Interfaces.Repositories
{
    public interface IAssignedOrderBatchRepository : IRepository<AssignedOrderBatch>
    {
    }

    public interface IAssignedOrderRepository : IRepository<AssignedOrder>
    {
        Task<AssignedOrder> GetByExternalOrderIdAsync(string orderId);
        Task<List<AssignedOrder>> GetAvailableWithItemsAsync();
        Task<AssignedOrder> GetByIdWithItemsAsync(long id);
    }

    public interface IAssignedOrderItemRepository : IRepository<AssignedOrderItem>
    {
    }
}
