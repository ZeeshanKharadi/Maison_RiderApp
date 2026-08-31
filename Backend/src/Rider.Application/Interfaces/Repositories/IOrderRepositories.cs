using Rider.Domain.Entities;

namespace Rider.Application.Interfaces.Repositories
{
    public interface IAssignedOrderBatchRepository : IRepository<AssignedOrderBatch>
    {
    }

    public interface IAssignedOrderRepository : IRepository<AssignedOrder>
    {
        Task<AssignedOrder> GetByExternalOrderIdAsync(string orderId);
        Task<List<AssignedOrder>> GetAvailableWithItemsAsync(Guid riderUserId);
        Task<AssignedOrder> GetByIdWithItemsAsync(long id);
        Task<AssignedOrder> GetByIdForUpdateAsync(long id);
        Task<List<AssignedOrder>> QueryForAdminAsync(
            string storeId, string status, Guid? riderId, DateTime? fromUtc, DateTime? toUtc);
    }

    public interface IAssignedOrderItemRepository : IRepository<AssignedOrderItem>
    {
    }
}
