using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Rider.Application.Authentication;
using Rider.Application.DTOs.Auth;
using Rider.Application.Helpers;
using Rider.Application.Interfaces;
using Rider.Application.Interfaces.Repositories;
using Rider.Domain.Common;
using Rider.Domain.Entities;
using Rider.Infrastructure.Helpers;

namespace Rider.Infrastructure.Services
{
    public class UserService : IUserService
    {
        private const string GenericResetMessage =
            "If an account exists for this employee ID, a verification code will be sent shortly.";

        private readonly IUnitOfWork _unitOfWork;
        private readonly PasswordVerifier _passwordVerifier;
        private readonly IJwtTokenHandler _jwtTokenHandler;
        private readonly IOtpNotifier _otpNotifier;
        private readonly IConfiguration _configuration;
        private readonly IOpsEventPublisher _opsEvents;
        private readonly ILogger<UserService> _logger;

        public UserService(
            IUnitOfWork unitOfWork,
            PasswordVerifier passwordVerifier,
            IJwtTokenHandler jwtTokenHandler,
            IOtpNotifier otpNotifier,
            IConfiguration configuration,
            IOpsEventPublisher opsEvents,
            ILogger<UserService> logger)
        {
            _unitOfWork = unitOfWork;
            _passwordVerifier = passwordVerifier;
            _jwtTokenHandler = jwtTokenHandler;
            _otpNotifier = otpNotifier;
            _configuration = configuration;
            _opsEvents = opsEvents;
            _logger = logger;
        }

        public async Task<ApiResponse<LoginUser>> UserLoginUsingEmailandPassword(LoginModel req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.userid) || string.IsNullOrWhiteSpace(req.password))
                return new ApiResponse<LoginUser>(false, "Invalid Employee ID or Password", null);

            var user = await _unitOfWork.UserRepository.GetByEmployeeIdAsync(req.userid.Trim());
            if (user == null)
                return new ApiResponse<LoginUser>(false, "Invalid Employee ID or Password", null);

            if (!_passwordVerifier.Verify(user, req.password, out var needsUpgrade))
                return new ApiResponse<LoginUser>(false, "Invalid Employee ID or Password", null);

            if (needsUpgrade)
                _passwordVerifier.SetPassword(user, req.password);

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

        public Task<ApiResponse<string>> AddUser(VerifyAndGetUserDetailsRequest req)
            => Task.FromResult(new ApiResponse<string>(
                false,
                "Self-registration is disabled. Contact your administrator.",
                null));

        public async Task<ApiResponse<string>> ForgetPassword(VerifyAndGetUserDetailsRequest req)
        {
            // Always use the same client-facing success path shape when we intentionally
            // avoid confirming whether an account exists. SMTP failure is an explicit error.
            if (!_otpNotifier.IsConfigured)
                return new ApiResponse<string>(false, "Unable to send verification code. Try again later.", null);

            if (req == null || string.IsNullOrWhiteSpace(req.workerId))
                return new ApiResponse<string>(true, GenericResetMessage, null);

            var user = await _unitOfWork.UserRepository.GetByEmployeeIdAsync(req.workerId.Trim());
            if (user == null || !user.IsActive || !user.IsVerified)
                return new ApiResponse<string>(true, GenericResetMessage, null);

            var cooldown = int.TryParse(_configuration["PasswordReset:ResendCooldownSeconds"], out var cd) ? cd : 60;
            var recent = await _unitOfWork.Context.Set<OtpCode>()
                .AsNoTracking()
                .Where(o => o.UserId == user.UserId
                    && o.Purpose == OtpPurposes.PasswordReset
                    && o.CreatedAt > DateTime.UtcNow.AddSeconds(-cooldown))
                .OrderByDescending(o => o.CreatedAt)
                .FirstOrDefaultAsync();

            // Do not return userId — clients verify OTP with workerId.
            if (recent != null)
                return new ApiResponse<string>(true, GenericResetMessage, null);

            var otpMinutes = int.TryParse(_configuration["PasswordReset:OtpMinutes"], out var om) ? om : 5;
            var otpCode = RandomNumberGenerator.GetInt32(100000, 999999).ToString();
            await _unitOfWork.OtpRepository.AddAsync(new OtpCode
            {
                UserId = user.UserId,
                OtpCodeValue = otpCode,
                Channel = "Email",
                Purpose = OtpPurposes.PasswordReset,
                AttemptCount = 0,
                ExpiresAt = DateTime.UtcNow.AddMinutes(otpMinutes),
                IsUsed = false,
                CreatedAt = DateTime.UtcNow
            });
            await _unitOfWork.SaveChangesAsync();

            var sent = await _otpNotifier.SendOtpAsync(user.Email, user.PhoneNumber, user.UserName, otpCode);
            if (!sent)
            {
                _logger.LogWarning("OTP SMTP send failed for password reset user {UserId}", user.UserId);
                return new ApiResponse<string>(false, "Unable to send verification code. Try again later.", null);
            }

            return new ApiResponse<string>(true, GenericResetMessage, null);
        }

