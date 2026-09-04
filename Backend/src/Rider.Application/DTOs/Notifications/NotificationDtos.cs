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

    /// <summary>Swagger / admin test: push to one rider.</summary>
    public class SendNotificationRequest
    {
        public Guid userId { get; set; }
        public string title { get; set; } = "Test notification";
        public string body { get; set; } = "Hello from Maison Rider API";
        public string category { get; set; } = "system";
        public string priority { get; set; } = "high";
    }

    /// <summary>Swagger / admin test: push to all active riders (optional store filter).</summary>
    public class BroadcastNotificationRequest
    {
        /// <summary>Optional. If set, only riders for this store. If empty, all active riders.</summary>
        public string storeId { get; set; }
        public string title { get; set; } = "Broadcast test";
        public string body { get; set; } = "Hello from Maison Rider API (broadcast)";
        public string category { get; set; } = "system";
        public string priority { get; set; } = "high";
    }

    public class SendNotificationResultDto
    {
        public int recipientCount { get; set; }
        public List<Guid> userIds { get; set; } = new();
        public string message { get; set; }
    }
}
