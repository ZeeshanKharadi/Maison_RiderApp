using System.ComponentModel.DataAnnotations;
using Rider.Application.DTOs.Orders;

namespace Rider.Application.DTOs.Admin
{
    public class AdminActor
    {
        public Guid UserId { get; set; }
        public string WorkerId { get; set; }
        public string Name { get; set; }
        public List<string> Roles { get; set; } = new();
        public string StoreId { get; set; }
        public bool IsHeadOffice => Roles.Contains("Administrator");
        public bool IsManager => Roles.Contains("Manager");
    }

    public class AdminLiveRiderDto
    {
        public Guid riderUserId { get; set; }
        public string workerId { get; set; }
        public string name { get; set; }
        public string storeId { get; set; }
        public string storeName { get; set; }
        public bool isOnline { get; set; }
        public int activeOrderCount { get; set; }
        public string deliveryStatus { get; set; }
        public double? latitude { get; set; }
        public double? longitude { get; set; }
        public DateTime? locationUpdatedAt { get; set; }
        public bool hasLocation { get; set; }
        public bool isStale { get; set; }
        public int staleAfterSeconds { get; set; }
    }

    public class AdminRiderDto
    {
        public Guid userId { get; set; }
        public string workerId { get; set; }
        public string name { get; set; }
        public string email { get; set; }
        public string phone { get; set; }
        public string storeId { get; set; }
        public string storeName { get; set; }
        public bool isActive { get; set; }
        public bool isVerified { get; set; }
        public bool isOnline { get; set; }
        public DateTime? lastSeenAt { get; set; }
        public DateTime createdAt { get; set; }
        public List<string> roles { get; set; } = new();
    }

    public class CreateRiderRequest
    {
        [Required]
        public string workerId { get; set; } = "";

        [Required]
        public string name { get; set; } = "";

        public string? phone { get; set; }
        public string? email { get; set; }
        public string? storeId { get; set; }

        /// <summary>If set, rider is verified and can log in immediately. Otherwise they use register/OTP.</summary>
        public string? password { get; set; }
    }

    public class UpdateRiderRequest
    {
        public string? name { get; set; }
        public string? phone { get; set; }
        public string? email { get; set; }
        public string? storeId { get; set; }
        public bool? isActive { get; set; }
    }

    public class ResetRiderPasswordRequest
    {
        [Required]
        public string password { get; set; } = "";
    }

    public class AdminOrderListDto
    {
        public long id { get; set; }
        public string orderId { get; set; }
        public string orderNo { get; set; }
        public string storeId { get; set; }
        public string status { get; set; }
        public string firstName { get; set; }
        public string lastName { get; set; }
        public string phone { get; set; }
        public string city { get; set; }
        public string street { get; set; }
        public string addressNo { get; set; }
        public decimal orderTotal { get; set; }
        public string paymentMethod { get; set; }
        public decimal? cash { get; set; }
        public decimal? cashCollected { get; set; }
        public decimal? expectedCash { get; set; }
        public decimal? cashHandedOverAmount { get; set; }
        public DateTime? cashHandedOverAt { get; set; }
        public string? cashSemanticsNote { get; set; }
        public bool isDirectAssignment { get; set; }
        public string cancelReason { get; set; }
        public Guid? acceptedByUserId { get; set; }
        public string acceptedByName { get; set; }
        public string acceptedByWorkerId { get; set; }
        public DateTime createdAt { get; set; }
        public DateTime? acceptedAt { get; set; }
        public DateTime? pickedUpAt { get; set; }
        public DateTime? completedAt { get; set; }
        public DateTime? updatedAt { get; set; }
    }

    public class AdminOrderDetailDto : AdminOrderListDto
    {
        public string orderTypeId { get; set; }
        public string orderState { get; set; }
        public string comment { get; set; }
        public string postCode { get; set; }
        public string secondaryAddress { get; set; }
        public double? lat { get; set; }
        public double? lng { get; set; }
        public string orderTime { get; set; }
        public string batchTime { get; set; }
        public List<AssignOrderItemDto> items { get; set; } = new();
        public List<AdminOrderLifecycleEventDto> statusHistory { get; set; } = new();
    }

    public class AdminOrderLifecycleEventDto
    {
        public string status { get; set; }
        public string previousStatus { get; set; }
        public string actorType { get; set; }
        public string reason { get; set; }
        public DateTime at { get; set; }
    }

    public class AdminOrderQuery
    {
        public string storeId { get; set; }
        public string status { get; set; }
        public Guid? riderId { get; set; }
        public DateTime? from { get; set; }
        public DateTime? to { get; set; }
    }

