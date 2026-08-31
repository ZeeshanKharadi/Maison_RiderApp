using Rider.Application.DTOs.Orders;
using Rider.Domain.Common;

namespace Rider.Application.Interfaces
{
    public interface IOrderService
    {
        Task<ApiResponse<AssignOrderResultDto>> AssignOrderAsync(AssignOrderRequest request);
        Task<ApiResponse<AssignOrderToRiderResultDto>> AssignOrderToRiderAsync(AssignOrderToRiderRequest request);
        Task<ApiResponse<List<AvailableOrderDto>>> GetAvailableOrdersAsync(Guid riderUserId);
        Task<ApiResponse<AvailableOrderDto>> GetOrderByIdAsync(long id);
        Task<ApiResponse<AvailableOrderDto>> GetOrderByExternalIdAsync(string orderId);
        Task<ApiResponse<AvailableOrderDto>> UpdateRiderStatusAsync(long id, Guid riderUserId, UpdateOrderStatusRequest request);
        Task TouchLastSeenAsync(Guid userId);
    }
}
