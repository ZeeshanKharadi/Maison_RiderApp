namespace Rider.Domain.Entities
{
    public class UserDeviceToken
    {
        public long Id { get; set; }
        public Guid UserId { get; set; }
        public string Token { get; set; } = "";
        public string Platform { get; set; } = "android";
        public DateTime UpdatedAt { get; set; }
    }
}
