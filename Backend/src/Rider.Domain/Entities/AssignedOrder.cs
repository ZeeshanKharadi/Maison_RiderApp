using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Rider.Domain.Entities
{
    /// <summary>
    /// Delivery order pushed via AssignOrder. Only these rows are shown to riders.
    /// </summary>
    [Table("AssignedOrders")]
    public class AssignedOrder
    {
        [Key]
        public long Id { get; set; }

        public long BatchId { get; set; }

        [MaxLength(50)]
        public string OrderId { get; set; }

        [MaxLength(50)]
        public string OrderNo { get; set; }

        [MaxLength(20)]
        public string OrderTypeId { get; set; }

        [MaxLength(50)]
        public string OrderState { get; set; }

        [MaxLength(500)]
        public string Comment { get; set; }

        [MaxLength(100)]
        public string LastName { get; set; }

        [MaxLength(100)]
        public string FirstName { get; set; }

        [MaxLength(100)]
        public string City { get; set; }

        [MaxLength(200)]
        public string Street { get; set; }

        [MaxLength(50)]
        public string AddressNo { get; set; }

        [MaxLength(50)]
        public string PostCode { get; set; }

        [MaxLength(200)]
        public string SecondaryAddress { get; set; }

        public double? Lat { get; set; }

        public double? Lng { get; set; }

        [MaxLength(50)]
        public string Phone { get; set; }

        public decimal OrderTotal { get; set; }

        [MaxLength(20)]
        public string PaymentMethod { get; set; }

        public decimal? Cash { get; set; }

        [MaxLength(50)]
        public string OrderTime { get; set; }

        /// <summary>Available | Accepted | NavigatingToPickup | ArrivedAtPickup | InProgress | OnTheWay | ArrivedAtCustomer | Delivered | Completed | Cancelled</summary>
        [MaxLength(30)]
        public string Status { get; set; } = "Available";

        public Guid? AcceptedByUserId { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime? UpdatedAt { get; set; }

        public DateTime? AcceptedAt { get; set; }

        public DateTime? PickedUpAt { get; set; }

        public DateTime? CompletedAt { get; set; }

        /// <summary>Cash the rider reported collecting from the customer (not store handover, not earnings).</summary>
        public decimal? CashCollected { get; set; }

        /// <summary>Expected COD/cash due from customer (from POS Cash when cash method).</summary>
        public decimal? ExpectedCash { get; set; }

        [MaxLength(500)]
        public string? CashCollectedReason { get; set; }

        public DateTime? CashHandedOverAt { get; set; }

        public Guid? CashHandedOverByUserId { get; set; }

        public decimal? CashHandedOverAmount { get; set; }

        /// <summary>e.g. LegacyCashCollected_Ambiguous | RiderCollected | AdminCorrected | HandedOver</summary>
        [MaxLength(100)]
        public string? CashSemanticsNote { get; set; }

        [MaxLength(500)]
        public string? CancelReason { get; set; }

        public bool IsDirectAssignment { get; set; }

        /// <summary>Idempotency key for the last successful cash handover request.</summary>
        [MaxLength(100)]
        public string? HandoverRequestId { get; set; }

        /// <summary>Pending | Rejected | ReturnApproved | RiderReturned | StoreReceived</summary>
        [MaxLength(30)]
        public string? FailureRequestStatus { get; set; }

        [MaxLength(40)]
        public string? FailureReasonCode { get; set; }

        [MaxLength(500)]
        public string? FailureNote { get; set; }

        [MaxLength(100)]
        public string? FailureRequestId { get; set; }

        public long? FailureIssueReportId { get; set; }

        public DateTime? FailureRequestedAt { get; set; }

        public DateTime? FailureDecidedAt { get; set; }

        public Guid? FailureDecidedByUserId { get; set; }

        [MaxLength(500)]
        public string? FailureDecisionNote { get; set; }

        /// <summary>Order status when return was approved (for audit; not restored on reject).</summary>
        [MaxLength(30)]
        public string? StatusBeforeReturn { get; set; }

        public DateTime? RiderReturnedAt { get; set; }

        public DateTime? StoreReceivedAt { get; set; }

        public Guid? StoreReceivedByUserId { get; set; }

        [Timestamp]
        public byte[]? RowVersion { get; set; }

        [ForeignKey(nameof(BatchId))]
        public AssignedOrderBatch Batch { get; set; }

        [ForeignKey(nameof(AcceptedByUserId))]
        public AppUser AcceptedByUser { get; set; }

        public ICollection<AssignedOrderItem> Items { get; set; }
    }
}
