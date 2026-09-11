using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Rider.Domain.Entities
{
    [Table("OrderLifecycleAudits")]
    public class OrderLifecycleAudit
    {
        [Key]
        public long Id { get; set; }

        public long AssignedOrderId { get; set; }

        public Guid? ActorUserId { get; set; }

        [MaxLength(30)]
        public string ActorType { get; set; } = "Rider";

        [MaxLength(30)]
        public string? PreviousStatus { get; set; }

        [MaxLength(30)]
        public string NewStatus { get; set; } = "";

        [MaxLength(500)]
        public string? Reason { get; set; }

        [MaxLength(100)]
        public string? RequestId { get; set; }

        [Column(TypeName = "decimal(18,2)")]
        public decimal? CashCollected { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [ForeignKey(nameof(AssignedOrderId))]
        public AssignedOrder? Order { get; set; }
    }
}
