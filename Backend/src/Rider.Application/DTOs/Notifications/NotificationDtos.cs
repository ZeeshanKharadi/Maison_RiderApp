namespace Rider.Application.DTOs.Notifications
{
    public class RiderNotificationDto
    {
        public long id { get; set; }
        public string category { get; set; }
        public string title { get; set; }
        public string description { get; set; }
        public string orderId { get; set; }
        public long? assignedOrderId { get; set; }
        public string priority { get; set; }
        public bool read { get; set; }
        public string createdAt { get; set; }
    }
}