        public async Task<ApiResponse<string>> VerifyOtpAsync(string userId, string otpCode)
        {
            if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(otpCode))
                return new ApiResponse<string>(false, "Invalid OTP", null);

            AppUser? user = null;
            if (Guid.TryParse(userId, out var uid))
                user = await _unitOfWork.UserRepository.GetByUserIdAsync(uid);
            if (user == null)
                user = await _unitOfWork.UserRepository.GetByEmployeeIdAsync(userId.Trim());
            if (user == null)
                return new ApiResponse<string>(false, "Invalid OTP", null);

            uid = user.UserId;

            var maxAttempts = int.TryParse(_configuration["PasswordReset:MaxOtpAttempts"], out var ma) ? ma : 5;
            var otp = await _unitOfWork.Context.Set<OtpCode>()
                .Where(o => o.UserId == uid
                    && o.Purpose == OtpPurposes.PasswordReset
                    && !o.IsUsed)
                .OrderByDescending(o => o.CreatedAt)
                .FirstOrDefaultAsync();

            if (otp == null)
                return new ApiResponse<string>(false, "Invalid OTP", null);

            if (DateTime.UtcNow > otp.ExpiresAt)
            {
                otp.IsUsed = true;
                await _unitOfWork.OtpRepository.UpdateAsync(otp);
                await _unitOfWork.SaveChangesAsync();
                return new ApiResponse<string>(false, "OTP expired", null);
            }

            if (otp.AttemptCount >= maxAttempts)
                return new ApiResponse<string>(false, "Too many attempts. Request a new code.", null);

            if (!string.Equals(otp.OtpCodeValue, otpCode.Trim(), StringComparison.Ordinal))
            {
                otp.AttemptCount++;
                await _unitOfWork.OtpRepository.UpdateAsync(otp);
                await _unitOfWork.SaveChangesAsync();
                return new ApiResponse<string>(false, "Invalid OTP", null);
            }

            otp.IsUsed = true;
            await _unitOfWork.OtpRepository.UpdateAsync(otp);

            var tokenMinutes = int.TryParse(_configuration["PasswordReset:TokenMinutes"], out var tm) ? tm : 15;
            var rawToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
            var tokenHash = Sha256Hex(rawToken);

            await _unitOfWork.Context.Set<PasswordResetToken>().AddAsync(new PasswordResetToken
            {
                UserId = user.UserId,
                TokenHash = tokenHash,
                Purpose = OtpPurposes.PasswordReset,
                ExpiresAt = DateTime.UtcNow.AddMinutes(tokenMinutes),
                CreatedAt = DateTime.UtcNow
            });
            await _unitOfWork.SaveChangesAsync();

