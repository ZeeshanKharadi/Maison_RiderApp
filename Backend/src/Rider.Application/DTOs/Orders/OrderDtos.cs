using System.ComponentModel.DataAnnotations;

namespace Rider.Application.DTOs.Orders
{
    /// <summary>Request body for POST /api/Order/AssignOrder</summary>
    public class AssignOrderRequest
    {
        public string time { get; set; }
        public string storeId { get; set; }
        public List<AssignOrderDto> orders { get; set; } = new();
        public List<AssignOrderItemDto> orderItems { get; set; } = new();
    }

    public class AssignOrderDto
    {
        [Required]
        public string orderId { get; set; }
        public string orderNo { get; set; }
        public string orderTypeId { get; set; }
        public string orderState { get; set; }
        public string comment { get; set; }
        public string lastName { get; set; }
        public string firstName { get; set; }
        public string city { get; set; }
        public string street { get; set; }
        public string addressNo { get; set; }
        public string postCode { get; set; }
        public string secondaryAddress { get; set; }
        public double? lat { get; set; }
        public double? lng { get; set; }
        public string phone { get; set; }
        public decimal orderTotal { get; set; }
        public string paymentMethod { get; set; }
        public decimal? cash { get; set; }
        public string orderTime { get; set; }
    }

    public class AssignOrderItemDto
    {
        public long itemId { get; set; }
        public string description { get; set; }
        public string position { get; set; }
        public int quantity { get; set; }
        public string comment { get; set; }
        public string lineNum { get; set; }
        public string size { get; set; }
    }

    public class AssignOrderResultDto
    {
        public long batchId { get; set; }
        public string storeId { get; set; }
        public int ordersSaved { get; set; }
        public int itemsSaved { get; set; }
        public List<string> orderIds { get; set; } = new();
    }

    public class AvailableOrderDto
    {
        public long id { get; set; }
        public string orderId { get; set; }
        public string orderNo { get; set; }
        public string storeId { get; set; }
        public string orderTypeId { get; set; }
        public string orderState { get; set; }
        public string status { get; set; }
        public string comment { get; set; }
        public string firstName { get; set; }
        public string lastName { get; set; }
        public string city { get; set; }
        public string street { get; set; }
        public string addressNo { get; set; }
        public string postCode { get; set; }
        public string secondaryAddress { get; set; }
        public double? lat { get; set; }
        public double? lng { get; set; }
        public string phone { get; set; }
        public decimal orderTotal { get; set; }
        public string paymentMethod { get; set; }
        public decimal? cash { get; set; }
        public string orderTime { get; set; }
        public string batchTime { get; set; }
        public DateTime createdAt { get; set; }
        public List<AssignOrderItemDto> items { get; set; } = new();
    }
}
