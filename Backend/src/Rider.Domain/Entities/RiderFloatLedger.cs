using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Rider.Domain.Entities
{
    [Table("RiderFloatLedger")]
    public class RiderFloatLedger
    {
        [Key]
        public long Id { get; set; }

        public Guid RiderUserId { get; set; }

        [MaxLength(50)]
        public string StoreId { get; set; } = "";

        public decimal Amount { get; set; }

        /// <summary>Issue | Return</summary>
        [MaxLength(20)]
        public string EntryType { get; set; } = "";

        /// <summary>Issue: PendingAck | Acknowledged. Return: null.</summary>
        [MaxLength(20)]
        public string? Status { get; set; }

        public DateTime? AcknowledgedAt { get; set; }
        public Guid? AcknowledgedByUserId { get; set; }

        [MaxLength(100)]
        public string? AckRequestId { get; set; }

        public Guid ActorUserId { get; set; }

        [MaxLength(500)]
        public string? Reason { get; set; }

        [MaxLength(100)]
        public string RequestId { get; set; } = "";

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [ForeignKey(nameof(RiderUserId))]
        public AppUser? RiderUser { get; set; }

        [ForeignKey(nameof(ActorUserId))]
        public AppUser? ActorUser { get; set; }
    }

    public static class FloatEntryTypes
    {
        public const string Issue = "Issue";
        public const string Return = "Return";
    }

    public static class FloatIssueStatuses
    {
        public const string PendingAck = "PendingAck";
        public const string Acknowledged = "Acknowledged";
    }
}
