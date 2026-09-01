using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Rider.Domain.Entities
{
    /// <summary>
    /// One AssignOrder API call (batch header: time + storeId).
    /// </summary>
    [Table("AssignedOrderBatches")]
    public class AssignedOrderBatch
    {
        [Key]
        public long Id { get; set; }

        [MaxLength(50)]
        public string Time { get; set; }

        [MaxLength(50)]
        public string StoreId { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public Store Store { get; set; }

        public ICollection<AssignedOrder> Orders { get; set; }
    }
}
