using Rider.Application.DTOs.Auth;
using Rider.Domain.Common;

namespace Rider.Application.Interfaces
{
    public interface IUserService
    {
        Task<ApiResponse<LoginUser>> UserLoginUsingEmailandPassword(LoginModel req);
        Task<ApiResponse<string>> AddUser(VerifyAndGetUserDetailsRequest req);
        Task<bool> UserExists(string thirdPartyId);
        Task<ApiResponse<string>> ForgetPassword(VerifyAndGetUserDetailsRequest req);
        Task<ApiResponse<string>> VerifyOtpAsync(string userId, string otpCode);
        Task<ApiResponse<string>> UpdatePassword(string userId, string password);
        Task<ApiResponse<string>> UpdatePasswordUsingOldPassword(ChangePasswordRequest req);
        Task<ApiResponse<string>> Logout(string userId);
        Task<ApiResponse<GetUserResponse>> GetCurrentUser(string userId);
        Task<ApiResponse<LoginUser>> RefreshToken(RefreshTokenRequest req);
        Task<ApiResponse<GetUserResponse>> UpdateProfile(UpdateProfileRequest req, string userId);
        Task<ApiResponse<bool>> ValidateToken(string userId);
    }
}