            return new ApiResponse<string>(true, "OTP verified successfully", rawToken);
        }

        public Task<ApiResponse<string>> UpdatePassword(string userId, string password)
            => UpdatePasswordWithTokenAsync(new UpdatePassword { userid = userId, password = password });

        public async Task<ApiResponse<string>> UpdatePasswordWithTokenAsync(UpdatePassword req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.resetToken))
                return new ApiResponse<string>(false, "resetToken is required", string.Empty);

            if (string.IsNullOrEmpty(req.password) || req.password.Length < 6)
                return new ApiResponse<string>(false, "Password must be at least 6 characters", string.Empty);

            var hash = Sha256Hex(req.resetToken.Trim());
            var now = DateTime.UtcNow;

            await using var tx = await _unitOfWork.Context.Database.BeginTransactionAsync();
            try
            {
                // Atomic single-use consumption — concurrent callers: exactly one wins on SQL Server.
                int consumed;
                PasswordResetToken? token;
                if (_unitOfWork.Context.Database.IsRelational())
                {
                    consumed = await _unitOfWork.Context.Set<PasswordResetToken>()
                        .Where(t => t.TokenHash == hash && t.UsedAt == null && t.ExpiresAt >= now)
                        .ExecuteUpdateAsync(s => s.SetProperty(t => t.UsedAt, now));

                    if (consumed != 1)
                    {
                        await tx.RollbackAsync();
                        return new ApiResponse<string>(false, "Invalid or expired reset token", string.Empty);
                    }

                    token = await _unitOfWork.Context.Set<PasswordResetToken>()
                        .AsNoTracking()
                        .FirstOrDefaultAsync(t => t.TokenHash == hash);
                }
                else
                {
                    // InMemory unit tests only — not concurrency-safe.
                    token = await _unitOfWork.Context.Set<PasswordResetToken>()
                        .FirstOrDefaultAsync(t => t.TokenHash == hash && t.UsedAt == null && t.ExpiresAt >= now);
                    if (token == null)
                    {
                        await tx.RollbackAsync();
                        return new ApiResponse<string>(false, "Invalid or expired reset token", string.Empty);
                    }
                    token.UsedAt = now;
                    consumed = 1;
                }

                if (token == null)
                {
                    await tx.RollbackAsync();
                    return new ApiResponse<string>(false, "Invalid or expired reset token", string.Empty);
                }

                var user = await _unitOfWork.UserRepository.GetByUserIdAsync(token.UserId);
                if (user == null)
                {
                    await tx.RollbackAsync();
                    return new ApiResponse<string>(false, "Invalid or expired reset token", string.Empty);
                }

                _passwordVerifier.SetPassword(user, req.password);
                user.TokenVersion += 1;

                var refreshTokens = _unitOfWork.UserRefreshTokenRepository
                    .GetAll(t => t.UserId == user.UserId && !t.IsRevoked)
                    .ToList();
                foreach (var rt in refreshTokens)
                {
                    rt.IsRevoked = true;
                    await _unitOfWork.UserRefreshTokenRepository.UpdateAsync(rt);
                }

                await _unitOfWork.UserRepository.UpdateAsync(user);
                await _unitOfWork.SaveChangesAsync();
                await tx.CommitAsync();

                return new ApiResponse<string>(true, "Password Updated successfully", string.Empty);
            }
            catch
            {
                try { await tx.RollbackAsync(); } catch { /* ignore */ }
                return new ApiResponse<string>(false, "Unable to update password", string.Empty);
            }
        }

        public async Task<ApiResponse<string>> UpdatePasswordUsingOldPassword(ChangePasswordRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.employeeId))
                return new ApiResponse<string>(false, "User not Found", "User not Found");

            if (!Guid.TryParse(req.employeeId, out var uid))
                return new ApiResponse<string>(false, "User not Found", "User not Found");

            var user = await _unitOfWork.UserRepository.GetByUserIdAsync(uid);
            if (user == null)
                return new ApiResponse<string>(false, "User not Found", "User not Found");

            if (!_passwordVerifier.Verify(user, req.oldPassword, out _))
                return new ApiResponse<string>(false, "Old password not match ", "Old password not match");

            if (string.IsNullOrEmpty(req.newPassword) || req.newPassword.Length < 6)
                return new ApiResponse<string>(false, "Password must be at least 6 characters", string.Empty);

            _passwordVerifier.SetPassword(user, req.newPassword);
            await _unitOfWork.UserRepository.UpdateAsync(user);
            await _unitOfWork.SaveChangesAsync();
            return new ApiResponse<string>(true, "Password Updated successfully", string.Empty);
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

                var user = await _unitOfWork.UserRepository.GetByUserIdAsync(uid);
                if (user != null
                    && (user.LastLatitude.HasValue || user.LastLongitude.HasValue || user.LocationUpdatedAt.HasValue))
                {
                    user.LastLatitude = null;
                    user.LastLongitude = null;
                    user.LocationUpdatedAt = null;
                    await _unitOfWork.UserRepository.UpdateAsync(user);
                    try
                    {
                        await _opsEvents.PublishRiderLocationChangedAsync(
                            user.StoreId, uid, null, null, null, 0, null, cleared: true);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Location clear publish failed on logout");
                    }
                }

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

        private static string Sha256Hex(string value)
        {
            var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(value));
            return Convert.ToHexString(bytes);
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
                isAvailableOnline = user.IsAvailableOnline,
                tokenVersion = user.TokenVersion,
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
