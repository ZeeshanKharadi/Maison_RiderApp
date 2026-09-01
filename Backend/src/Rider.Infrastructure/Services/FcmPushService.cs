using FirebaseAdmin;
using FirebaseAdmin.Messaging;
using Google.Apis.Auth.OAuth2;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Rider.Application.Interfaces;
using Rider.Application.Interfaces.Repositories;

namespace Rider.Infrastructure.Services
{
    public class FcmPushService : IFcmPushService
    {
        private readonly IUnitOfWork _unitOfWork;
        private readonly ILogger<FcmPushService> _logger;
        private static bool _initialized;
        private static readonly object InitLock = new();

        public FcmPushService(
            IUnitOfWork unitOfWork,
            IConfiguration configuration,
            ILogger<FcmPushService> logger)
        {
            _unitOfWork = unitOfWork;
            _logger = logger;
            IsConfigured = TryInitialize(configuration);
        }

        public bool IsConfigured { get; }

        public async Task SendToUserAsync(
            Guid userId,
            string title,
            string body,
            IReadOnlyDictionary<string, string>? data = null)
        {
            if (!IsConfigured)
                return;

            var tokens = await _unitOfWork.UserDeviceTokenRepository.ListTokensForUserAsync(userId);
            if (tokens.Count == 0)
                return;

            foreach (var token in tokens)
            {
                try
                {
                    var message = new Message
                    {
                        Token = token,
                        Notification = new Notification
                        {
                            Title = title,
                            Body = body
                        },
                        Data = data?.ToDictionary(kv => kv.Key, kv => kv.Value)
                            ?? new Dictionary<string, string>(),
                        Android = new AndroidConfig
                        {
                            Priority = Priority.High,
                            Notification = new AndroidNotification
                            {
                                ChannelId = "maison_orders",
                                Sound = "default"
                            }
                        }
                    };

                    await FirebaseMessaging.DefaultInstance.SendAsync(message);
                }
                catch (FirebaseMessagingException ex) when (
                    ex.MessagingErrorCode == MessagingErrorCode.Unregistered ||
                    ex.MessagingErrorCode == MessagingErrorCode.InvalidArgument)
                {
                    _logger.LogInformation("Removing stale FCM token for user {UserId}", userId);
                    await _unitOfWork.UserDeviceTokenRepository.RemoveAsync(userId, token);
                    await _unitOfWork.SaveChangesAsync();
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "FCM send failed for user {UserId}", userId);
                }
            }
        }

        private static bool TryInitialize(IConfiguration configuration)
        {
            lock (InitLock)
            {
                if (_initialized)
                    return FirebaseApp.DefaultInstance != null;

                var path = configuration["Firebase:ServiceAccountPath"];
                if (string.IsNullOrWhiteSpace(path))
                    return false;

                var fullPath = Path.IsPathRooted(path)
                    ? path
                    : Path.Combine(AppContext.BaseDirectory, path);

                if (!File.Exists(fullPath))
                    return false;

                try
                {
                    FirebaseApp.Create(new AppOptions
                    {
                        Credential = GoogleCredential.FromFile(fullPath)
                    });
                    _initialized = true;
                    return true;
                }
                catch
                {
                    return false;
                }
            }
        }
    }
}
