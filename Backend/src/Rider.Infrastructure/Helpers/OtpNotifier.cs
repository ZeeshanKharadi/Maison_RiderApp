using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Rider.Application.Helpers;

namespace Rider.Infrastructure.Helpers
{
    public class OtpNotifier : IOtpNotifier
    {
        private readonly IConfiguration _configuration;
        private readonly ILogger<OtpNotifier> _logger;

        public OtpNotifier(IConfiguration configuration, ILogger<OtpNotifier> logger)
        {
            _configuration = configuration;
            _logger = logger;
        }

        public bool IsConfigured
        {
            get
            {
                var mailServer = _configuration["EmailSettings:MailServer"];
                var user = _configuration["EmailSettings:User"];
                return !string.IsNullOrWhiteSpace(mailServer) && !string.IsNullOrWhiteSpace(user);
            }
        }

        public async Task<bool> SendOtpAsync(string email, string phoneNumber, string userName, string otpCode)
        {
            var mailServer = _configuration["EmailSettings:MailServer"];
            var user = _configuration["EmailSettings:User"];
            var password = _configuration["EmailSettings:Password"];
            var port = int.TryParse(_configuration["EmailSettings:SMTPPort"], out var p) ? p : 587;

            if (string.IsNullOrWhiteSpace(mailServer) || string.IsNullOrWhiteSpace(user) || string.IsNullOrWhiteSpace(email))
            {
                _logger.LogWarning("OTP email not sent: SMTP not configured or recipient missing for user {User}", userName ?? email);
                return false;
            }

            try
            {
                using var client = new SmtpClient(mailServer, port)
                {
                    Credentials = new NetworkCredential(user, password),
                    EnableSsl = true
                };

                var mailMessage = new MailMessage
                {
                    From = new MailAddress(user),
                    Subject = "Your One-Time Password (OTP) for Verification",
                    Body = "Dear User,<br/><br/>Your One-Time Password (OTP) has been generated.<br/><br/>This code expires shortly. If you did not request it, ignore this email.",
                    IsBodyHtml = true
                };
                // Include OTP in body for the recipient only — never log the value.
                mailMessage.Body =
                    $"Dear User,<br/><br/>Your One-Time Password (OTP) is: <b>{otpCode}</b><br/><br/>This code expires shortly.";
                mailMessage.To.Add(email);
                await client.SendMailAsync(mailMessage);
                _logger.LogInformation("OTP email sent successfully for user {User}", userName ?? email);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send OTP email to recipient");
                return false;
            }
        }
    }
}
