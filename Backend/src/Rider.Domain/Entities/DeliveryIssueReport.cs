using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Rider.Domain.Entities
{
    /// <summary>
    /// Rider-reported delivery problem. Does not change order status, COD, or cash.
    /// Triage status is independent of delivery lifecycle.
    /// </summary>
    [Table("DeliveryIssueReports")]
    public class DeliveryIssueReport
    {
        [Key]
        public long Id { get; set; }

        public long AssignedOrderId { get; set; }

        public Guid RiderUserId { get; set; }

        /// <summary>Canonical reason code (see <see cref="Common.DeliveryIssueReasons"/>).</summary>
        [Required]
        [MaxLength(40)]
        public string ReasonCode { get; set; } = "";

        /// <summary>Rider-facing note from the report.</summary>
        [MaxLength(500)]
        public string? Note { get; set; }

        /// <summary>Client idempotency key — retries with the same key return the prior row.</summary>
        [MaxLength(100)]
        public string? RequestId { get; set; }

        /// <summary>New | Acknowledged | Closed</summary>
        [Required]
        [MaxLength(20)]
        public string Status { get; set; } = Common.DeliveryIssueStatuses.New;

        /// <summary>Admin-only internal note. Never returned to riders.</summary>
        [MaxLength(1000)]
        public string? InternalNote { get; set; }

        public Guid? AcknowledgedByUserId { get; set; }
        public DateTime? AcknowledgedAt { get; set; }

        public Guid? ClosedByUserId { get; set; }
        public DateTime? ClosedAt { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        [Timestamp]
        public byte[]? RowVersion { get; set; }

        [ForeignKey(nameof(AssignedOrderId))]
        public AssignedOrder? Order { get; set; }

        [ForeignKey(nameof(RiderUserId))]
        public AppUser? Rider { get; set; }

        [ForeignKey(nameof(AcknowledgedByUserId))]
        public AppUser? AcknowledgedByUser { get; set; }

        [ForeignKey(nameof(ClosedByUserId))]
        public AppUser? ClosedByUser { get; set; }
    }
}
