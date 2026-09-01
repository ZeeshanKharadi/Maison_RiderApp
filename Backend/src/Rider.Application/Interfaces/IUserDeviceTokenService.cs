using Rider.Application.DTOs.Notifications;
using Rider.Domain.Common;

namespace Rider.Application.Interfaces
{
    public interface IUserDeviceTokenService
    {
        Task<ApiResponse<string>> RegisterAsync(Guid userId, RegisterDeviceTokenRequest request);
        Task<ApiResponse<string>> RemoveAsync(Guid userId, string token);
    }
}
