namespace Rider.Application.Helpers
{
    public interface IOtpNotifier
    {
        Task SendOtpAsync(string email, string phoneNumber, string userName, string otpCode);
    }
}
