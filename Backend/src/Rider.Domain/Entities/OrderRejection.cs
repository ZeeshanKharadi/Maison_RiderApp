using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Rider.Domain.Entities
{
    [Table("OrderRejections")]
    public class OrderRejection
    {
        [Key]
        public long Id { get; set; }

        public long AssignedOrderId { get; set; }

        public Guid RiderUserId { get; set; }

        [MaxLength(500)]
        public string? Reason { get; set; }

        public bool IsDirectAssignment { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [ForeignKey(nameof(AssignedOrderId))]
        public AssignedOrder? Order { get; set; }

        [ForeignKey(nameof(RiderUserId))]
        public AppUser? Rider { get; set; }
    }
}
