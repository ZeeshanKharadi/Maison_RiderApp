using Rider.Application.DTOs.Orders;
using Rider.Domain.Common;

namespace Rider.Application.Interfaces
{
    public interface IOrderService
    {
        Task<ApiResponse<AssignOrderResultDto>> AssignOrderAsync(AssignOrderRequest request);
        Task<ApiResponse<List<AvailableOrderDto>>> GetAvailableOrdersAsync();
        Task<ApiResponse<AvailableOrderDto>> GetOrderByIdAsync(long id);
        Task<ApiResponse<AvailableOrderDto>> GetOrderByExternalIdAsync(string orderId);
    }
}