    public class CashCollectedRequest
    {
        public decimal? cashCollected { get; set; }
    }

    public class CancelOrderRequest
    {
        [Required]
        public string reason { get; set; } = "";
    }

    public class CashHandoverRequest
    {
        /// <summary>
        /// Incremental amount to hand over this request (added to CashHandedOverAmount).
        /// Null = hand over remaining collected balance.
        /// </summary>
        public decimal? amount { get; set; }

        /// <summary>Idempotency key — retries with same key return prior result.</summary>
        public string? requestId { get; set; }

        /// <summary>Required when correcting a prior handover total downward/upward via admin override path.</summary>
        public string? reason { get; set; }
    }

    public class AdminNotificationDto
    {
        public long id { get; set; }
        public string storeId { get; set; }
        public string category { get; set; }
        public string title { get; set; }
        public string body { get; set; }
        public string orderId { get; set; }
        public long? assignedOrderId { get; set; }
        public bool isRead { get; set; }
        public DateTime createdAt { get; set; }
    }

    public class StoreDto
    {
        public string storeId { get; set; }
        public string name { get; set; }
        public bool isActive { get; set; }
    }

    public class PayoutSettingsDto
    {
        /// <summary>fixed | percent</summary>
        public string mode { get; set; } = "fixed";
        public decimal fixedFee { get; set; }
        public decimal percent { get; set; }
    }

    public class PaymentsDashboardDto
    {
        public DateTime from { get; set; }
        public DateTime to { get; set; }
        public string storeId { get; set; }
        public int orderCount { get; set; }
        public decimal totalSales { get; set; }
        public decimal cashTotal { get; set; }
        public decimal cardTotal { get; set; }
        public decimal otherTotal { get; set; }
        public decimal cashToCollect { get; set; }
        public decimal cashCollected { get; set; }
        public List<PaymentByDayDto> byDay { get; set; } = new();
        public List<PaymentByStoreDto> byStore { get; set; } = new();
        public List<RiderSettlementDto> byRider { get; set; } = new();
    }

    public class PaymentByDayDto
    {
        public string date { get; set; }
        public int orderCount { get; set; }
        public decimal total { get; set; }
        public decimal cash { get; set; }
        public decimal card { get; set; }
        public decimal other { get; set; }
    }

    public class PaymentByStoreDto
    {
        public string storeId { get; set; }
        public int orderCount { get; set; }
        public decimal total { get; set; }
        public decimal cash { get; set; }
        public decimal card { get; set; }
        public decimal other { get; set; }
    }

    public class RiderSettlementDto
    {
        public Guid riderId { get; set; }
        public string workerId { get; set; }
        public string name { get; set; }
        public string storeId { get; set; }
        public int deliveryCount { get; set; }
        public int cancelledCount { get; set; }
        public decimal cashHeld { get; set; }
        public decimal payoutDue { get; set; }
        public decimal salesTotal { get; set; }
    }

    public class OrdersPerRiderDayDto
    {
        public string date { get; set; }
        public Guid riderId { get; set; }
        public string workerId { get; set; }
        public string name { get; set; }
        public int completed { get; set; }
        public int cancelled { get; set; }
        public int accepted { get; set; }
        public int inProgress { get; set; }
    }

    public class StatusSummaryDto
    {
        public int available { get; set; }
        public int accepted { get; set; }
        public int inProgress { get; set; }
        public int completed { get; set; }
        public int cancelled { get; set; }
        public int total { get; set; }
    }

    public class AvgDeliveryTimeDto
    {
        public int sampleCount { get; set; }
        public double? avgMinutes { get; set; }
    }

    public class ReportsDto
    {
        public StatusSummaryDto status { get; set; }
        public AvgDeliveryTimeDto avgDeliveryTime { get; set; }
        public List<OrdersPerRiderDayDto> perRiderPerDay { get; set; } = new();
    }

    public class LiveBoardSummaryDto
    {
        public int available { get; set; }
        public int accepted { get; set; }
        public int inProgress { get; set; }
        public int completedToday { get; set; }
        public int cancelledToday { get; set; }
        public int onlineRiders { get; set; }
        public decimal cashToCollectToday { get; set; }
    }

    public class AdminOrderRejectionDto
    {
        public long id { get; set; }
        public long assignedOrderId { get; set; }
        public string orderId { get; set; }
        public string orderNo { get; set; }
        public string storeId { get; set; }
        public Guid riderUserId { get; set; }
        public string riderWorkerId { get; set; }
        public string riderName { get; set; }
        public string reason { get; set; }
        public bool isDirectAssignment { get; set; }
        public DateTime createdAt { get; set; }
    }
}
