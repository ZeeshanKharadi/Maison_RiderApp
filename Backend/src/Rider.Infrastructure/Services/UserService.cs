using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Rider.Application.Authentication;
using Rider.Application.DTOs.Auth;
using Rider.Application.Helpers;
using Rider.Application.Interfaces;
using Rider.Application.Interfaces.Repositories;
using Rider.Domain.Common;
using Rider.Domain.Entities;

namespace Rider.Infrastructure.Services
{
    /// <summary>
    /// ESS UserService business logic adapted to EF repositories (KDS data layer).
    /// </summary>
    public class UserService : IUserService
    {
        private readonly IUnitOfWork _unitOfWork;
        private readonly IPasswordCrypto _passwordCrypto;
        private readonly IJwtTokenHandler _jwtTokenHandler;
        private readonly IOtpNotifier _otpNotifier;
        private readonly IConfiguration _configuration;
        private readonly ILogger<UserService> _logger;

        public UserService(
            IUnitOfWork unitOfWork,
            IPasswordCrypto passwordCrypto,
            IJwtTokenHandler jwtTokenHandler,
            IOtpNotifier otpNotifier,
            IConfiguration configuration,
            ILogger<UserService> logger)
        {
            _unitOfWork = unitOfWork;
            _passwordCrypto = passwordCrypto;
            _jwtTokenHandler = jwtTokenHandler;
            _otpNotifier = otpNotifier;
            _configuration = configuration;
            _logger = logger;
        }

        public async Task<ApiResponse<LoginUser>> UserLoginUsingEmailandPassword(LoginModel req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.userid) || string.IsNullOrWhiteSpace(req.password))
                return new ApiResponse<LoginUser>(false, "Invalid Employee ID or Password", null);

            var user = await _unitOfWork.UserRepository.GetByEmployeeIdAsync(req.userid.Trim());
            if (user == null)
                return new ApiResponse<LoginUser>(false, "User not found", null);

            if (user.PasswordEncrypted == null || user.PasswordEncrypted.Length == 0)
                return new ApiResponse<LoginUser>(false, "Invalid credentialss", null);

            string pass = _passwordCrypto.Decrypt(user.PasswordEncrypted);
            if (req.password != pass)
                return new ApiResponse<LoginUser>(false, "Invalid credentialss", null);

            if (!user.IsActive && req.userid != "000000")
                return new ApiResponse<LoginUser>(false, "User account is inactive. Contact admin.", null);

            if (!user.IsVerified && req.userid != "000000")
                return new ApiResponse<LoginUser>(false, "Please verify your account first via admin approval.", null);

            var dto = MapUser(user);
            var accessToken = _jwtTokenHandler.GenerateAccessToken(dto);
            var refreshToken = _jwtTokenHandler.GenerateRefreshToken();

            user.LastSeenAt = DateTime.UtcNow;
            await _unitOfWork.UserRepository.UpdateAsync(user);

            var refreshDays = int.TryParse(_configuration["Jwt:RefreshExpiryDays"], out var d) ? d : 7;
            await _unitOfWork.UserRefreshTokenRepository.AddAsync(new UserRefreshToken
            {
                UserId = user.UserId,
                RefreshToken = refreshToken,
                ExpiresAt = DateTime.UtcNow.AddDays(refreshDays),
                CreatedAt = DateTime.UtcNow,
                IsRevoked = false
            });
            await _unitOfWork.SaveChangesAsync();

