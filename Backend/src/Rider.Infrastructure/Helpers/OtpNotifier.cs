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

        public async Task SendOtpAsync(string email, string phoneNumber, string userName, string otpCode)
        {
            _logger.LogInformation("OTP for {User}: {Otp}", userName ?? email, otpCode);

            var mailServer = _configuration["EmailSettings:MailServer"];
            var user = _configuration["EmailSettings:User"];
            var password = _configuration["EmailSettings:Password"];
            var port = int.TryParse(_configuration["EmailSettings:SMTPPort"], out var p) ? p : 587;

            if (string.IsNullOrWhiteSpace(mailServer) || string.IsNullOrWhiteSpace(user) || string.IsNullOrWhiteSpace(email))
            {
                _logger.LogWarning("Email not configured or recipient missing — OTP logged only.");
                return;
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
                    Body = $"Dear User,<br/><br/>Your One-Time Password (OTP) is: <b>{otpCode}</b><br/><br/>This code expires in 5 minutes.",
                    IsBodyHtml = true
                };
                mailMessage.To.Add(email);
                await client.SendMailAsync(mailMessage);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send OTP email to {Email}", email);
            }

            await Task.CompletedTask;
        }
    }
}
