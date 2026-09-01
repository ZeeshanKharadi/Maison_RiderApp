using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Rider.Domain.Entities
{
    [Table("RiderNotifications")]
    public class RiderNotification
    {
        [Key]
        public long Id { get; set; }

        public Guid UserId { get; set; }

        [MaxLength(30)]
        public string Category { get; set; } = "orders";

        [MaxLength(200)]
        public string Title { get; set; }

        [MaxLength(500)]
        public string Description { get; set; }

        [MaxLength(50)]
        public string? OrderId { get; set; }

        public long? AssignedOrderId { get; set; }

        [MaxLength(20)]
        public string Priority { get; set; } = "high";

        public bool IsRead { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [ForeignKey(nameof(UserId))]
        public AppUser? User { get; set; }
    }
}