            return new ApiResponse<LoginUser>(true, "Login successful", new LoginUser
            {
                userData = dto,
                token = accessToken,
                refreshToken = refreshToken
            });
        }

        public async Task<bool> UserExists(string thirdPartyId)
        {
            if (string.IsNullOrWhiteSpace(thirdPartyId))
                return false;
            return await _unitOfWork.UserRepository.ExistsAsync(u =>
                u.ThirdPartyEmployeeId == thirdPartyId.Trim() && u.DeletedAt == null);
        }

        public async Task<ApiResponse<string>> AddUser(VerifyAndGetUserDetailsRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.workerId))
                return new ApiResponse<string>(false, "Invalid User Id", "Invalid User Id");

            var workerId = req.workerId.Trim();
            if (await UserExists(workerId))
                return await ForgetPassword(req);

            var user = new AppUser
            {
                UserId = Guid.NewGuid(),
                UserName = $"Rider {workerId}",
                Email = $"{workerId.ToLowerInvariant()}@rapiddelivery.local",
                ThirdPartyEmployeeId = workerId,
                IsActive = true,
                IsVerified = false,
                CreatedAt = DateTime.UtcNow,
                Position = "Rider",
                Department = "Delivery",
                PhoneNumber = ""
            };

            await _unitOfWork.UserRepository.AddAsync(user);

            var riderRole = await _unitOfWork.RoleRepository.GetByNameAsync(RoleNames.Rider);
            if (riderRole != null)
            {
                await _unitOfWork.UserRoleRepository.AddAsync(new UserRole
                {
                    UserId = user.UserId,
                    RoleId = riderRole.RoleId,
                    AssignedAt = DateTime.UtcNow
                });
            }

            await _unitOfWork.SaveChangesAsync();

            await AddOtpAsync(user);
            return new ApiResponse<string>(
                true,
                $"A verification code has been sent to your email ({user.Email})",
                user.UserId.ToString());
        }

        public async Task<ApiResponse<string>> ForgetPassword(VerifyAndGetUserDetailsRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.workerId))
                return new ApiResponse<string>(false, "Employee not found", null);

            var user = await _unitOfWork.UserRepository.GetByEmployeeIdAsync(req.workerId.Trim());
            if (user == null || !user.IsActive)
                return new ApiResponse<string>(false, "Employee not found", null);

            await AddOtpAsync(user);
            return new ApiResponse<string>(
                true,
                $"A verification code has been sent to your email ({user.Email})",
                user.UserId.ToString());
        }

        public async Task<ApiResponse<string>> VerifyOtpAsync(string userId, string otpCode)
        {
            if (!Guid.TryParse(userId, out var uid))
                return new ApiResponse<string>(false, "Employee not found", null);

            var user = await _unitOfWork.UserRepository.GetByUserIdAsync(uid);
            if (user == null)
                return new ApiResponse<string>(false, "Employee not found", null);

            var otp = await _unitOfWork.OtpRepository.GetLatestValidAsync(uid, otpCode);
            if (otp == null)
                return new ApiResponse<string>(false, "Invalid OTP", null);

            if (otp.IsUsed)
                return new ApiResponse<string>(false, "OTP already used", null);

            if (DateTime.UtcNow > otp.ExpiresAt)
                return new ApiResponse<string>(false, "OTP expired", null);

            otp.IsUsed = true;
            await _unitOfWork.OtpRepository.UpdateAsync(otp);

            user.IsVerified = true;
            await _unitOfWork.UserRepository.UpdateAsync(user);
            await _unitOfWork.SaveChangesAsync();

            return new ApiResponse<string>(true, "OTP verified successfully", null);
        }

        public async Task<ApiResponse<string>> UpdatePassword(string userId, string password)
        {
            if (string.IsNullOrEmpty(userId))
                return new ApiResponse<string>(false, "Employee id is empty", string.Empty);

            if (string.IsNullOrEmpty(password) || password.Length < 6)
                return new ApiResponse<string>(false, "Password must be at least 6 characters", string.Empty);

            AppUser? user = null;
            if (Guid.TryParse(userId, out var uid))
                user = await _unitOfWork.UserRepository.GetByUserIdAsync(uid);

            if (user == null)
                user = await _unitOfWork.UserRepository.GetByEmployeeIdAsync(userId.Trim());

            if (user == null)
                return new ApiResponse<string>(false, "Employee not found", string.Empty);

            user.PasswordEncrypted = _passwordCrypto.Encrypt(password);
            await _unitOfWork.UserRepository.UpdateAsync(user);
            await _unitOfWork.SaveChangesAsync();

            return new ApiResponse<string>(true, "Password Updated successfully", string.Empty);
        }

        public async Task<ApiResponse<string>> UpdatePasswordUsingOldPassword(ChangePasswordRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.employeeId))
                return new ApiResponse<string>(false, "User not Found", "User not Found");

            if (!Guid.TryParse(req.employeeId, out var uid))
                return new ApiResponse<string>(false, "User not Found", "User not Found");

            var user = await _unitOfWork.UserRepository.GetByUserIdAsync(uid);
            if (user == null || user.PasswordEncrypted == null || user.PasswordEncrypted.Length == 0)
                return new ApiResponse<string>(false, "User not Found", "User not Found");

            string storedPassword = _passwordCrypto.Decrypt(user.PasswordEncrypted);
            if (storedPassword != req.oldPassword)
                return new ApiResponse<string>(false, "Old password not match ", "Old password not match");

            return await UpdatePassword(req.employeeId, req.newPassword);
        }

        public async Task<ApiResponse<string>> Logout(string userId)
        {
            if (Guid.TryParse(userId, out var uid))
            {
                var tokens = _unitOfWork.UserRefreshTokenRepository
                    .GetAll(t => t.UserId == uid && !t.IsRevoked)
                    .ToList();

                foreach (var token in tokens)
                {
                    token.IsRevoked = true;
                    await _unitOfWork.UserRefreshTokenRepository.UpdateAsync(token);
                }

                if (tokens.Count > 0)
                    await _unitOfWork.SaveChangesAsync();
            }

            return new ApiResponse<string>(true, "", "");
        }

        public async Task<ApiResponse<GetUserResponse>> GetCurrentUser(string userId)
        {
            if (!Guid.TryParse(userId, out var uid))
                return new ApiResponse<GetUserResponse>(false, "User not found", null);

            var user = await _unitOfWork.UserRepository.GetByUserIdAsync(uid);
            if (user == null)
                return new ApiResponse<GetUserResponse>(false, "User not found", null);

            return new ApiResponse<GetUserResponse>(true, "Success", MapUser(user));
        }

        public async Task<ApiResponse<LoginUser>> RefreshToken(RefreshTokenRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.refreshToken))
                return new ApiResponse<LoginUser>(false, "Invalid refresh token", null);

            var stored = await _unitOfWork.UserRefreshTokenRepository.GetByTokenAsync(req.refreshToken);
            if (stored == null || stored.IsRevoked || stored.ExpiresAt < DateTime.UtcNow)
                return new ApiResponse<LoginUser>(false, "Refresh token expired or revoked", null);

            var userId = _jwtTokenHandler.GetUserIdFromExpiredToken(req.accessToken) ?? stored.UserId;
            var user = await _unitOfWork.UserRepository.GetByUserIdAsync(userId);
            if (user == null)
                return new ApiResponse<LoginUser>(false, "User not found", null);

            stored.IsRevoked = true;
            await _unitOfWork.UserRefreshTokenRepository.UpdateAsync(stored);

            var dto = MapUser(user);
            var accessToken = _jwtTokenHandler.GenerateAccessToken(dto);
            var refreshToken = _jwtTokenHandler.GenerateRefreshToken();
            var refreshDays = int.TryParse(_configuration["Jwt:RefreshExpiryDays"], out var d) ? d : 7;

            await _unitOfWork.UserRefreshTokenRepository.AddAsync(new UserRefreshToken
            {
                UserId = user.UserId,
                RefreshToken = refreshToken,
                ExpiresAt = DateTime.UtcNow.AddDays(refreshDays),
                CreatedAt = DateTime.UtcNow
            });
            await _unitOfWork.SaveChangesAsync();

            return new ApiResponse<LoginUser>(true, "Token refreshed", new LoginUser
            {
                userData = dto,
                token = accessToken,
                refreshToken = refreshToken
            });
        }

        public async Task<ApiResponse<GetUserResponse>> UpdateProfile(UpdateProfileRequest req, string userId)
        {
            if (!Guid.TryParse(userId, out var uid))
                return new ApiResponse<GetUserResponse>(false, "User not found", null);

            var user = await _unitOfWork.UserRepository.GetByUserIdAsync(uid);
            if (user == null)
                return new ApiResponse<GetUserResponse>(false, "User not found", null);

            if (!string.IsNullOrWhiteSpace(req?.name))
                user.UserName = req.name.Trim();
            if (!string.IsNullOrWhiteSpace(req?.email))
                user.Email = req.email.Trim();
            if (!string.IsNullOrWhiteSpace(req?.phoneNumber))
                user.PhoneNumber = req.phoneNumber.Trim();
            if (!string.IsNullOrWhiteSpace(req?.department))
                user.Department = req.department.Trim();
            if (!string.IsNullOrWhiteSpace(req?.profilePicture))
                user.ProfileImageUrl = req.profilePicture;

            await _unitOfWork.UserRepository.UpdateAsync(user);
            await _unitOfWork.SaveChangesAsync();

            return new ApiResponse<GetUserResponse>(true, "Profile updated", MapUser(user));
        }

        public Task<ApiResponse<bool>> ValidateToken(string userId)
        {
            var ok = !string.IsNullOrWhiteSpace(userId);
            return Task.FromResult(new ApiResponse<bool>(ok, ok ? "Token valid" : "Token invalid", ok));
        }

        private async Task AddOtpAsync(AppUser user)
        {
            var otpCode = new Random().Next(100000, 999999).ToString();
            await _unitOfWork.OtpRepository.AddAsync(new OtpCode
            {
                UserId = user.UserId,
                OtpCodeValue = otpCode,
                Channel = "Email",
                ExpiresAt = DateTime.UtcNow.AddMinutes(5),
                IsUsed = false,
                CreatedAt = DateTime.UtcNow
            });
            await _unitOfWork.SaveChangesAsync();

            await _otpNotifier.SendOtpAsync(user.Email, user.PhoneNumber, user.UserName, otpCode);
            _logger.LogInformation("OTP generated for user {UserId}", user.UserId);
        }

        private static GetUserResponse MapUser(AppUser user)
        {
            var roles = user.UserRoles?
                .Where(ur => ur.Role != null && ur.Role.IsActive)
                .Select(ur => ur.Role.RoleName)
                .Distinct()
                .ToList() ?? new List<string>();

            if (roles.Count == 0)
                roles.Add(RoleNames.Rider);

            var isAdminPortal = roles.Contains(RoleNames.Administrator) || roles.Contains(RoleNames.Manager);

            return new GetUserResponse
            {
                id = user.UserId.ToString(),
                employeeId = user.ThirdPartyEmployeeId,
                name = user.UserName,
                email = user.Email,
                phoneNumber = user.PhoneNumber,
                department = user.Department,
                position = user.Position,
                costCenter = user.CostCenter,
                grade = user.Grade,
                payGroup = user.PayGroup,
                dateOfBirth = user.DateOfBirth?.ToString("yyyy-MM-dd"),
                CNIC = user.Cnic,
                profilePicture = user.ProfileImageUrl,
                isActive = user.IsActive,
                isVerified = user.IsVerified,
                storeId = user.StoreId,
                roles = roles,
                permissions = isAdminPortal
                    ? BuildAdminPermissions(roles)
                    : new List<string> { "orders.view", "orders.accept", "wallet.view", "profile.edit" }
            };
        }

        private static List<string> BuildAdminPermissions(List<string> roles)
        {
            var list = new List<string>
            {
                "admin.portal", "admin.riders", "admin.operations",
                "admin.payments", "admin.reports", "user_management"
            };
            if (roles.Contains(RoleNames.Administrator))
                list.Add("admin.settings");
            return list;
        }
    }
}
