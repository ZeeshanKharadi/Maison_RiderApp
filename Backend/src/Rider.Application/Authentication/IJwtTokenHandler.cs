using Rider.Application.DTOs.Auth;

namespace Rider.Application.Authentication
{
    public interface IJwtTokenHandler
    {
        string GenerateAccessToken(GetUserResponse user);
        string GenerateRefreshToken();
        Guid? GetUserIdFromExpiredToken(string accessToken);
    }
}
