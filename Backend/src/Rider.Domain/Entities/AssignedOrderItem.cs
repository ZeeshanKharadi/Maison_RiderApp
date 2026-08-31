using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Rider.Domain.Entities
{
    [Table("AssignedOrderItems")]
    public class AssignedOrderItem
    {
        [Key]
        public long Id { get; set; }

        public long AssignedOrderId { get; set; }

        /// <summary>External item/order link from payload (often equals orderId).</summary>
        public long ItemId { get; set; }

        [MaxLength(500)]
        public string Description { get; set; }

        [MaxLength(50)]
        public string Position { get; set; }

        public int Quantity { get; set; }

        [MaxLength(500)]
        public string Comment { get; set; }

        [MaxLength(50)]
        public string LineNum { get; set; }

        [MaxLength(50)]
        public string Size { get; set; }

        [ForeignKey(nameof(AssignedOrderId))]
        public AssignedOrder Order { get; set; }
    }
}
