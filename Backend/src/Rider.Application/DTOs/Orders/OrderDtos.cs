using System.ComponentModel.DataAnnotations;

namespace Rider.Application.DTOs.Orders
{
    /// <summary>Request body for POST /api/Order/AssignOrder</summary>
    public class AssignOrderRequest
    {
        public string time { get; set; }
        public string storeId { get; set; }
        public List<AssignOrderDto> orders { get; set; } = new();
        public List<AssignOrderItemDto> orderItems { get; set; } = new();
    }

    public class AssignOrderDto
    {
        [Required]
        public string orderId { get; set; }
        public string orderNo { get; set; }
        public string orderTypeId { get; set; }
        public string orderState { get; set; }
        public string comment { get; set; }
        public string lastName { get; set; }
        public string firstName { get; set; }
        public string city { get; set; }
        public string street { get; set; }
        public string addressNo { get; set; }
        public string postCode { get; set; }
        public string secondaryAddress { get; set; }
        public double? lat { get; set; }
        public double? lng { get; set; }
        public string phone { get; set; }
        public decimal orderTotal { get; set; }
        public string paymentMethod { get; set; }
        public decimal? cash { get; set; }
        public string orderTime { get; set; }
    }

    public class AssignOrderItemDto
    {
        public long itemId { get; set; }
        public string description { get; set; }
        public string position { get; set; }
        public int quantity { get; set; }
        public string comment { get; set; }
        public string lineNum { get; set; }
        public string size { get; set; }
    }

    public class AssignOrderResultDto
    {
        public long batchId { get; set; }
        public string storeId { get; set; }
        public int ordersSaved { get; set; }
        public int itemsSaved { get; set; }
        public List<string> orderIds { get; set; } = new();
    }

    /// <summary>Same payload as AssignOrder, plus the rider to dispatch to.</summary>
    public class AssignOrderToRiderRequest : AssignOrderRequest
    {
        /// <summary>Rider worker id (e.g. RD-9921).</summary>
        [Required]
        public string workerId { get; set; }
    }

    public class AssignOrderToRiderResultDto : AssignOrderResultDto
    {
        public string workerId { get; set; }
        public Guid assignedToUserId { get; set; }
        public string riderName { get; set; }
    }

    public class AvailableOrderDto
    {
        public long id { get; set; }
        public string orderId { get; set; }
        public string orderNo { get; set; }
        /// <summary>Display order number (same as orderNo; distinct from external orderId).</summary>
        public string displayOrderNo { get; set; }
        public string storeId { get; set; }
        public double? storeLat { get; set; }
        public double? storeLng { get; set; }
        public string orderTypeId { get; set; }
        public string orderState { get; set; }
        public string status { get; set; }
        public string comment { get; set; }
        public string firstName { get; set; }
        public string lastName { get; set; }
        public string city { get; set; }
        public string street { get; set; }
        public string addressNo { get; set; }
        public string postCode { get; set; }
        public string secondaryAddress { get; set; }
        public double? lat { get; set; }
        public double? lng { get; set; }
        public string phone { get; set; }
        public decimal orderTotal { get; set; }
        public string paymentMethod { get; set; }
        public decimal? cash { get; set; }
        public string orderTime { get; set; }
        public string batchTime { get; set; }
        public DateTime createdAt { get; set; }
        public DateTime? acceptedAt { get; set; }
        public DateTime? pickedUpAt { get; set; }
        public DateTime? completedAt { get; set; }
        public decimal? cashCollected { get; set; }
        public decimal? expectedCash { get; set; }
        public string? cashCollectedReason { get; set; }
        public DateTime? cashHandedOverAt { get; set; }
        public decimal? cashHandedOverAmount { get; set; }
        public string? cashSemanticsNote { get; set; }
        public bool isDirectAssignment { get; set; }
        public Guid? acceptedByUserId { get; set; }
        public List<AssignOrderItemDto> items { get; set; } = new();
        /// <summary>Rider-safe issue reports for this order (no internal admin notes).</summary>
        public List<DeliveryIssueReportDto> issueReports { get; set; } = new();

        /// <summary>Controlled failed-delivery request (independent of issue triage Close).</summary>
        public OrderFailureDto? failure { get; set; }
    }

