using Rider.Domain.Entities;

namespace Rider.Application.Interfaces.Repositories
{
    public interface IAssignedOrderBatchRepository : IRepository<AssignedOrderBatch>
    {
    }

    public interface IAssignedOrderRepository : IRepository<AssignedOrder>
    {
        Task<AssignedOrder?> GetByExternalOrderIdAsync(string orderId);
        Task<List<AssignedOrder>> GetAvailableWithItemsAsync(Guid riderUserId);
        Task<AssignedOrder?> GetByIdWithItemsAsync(long id);
        Task<AssignedOrder?> GetByIdForUpdateAsync(long id);
        Task<List<AssignedOrder>> QueryForAdminAsync(
            string storeId, string status, Guid? riderId, DateTime? fromUtc, DateTime? toUtc);
        Task<List<AssignedOrder>> GetActiveForRiderAsync(Guid riderUserId);
        Task<int> CountActiveForRiderAsync(Guid riderUserId);
        Task<List<AssignedOrder>> GetHistoryForRiderAsync(Guid riderUserId, int skip, int take);
        Task<bool> HasRiderRejectedAsync(long assignedOrderId, Guid riderUserId);
        Task<bool> TryAcceptAvailableAsync(long id, Guid riderUserId, DateTime acceptedAtUtc);
        /// <summary>Atomic InProgress→Completed for one rider. Returns false if lost the race.</summary>
        Task<bool> TryCompleteInProgressAsync(
            long id,
            Guid riderUserId,
            DateTime completedAtUtc,
            decimal? cashCollected,
            string? cashCollectedReason,
            string? cashSemanticsNote);
    }

    public interface IAssignedOrderItemRepository : IRepository<AssignedOrderItem>
    {
    }
}
