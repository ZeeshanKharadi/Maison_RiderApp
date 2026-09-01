namespace Rider.Application.DTOs.Notifications
{
    public class RegisterDeviceTokenRequest
    {
        public string token { get; set; } = "";
        public string platform { get; set; } = "android";
    }
}
