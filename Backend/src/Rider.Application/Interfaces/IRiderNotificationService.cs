using Rider.Application.DTOs.Notifications;
using Rider.Domain.Common;

namespace Rider.Application.Interfaces
{
    public interface IRiderNotificationService
    {
        Task<ApiResponse<List<RiderNotificationDto>>> ListForUserAsync(Guid userId, int take = 50);
        Task<ApiResponse<string>> MarkReadAsync(Guid userId, long notificationId);
        Task<ApiResponse<string>> MarkAllReadAsync(Guid userId);

        /// <summary>Order dispatched to a specific rider (AssignOrderToRider).</summary>
        Task NotifyDirectAssignmentAsync(
            Guid riderUserId, string orderId, long? assignedOrderId, string storeId, decimal orderTotal);

        /// <summary>New open-pool order for riders serving this store.</summary>
        Task NotifyOpenPoolOrderAsync(
            string orderId, long? assignedOrderId, string storeId, decimal orderTotal);

        /// <summary>Admin/Swagger test: send inbox + FCM to one user.</summary>
        Task<ApiResponse<SendNotificationResultDto>> SendTestToUserAsync(SendNotificationRequest request);

        /// <summary>Admin/Swagger test: send inbox + FCM to active riders (optional store).</summary>
        Task<ApiResponse<SendNotificationResultDto>> BroadcastTestAsync(BroadcastNotificationRequest request);
    }
}
