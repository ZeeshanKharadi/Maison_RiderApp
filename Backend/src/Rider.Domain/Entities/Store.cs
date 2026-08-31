using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Rider.Domain.Entities
{
    [Table("Stores")]
    public class Store
    {
        [Key]
        [MaxLength(50)]
        public string StoreId { get; set; }

        [MaxLength(200)]
        public string Name { get; set; }

        public bool IsActive { get; set; } = true;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
