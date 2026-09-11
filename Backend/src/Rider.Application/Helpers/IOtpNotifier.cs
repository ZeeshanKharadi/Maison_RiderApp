namespace Rider.Application.Helpers
{
    public interface IOtpNotifier
    {
        /// <summary>True when SMTP MailServer + User are configured.</summary>
        bool IsConfigured { get; }

        /// <summary>Returns true only when the OTP email was successfully sent via SMTP.</summary>
        Task<bool> SendOtpAsync(string email, string phoneNumber, string userName, string otpCode);
    }
}
