using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Rider.Domain.Entities
{
    /// <summary>Append-only triage history for a delivery issue report.</summary>
    [Table("DeliveryIssueTriageEvents")]
    public class DeliveryIssueTriageEvent
    {
        [Key]
        public long Id { get; set; }

        public long DeliveryIssueReportId { get; set; }

        public Guid? ActorUserId { get; set; }

        [MaxLength(30)]
        public string ActorType { get; set; } = "Admin";

        /// <summary>Reported | Acknowledged | NoteUpdated | Closed</summary>
        [Required]
        [MaxLength(30)]
        public string Action { get; set; } = "";

        [MaxLength(20)]
        public string? PreviousStatus { get; set; }

        [MaxLength(20)]
        public string? NewStatus { get; set; }

        /// <summary>Admin internal note snapshot at this action (never shown to riders).</summary>
        [MaxLength(1000)]
        public string? InternalNote { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [ForeignKey(nameof(DeliveryIssueReportId))]
        public DeliveryIssueReport? Report { get; set; }

        [ForeignKey(nameof(ActorUserId))]
        public AppUser? Actor { get; set; }
    }
}
