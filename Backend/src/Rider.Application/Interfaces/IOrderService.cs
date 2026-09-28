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
        /// <summary>
        /// Unacknowledged cancellations for this rider (inbox IsRead=false).
        /// Survives long offline and requeue. Not included in Active.
        /// withinMinutes is ignored (kept for API compatibility).
        /// </summary>
        Task<ApiResponse<List<AvailableOrderDto>>> GetRecentlyCancelledOrdersAsync(
            Guid riderUserId, int withinMinutes = 180);

        /// <summary>
        /// Marks cancel-inbox rows as read for the assigned rider (server durable ack).
        /// </summary>
        Task<ApiResponse<string>> AcknowledgeCancellationsAsync(
            Guid riderUserId, AcknowledgeCancellationsRequest request);

        Task<ApiResponse<List<AvailableOrderDto>>> GetOrderHistoryAsync(Guid riderUserId, int page, int pageSize);
        Task<ApiResponse<RiderPerformanceDto>> GetPerformanceAsync(Guid riderUserId, DateTime? from, DateTime? to);
        Task<ApiResponse<AvailableOrderDto>> GetOrderByIdAsync(long id, Guid? riderUserId = null);
        Task<ApiResponse<AvailableOrderDto>> GetOrderByExternalIdAsync(string orderId, Guid? riderUserId = null);
        Task<ApiResponse<AvailableOrderDto>> UpdateRiderStatusAsync(long id, Guid riderUserId, UpdateOrderStatusRequest request);
        Task<ApiResponse<AvailableOrderDto>> RejectOrderAsync(long id, Guid riderUserId, RejectOrderRequest request);
        Task<ApiResponse<DeliveryIssueReportDto>> ReportDeliveryIssueAsync(
            long id, Guid riderUserId, ReportDeliveryIssueRequest request);
        Task<ApiResponse<AvailableOrderDto>> RequestFailedDeliveryAsync(
            long id, Guid riderUserId, RequestFailedDeliveryRequest request);
        Task<ApiResponse<AvailableOrderDto>> ConfirmReturnToStoreAsync(
            long id, Guid riderUserId, string? requestId = null);
        Task<ApiResponse<RiderAvailabilityDto>> SetAvailabilityAsync(Guid riderUserId, bool isOnline);
        Task<ApiResponse<RiderLocationDto>> UpdateRiderLocationAsync(Guid riderUserId, UpdateRiderLocationRequest request);
        Task ClearRiderLocationAsync(Guid riderUserId, string? reason = null);
        Task TouchLastSeenAsync(Guid userId);
    }
}