    /// <summary>Failed-delivery / return-to-store progress for rider and admin UIs.</summary>
    public class OrderFailureDto
    {
        public string? requestStatus { get; set; }
        public string? reasonCode { get; set; }
        public string? reasonLabel { get; set; }
        public string? note { get; set; }
        public string? requestId { get; set; }
        public long? issueReportId { get; set; }
        public DateTime? requestedAt { get; set; }
        public DateTime? decidedAt { get; set; }
        public string? decisionNote { get; set; }
        public string? statusBeforeReturn { get; set; }
        public DateTime? riderReturnedAt { get; set; }
        public DateTime? storeReceivedAt { get; set; }
        /// <summary>True when cash was collected — manager must use cash handover, not treat as earnings.</summary>
        public bool cashCollectedWarning { get; set; }
        public decimal? cashCollected { get; set; }
        public decimal? expectedCash { get; set; }
    }

    /// <summary>POST /api/Order/AcknowledgeCancellations — durable cancel catch-up ack.</summary>
    public class AcknowledgeCancellationsRequest
    {
        public List<long> assignedOrderIds { get; set; } = new();
    }

    public class UpdateOrderStatusRequest
    {
        /// <summary>Accepted | NavigatingToPickup | ArrivedAtPickup | InProgress | OnTheWay | ArrivedAtCustomer | Delivered | Completed</summary>
        [Required]
        public string status { get; set; }

        public decimal? cashCollected { get; set; }
        public string? cashCollectedReason { get; set; }
        public string? requestId { get; set; }
        public string? reason { get; set; }
    }

    public class RejectOrderRequest
    {
        public string? reason { get; set; }
        public string? requestId { get; set; }
    }

    /// <summary>POST /api/Order/{id}/report-issue</summary>
    public class ReportDeliveryIssueRequest
    {
        /// <summary>CustomerUnreachable | CustomerRefused | AddressIssue | Other</summary>
        [Required]
        public string reason { get; set; } = "";

        /// <summary>Required when reason is Other; optional otherwise.</summary>
        public string? note { get; set; }

        public string? requestId { get; set; }
    }

    /// <summary>POST /api/Order/{id}/request-failed-delivery — same reasons as report-issue; starts controlled failure flow.</summary>
    public class RequestFailedDeliveryRequest
    {
        [Required]
        public string reason { get; set; } = "";

        public string? note { get; set; }

        public string? requestId { get; set; }
    }

    public class DeliveryIssueReportDto
    {
        public long id { get; set; }
        public long assignedOrderId { get; set; }
        public string orderId { get; set; } = "";
        public string orderNo { get; set; } = "";
        public string storeId { get; set; } = "";
        public string reasonCode { get; set; } = "";
        public string reasonLabel { get; set; } = "";
        public string? note { get; set; }
        public Guid riderUserId { get; set; }
        public string? requestId { get; set; }
        public DateTime createdAt { get; set; }
        /// <summary>Order status at report time (unchanged by the report).</summary>
        public string orderStatus { get; set; } = "";
        /// <summary>New | Acknowledged | Closed — triage only; not delivery status.</summary>
        public string status { get; set; } = "";
        public string statusLabel { get; set; } = "";
        public DateTime? acknowledgedAt { get; set; }
        public DateTime? closedAt { get; set; }
        // Intentionally no internalNote — riders must never see admin notes.
    }

    public class SetAvailabilityRequest
    {
        public bool isOnline { get; set; }
    }

    /// <summary>Result of POST /api/Order/availability for the JWT rider only.</summary>
    public class RiderAvailabilityDto
    {
        public bool isOnline { get; set; }
        /// <summary>UTC start of the open availability interval when online; null when offline.</summary>
        public DateTime? currentOnlineStartedAt { get; set; }
    }

    public class UpdateRiderLocationRequest
    {
        public double latitude { get; set; }
        public double longitude { get; set; }
        public double? accuracyMeters { get; set; }
        public DateTime? recordedAt { get; set; }
    }

    public class RiderLocationDto
    {
        public Guid riderUserId { get; set; }
        public string storeId { get; set; }
        public double latitude { get; set; }
        public double longitude { get; set; }
        public DateTime locationUpdatedAt { get; set; }
        public int activeOrderCount { get; set; }
        public string deliveryStatus { get; set; }
    }

    public class RiderPerformanceDto
    {
        public int completedCount { get; set; }
        public double? avgDurationMinutes { get; set; }
        public double onlineHours { get; set; }
        public decimal codCollected { get; set; }
        public decimal codOutstanding { get; set; }
        public DateTime? from { get; set; }
        public DateTime? to { get; set; }
    }
}
