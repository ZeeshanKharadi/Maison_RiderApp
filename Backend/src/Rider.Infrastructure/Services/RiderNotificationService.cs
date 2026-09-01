using Rider.Application.DTOs.Notifications;
using Rider.Application.Interfaces;
using Rider.Application.Interfaces.Repositories;
using Rider.Domain.Common;
using Rider.Domain.Entities;

namespace Rider.Infrastructure.Services
{
    public class RiderNotificationService : IRiderNotificationService
    {
        private readonly IUnitOfWork _unitOfWork;
        private readonly IFcmPushService _fcm;

        public RiderNotificationService(IUnitOfWork unitOfWork, IFcmPushService fcm)
        {
            _unitOfWork = unitOfWork;
            _fcm = fcm;
        }

        public async Task<ApiResponse<List<RiderNotificationDto>>> ListForUserAsync(Guid userId, int take = 50)
        {
            var rows = await _unitOfWork.RiderNotificationRepository.ListForUserAsync(userId, take);
            return Ok(rows.Select(Map).ToList(), "Notifications");
        }

        public async Task<ApiResponse<string>> MarkReadAsync(Guid userId, long notificationId)
        {
            var row = await _unitOfWork.RiderNotificationRepository.GetForUserAsync(userId, notificationId);
            if (row == null)
                return Fail("Notification not found");

            row.IsRead = true;
            await _unitOfWork.RiderNotificationRepository.UpdateAsync(row);
            await _unitOfWork.SaveChangesAsync();
            return Ok("", "Marked read");
        }

        public async Task<ApiResponse<string>> MarkAllReadAsync(Guid userId)
        {
            var rows = await _unitOfWork.RiderNotificationRepository.ListForUserAsync(userId, 200);
            foreach (var row in rows.Where(r => !r.IsRead))
            {
                row.IsRead = true;
                await _unitOfWork.RiderNotificationRepository.UpdateAsync(row);
            }

            await _unitOfWork.SaveChangesAsync();
            return Ok("", "All marked read");
        }

        public async Task NotifyDirectAssignmentAsync(
            Guid riderUserId, string orderId, long? assignedOrderId, string storeId, decimal orderTotal)
        {
            await CreateAndPushAsync(
                riderUserId,
                "orders",
                "New delivery assigned to you",
                $"Order {orderId} from Store {storeId} · Rs {orderTotal:N2}",
                orderId,
                assignedOrderId,
                "high");
        }

        public async Task NotifyOpenPoolOrderAsync(
            string orderId, long? assignedOrderId, string storeId, decimal orderTotal)
        {
            var riders = await _unitOfWork.UserRepository.ListActiveRidersForStoreAsync(storeId);
            foreach (var rider in riders)
            {
                await CreateAndPushAsync(
                    rider.UserId,
                    "orders",
                    "New delivery nearby",
                    $"Order {orderId} · Store {storeId} · Rs {orderTotal:N2}",
                    orderId,
                    assignedOrderId,
                    "high");
            }
        }

        private async Task CreateAndPushAsync(
            Guid userId,
            string category,
            string title,
            string description,
            string orderId,
            long? assignedOrderId,
            string priority)
        {
            var row = await CreateAsync(
                userId,
                category,
                title,
                description,
                orderId,
                assignedOrderId,
                priority);

            await _fcm.SendToUserAsync(
                userId,
                title,
                description,
                new Dictionary<string, string>
                {
                    ["category"] = category,
                    ["orderId"] = orderId ?? "",
                    ["notificationId"] = row.Id.ToString()
                });
        }

        private async Task<RiderNotification> CreateAsync(
            Guid userId,
            string category,
            string title,
            string description,
            string orderId,
            long? assignedOrderId,
            string priority)
        {
            var row = new RiderNotification
            {
                UserId = userId,
                Category = category,
                Title = title,
                Description = description,
                OrderId = orderId,
                AssignedOrderId = assignedOrderId,
                Priority = priority,
                IsRead = false,
                CreatedAt = DateTime.UtcNow
            };
            await _unitOfWork.RiderNotificationRepository.AddAsync(row);
            await _unitOfWork.SaveChangesAsync();
            return row;
        }

        private static RiderNotificationDto Map(RiderNotification n) => new()
        {
            id = n.Id,
            category = n.Category,
            title = n.Title,
            description = n.Description,
            orderId = n.OrderId,
            assignedOrderId = n.AssignedOrderId,
            priority = n.Priority,
            read = n.IsRead,
            createdAt = n.CreatedAt.ToString("o")
        };

        private static ApiResponse<T> Ok<T>(T data, string message) => new(true, message, data);
        private static ApiResponse<string> Fail(string message) => new(false, message, null);
    }
}
