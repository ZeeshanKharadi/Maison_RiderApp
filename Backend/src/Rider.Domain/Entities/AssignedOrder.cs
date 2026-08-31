using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Rider.Domain.Entities
{
    /// <summary>
    /// Delivery order pushed via AssignOrder. Only these rows are shown to riders.
    /// </summary>
    [Table("AssignedOrders")]
    public class AssignedOrder
    {
        [Key]
        public long Id { get; set; }

        public long BatchId { get; set; }

        [MaxLength(50)]
        public string OrderId { get; set; }

        [MaxLength(50)]
        public string OrderNo { get; set; }

        [MaxLength(20)]
        public string OrderTypeId { get; set; }

        [MaxLength(50)]
        public string OrderState { get; set; }

        [MaxLength(500)]
        public string Comment { get; set; }

        [MaxLength(100)]
        public string LastName { get; set; }

        [MaxLength(100)]
        public string FirstName { get; set; }

        [MaxLength(100)]
        public string City { get; set; }

        [MaxLength(200)]
        public string Street { get; set; }

        [MaxLength(50)]
        public string AddressNo { get; set; }

        [MaxLength(50)]
        public string PostCode { get; set; }

        [MaxLength(200)]
        public string SecondaryAddress { get; set; }

        public double? Lat { get; set; }

        public double? Lng { get; set; }

        [MaxLength(50)]
        public string Phone { get; set; }

        public decimal OrderTotal { get; set; }

        [MaxLength(20)]
        public string PaymentMethod { get; set; }

        public decimal? Cash { get; set; }

        [MaxLength(50)]
        public string OrderTime { get; set; }

        /// <summary>Available | Accepted | InProgress | Completed | Cancelled</summary>
        [MaxLength(30)]
        public string Status { get; set; } = "Available";

        public Guid? AcceptedByUserId { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime? UpdatedAt { get; set; }

        public DateTime? AcceptedAt { get; set; }

        public DateTime? PickedUpAt { get; set; }

        public DateTime? CompletedAt { get; set; }

        public decimal? CashCollected { get; set; }

        [ForeignKey(nameof(BatchId))]
        public AssignedOrderBatch Batch { get; set; }

        [ForeignKey(nameof(AcceptedByUserId))]
        public AppUser AcceptedByUser { get; set; }

        public ICollection<AssignedOrderItem> Items { get; set; }
    }
}
