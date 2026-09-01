using Rider.Application.DTOs.Notifications;
using Rider.Application.Interfaces;
using Rider.Application.Interfaces.Repositories;
using Rider.Domain.Common;

namespace Rider.Infrastructure.Services
{
    public class UserDeviceTokenService : IUserDeviceTokenService
    {
        private readonly IUnitOfWork _unitOfWork;

        public UserDeviceTokenService(IUnitOfWork unitOfWork)
        {
            _unitOfWork = unitOfWork;
        }

        public async Task<ApiResponse<string>> RegisterAsync(Guid userId, RegisterDeviceTokenRequest request)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.token))
                return Fail("token is required");

            var platform = string.IsNullOrWhiteSpace(request.platform)
                ? "android"
                : request.platform.Trim().ToLowerInvariant();

            await _unitOfWork.UserDeviceTokenRepository.UpsertAsync(
                userId,
                request.token.Trim(),
                platform);
            await _unitOfWork.SaveChangesAsync();
            return Ok("", "Device token registered");
        }

        public async Task<ApiResponse<string>> RemoveAsync(Guid userId, string token)
        {
            if (string.IsNullOrWhiteSpace(token))
                return Fail("token is required");

            await _unitOfWork.UserDeviceTokenRepository.RemoveAsync(userId, token.Trim());
            await _unitOfWork.SaveChangesAsync();
            return Ok("", "Device token removed");
        }

        private static ApiResponse<string> Ok(string data, string message) => new(true, message, data);
        private static ApiResponse<string> Fail(string message) => new(false, message, null);
    }
}
