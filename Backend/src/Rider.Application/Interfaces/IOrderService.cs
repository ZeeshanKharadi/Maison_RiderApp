using Rider.Application.DTOs.Orders;
using Rider.Domain.Common;

namespace Rider.Application.Interfaces
{
    public interface IOrderService
    {
        Task<ApiResponse<AssignOrderResultDto>> AssignOrderAsync(AssignOrderRequest request);
        Task<ApiResponse<AssignOrderToRiderResultDto>> AssignOrderToRiderAsync(AssignOrderToRiderRequest request);
        Task<ApiResponse<List<AvailableOrderDto>>> GetAvailableOrdersAsync(Guid riderUserId);
        Task<ApiResponse<List<AvailableOrderDto>>> GetActiveOrdersAsync(Guid riderUserId);
        Task<ApiResponse<List<AvailableOrderDto>>> GetOrderHistoryAsync(Guid riderUserId, int page, int pageSize);
        Task<ApiResponse<RiderPerformanceDto>> GetPerformanceAsync(Guid riderUserId, DateTime? from, DateTime? to);
        Task<ApiResponse<AvailableOrderDto>> GetOrderByIdAsync(long id, Guid? riderUserId = null);
        Task<ApiResponse<AvailableOrderDto>> GetOrderByExternalIdAsync(string orderId, Guid? riderUserId = null);
        Task<ApiResponse<AvailableOrderDto>> UpdateRiderStatusAsync(long id, Guid riderUserId, UpdateOrderStatusRequest request);
        Task<ApiResponse<AvailableOrderDto>> RejectOrderAsync(long id, Guid riderUserId, RejectOrderRequest request);
        Task<ApiResponse<bool>> SetAvailabilityAsync(Guid riderUserId, bool isOnline);
        Task<ApiResponse<RiderLocationDto>> UpdateRiderLocationAsync(Guid riderUserId, UpdateRiderLocationRequest request);
        Task ClearRiderLocationAsync(Guid riderUserId, string? reason = null);
        Task TouchLastSeenAsync(Guid userId);
    }
}
