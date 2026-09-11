using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Rider.Domain.Entities
{
    [Table("AdminNotifications")]
    public class AdminNotification
    {
        [Key]
        public long Id { get; set; }

        [MaxLength(50)]
        public string? StoreId { get; set; }

        [MaxLength(40)]
        public string Category { get; set; } = "orders";

        [MaxLength(200)]
        public string Title { get; set; } = "";

        [MaxLength(500)]
        public string Body { get; set; } = "";

        [MaxLength(50)]
        public string? OrderId { get; set; }

        public long? AssignedOrderId { get; set; }

        public bool IsRead { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
