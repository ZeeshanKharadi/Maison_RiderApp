namespace Rider.Application.Interfaces
{
    public interface IFcmPushService
    {
        bool IsConfigured { get; }

        Task SendToUserAsync(
            Guid userId,
            string title,
            string body,
            IReadOnlyDictionary<string, string>? data = null);
    }
}
