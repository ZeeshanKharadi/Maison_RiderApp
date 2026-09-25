using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Rider.Application.Authentication;
using Rider.Application.Authorization;
using Rider.Application.DTOs.Admin;
using Rider.Application.DTOs.Auth;
using Rider.Application.DTOs.Notifications;
using Rider.Application.DTOs.Orders;
using Rider.Application.Helpers;
using Rider.Application.Interfaces;
using Rider.Domain.Common;
using Rider.Domain.Entities;
using Rider.Infrastructure.Authentication;
using Rider.Infrastructure.Helpers;
using Rider.Infrastructure.Services;
using Rider.Persistence.Contexts;
using Rider.Persistence.Repositories;

namespace Rider.Tests;

/// <summary>P1 reliability: cancel awareness, TokenVersion on logout/change-password, hub ACL regression.</summary>
public class ReliabilityP1Tests : IDisposable
{
    private readonly ApplicationDbContext _db;
    private readonly OrderService _orders;
    private readonly AdminService _admin;
    private readonly UserService _users;
    private readonly RecordingNotifications _notifications;
    private readonly Guid _riderA = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private readonly Guid _riderB = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private readonly Guid _adminId = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private readonly AdminActor _adminActor;

    public ReliabilityP1Tests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase("p1-" + Guid.NewGuid())
            .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
            .Options;
        _db = new ApplicationDbContext(options);
        _db.Database.EnsureCreated();

        _db.Stores.AddRange(
            new Store { StoreId = "S1", Name = "Store 1", IsActive = true },
            new Store { StoreId = "S2", Name = "Store 2", IsActive = true });

        var crypto = new FakeCrypto();
        var verifier = new PasswordVerifier(crypto);

        var riderA = new AppUser
        {
            UserId = _riderA,
            ThirdPartyEmployeeId = "RD-A",
            UserName = "A",
            Email = "a@example.com",
            IsActive = true,
            IsVerified = true,
            StoreId = "S1",
            IsAvailableOnline = true,
            LastSeenAt = DateTime.UtcNow,
            TokenVersion = 0
        };
        verifier.SetPassword(riderA, "PassA1!");

        var riderB = new AppUser
        {
            UserId = _riderB,
            ThirdPartyEmployeeId = "RD-B",
            UserName = "B",
            IsActive = true,
            IsVerified = true,
            StoreId = "S2",
            IsAvailableOnline = true,
            LastSeenAt = DateTime.UtcNow,
            TokenVersion = 0
        };
        verifier.SetPassword(riderB, "PassB1!");

        var admin = new AppUser
        {
            UserId = _adminId,
            ThirdPartyEmployeeId = "ADM",
            UserName = "Admin",
            IsActive = true,
            IsVerified = true,
            StoreId = null,
            TokenVersion = 0
        };
        verifier.SetPassword(admin, "Admin1!");

        _db.Users.AddRange(riderA, riderB, admin);
        _db.SaveChanges();

        var uow = new UnitOfWork(_db);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Availability:HeartbeatMinutes"] = "15",
            ["Location:StaleSeconds"] = "90",
            ["Jwt:Key"] = "unit-test-jwt-key-at-least-32-bytes-long!!",
            ["Jwt:Issuer"] = "MaisonRider",
            ["Jwt:Audience"] = "MaisonRider",
            ["Jwt:ExpiryHours"] = "2",
            ["Jwt:RefreshExpiryDays"] = "7",
            ["EncryptionKey:key"] = Convert.ToBase64String(new byte[32]),
            ["PasswordReset:TokenMinutes"] = "15",
            ["PasswordReset:OtpMinutes"] = "5",
            ["PasswordReset:MaxOtpAttempts"] = "5",
            ["PasswordReset:ResendCooldownSeconds"] = "0"
        }).Build();

        _notifications = new RecordingNotifications();
        _orders = new OrderService(
            uow,
            _notifications,
            new NoOpOpsEventPublisher(),
            config,
            NullLogger<OrderService>.Instance);

        _admin = new AdminService(
            uow,
            crypto,
            verifier,
            new NoOpOpsEventPublisher(),
            _notifications,
            config,
            NullLogger<AdminService>.Instance);

        _users = new UserService(
            uow,
            verifier,
            new JwtTokenHandler(config),
            new AlwaysOkOtp(),
            config,
            new NoOpOpsEventPublisher(),
            NullLogger<UserService>.Instance);

        _adminActor = new AdminActor
        {
            UserId = _adminId,
            WorkerId = "ADM",
            Name = "Admin",
            StoreId = null,
            Roles = new List<string> { RoleNames.Administrator }
        };
    }

    public void Dispose() => _db.Dispose();

    private async Task<long> SeedAvailableAsync(string storeId, string orderId)
    {
        var batch = new AssignedOrderBatch { StoreId = storeId, Time = "now", CreatedAt = DateTime.UtcNow };
        _db.AssignedOrderBatches.Add(batch);
        await _db.SaveChangesAsync();
        var order = new AssignedOrder
        {
            BatchId = batch.Id,
            OrderId = orderId,
            OrderNo = orderId,
            OrderTypeId = "D",
            OrderState = "Ready",
            Comment = "",
            LastName = "Doe",
            FirstName = "John",
            City = "City",
            Street = "Street",
            AddressNo = "1",
            PostCode = "00000",
            SecondaryAddress = "",
            Phone = "000",
            OrderTime = "now",
            Status = OrderStatuses.Available,
            PaymentMethod = "cash",
            Cash = 50,
            ExpectedCash = 50,
            OrderTotal = 50,
            CreatedAt = DateTime.UtcNow,
            Items = new List<AssignedOrderItem>()
        };
        _db.AssignedOrders.Add(order);
        await _db.SaveChangesAsync();
        return order.Id;
    }

    [Fact]
    public async Task Cancel_notifies_only_assigned_rider()
    {
        var id = await SeedAvailableAsync("S1", "CX1");
        Assert.True((await _orders.UpdateRiderStatusAsync(id, _riderA,
            new UpdateOrderStatusRequest { status = OrderStatuses.Accepted })).status);

        _notifications.Cancelled.Clear();
        var cancel = await _admin.CancelOrderAsync(_adminActor, id, "customer cancelled");
        Assert.True(cancel.status, cancel.message);

        Assert.Single(_notifications.Cancelled);
        Assert.Equal(_riderA, _notifications.Cancelled[0].riderUserId);
        Assert.Equal("CX1", _notifications.Cancelled[0].orderId);
        Assert.DoesNotContain(_notifications.Cancelled, c => c.riderUserId == _riderB);
    }

    [Fact]
    public async Task Cancel_available_unassigned_does_not_notify_riders()
    {
        var id = await SeedAvailableAsync("S1", "CX2");
        _notifications.Cancelled.Clear();
        var cancel = await _admin.CancelOrderAsync(_adminActor, id, "no rider yet");
        Assert.True(cancel.status, cancel.message);
        Assert.Empty(_notifications.Cancelled);
    }

    [Fact]
    public async Task Active_excludes_cancelled_but_recent_cancellations_returns_it()
    {
        var id = await SeedAvailableAsync("S1", "CX3");
        Assert.True((await _orders.UpdateRiderStatusAsync(id, _riderA,
            new UpdateOrderStatusRequest { status = OrderStatuses.Accepted })).status);

        Assert.True((await _admin.CancelOrderAsync(_adminActor, id, "ops")).status);

        var active = await _orders.GetActiveOrdersAsync(_riderA);
        Assert.DoesNotContain(active.Data!, o => o.id == id);

        var recent = await _orders.GetRecentlyCancelledOrdersAsync(_riderA, 180);
        Assert.True(recent.status);
        Assert.Contains(recent.Data!, o => o.id == id);

        var other = await _orders.GetRecentlyCancelledOrdersAsync(_riderB, 180);
        Assert.DoesNotContain(other.Data!, o => o.id == id);
    }

    [Fact]
    public async Task Completed_order_cannot_be_cancelled_no_false_cancel_notify()
    {
        var id = await SeedAvailableAsync("S1", "CX4");
        Assert.True((await _orders.UpdateRiderStatusAsync(id, _riderA,
            new UpdateOrderStatusRequest { status = OrderStatuses.Accepted })).status);
        Assert.True((await _orders.UpdateRiderStatusAsync(id, _riderA,
            new UpdateOrderStatusRequest { status = OrderStatuses.InProgress })).status);
        Assert.True((await _orders.UpdateRiderStatusAsync(id, _riderA,
            new UpdateOrderStatusRequest { status = OrderStatuses.Completed, cashCollected = 50 })).status);

        _notifications.Cancelled.Clear();
        var cancel = await _admin.CancelOrderAsync(_adminActor, id, "too late");
        Assert.False(cancel.status);
        Assert.Empty(_notifications.Cancelled);
    }

    [Fact]
    public async Task Logout_bumps_token_version_invalidating_prior_access_claim()
    {
        var login = await _users.UserLoginUsingEmailandPassword(new LoginModel
        {
            userid = "RD-A",
            password = "PassA1!"
        });
        Assert.True(login.status, login.message);
        var token = login.Data!.token;
        var claimVersion = ReadTokenVersion(token);

        var userBefore = await _db.Users.AsNoTracking().FirstAsync(u => u.UserId == _riderA);
        Assert.Equal(userBefore.TokenVersion, claimVersion);

        var logout = await _users.Logout(_riderA.ToString());
        Assert.True(logout.status);

        var userAfter = await _db.Users.AsNoTracking().FirstAsync(u => u.UserId == _riderA);
        Assert.Equal(claimVersion + 1, userAfter.TokenVersion);
        Assert.False(AccessTokenStillValid(userAfter.IsActive, userAfter.TokenVersion, claimVersion));

        var login2 = await _users.UserLoginUsingEmailandPassword(new LoginModel
        {
            userid = "RD-A",
            password = "PassA1!"
        });
        Assert.True(login2.status, login2.message);
        var newClaim = ReadTokenVersion(login2.Data!.token);
        Assert.Equal(userAfter.TokenVersion, newClaim);
        Assert.True(AccessTokenStillValid(userAfter.IsActive, userAfter.TokenVersion, newClaim));
    }

    [Fact]
    public async Task Change_password_bumps_token_version()
    {
        var login = await _users.UserLoginUsingEmailandPassword(new LoginModel
        {
            userid = "RD-A",
            password = "PassA1!"
        });
        Assert.True(login.status);
        var oldClaim = ReadTokenVersion(login.Data!.token);

        var change = await _users.UpdatePasswordUsingOldPassword(new ChangePasswordRequest
        {
            employeeId = _riderA.ToString(),
            oldPassword = "PassA1!",
            newPassword = "PassA2!"
        });
        Assert.True(change.status, change.message);

        var user = await _db.Users.AsNoTracking().FirstAsync(u => u.UserId == _riderA);
        Assert.Equal(oldClaim + 1, user.TokenVersion);
        Assert.False(AccessTokenStillValid(user.IsActive, user.TokenVersion, oldClaim));

        var login2 = await _users.UserLoginUsingEmailandPassword(new LoginModel
        {
            userid = "RD-A",
            password = "PassA2!"
        });
        Assert.True(login2.status, login2.message);
        Assert.Equal(user.TokenVersion, ReadTokenVersion(login2.Data!.token));
    }

    [Fact]
    public async Task Password_reset_still_bumps_token_version()
    {
        var otp = new CapturingOtp();
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Key"] = "unit-test-jwt-key-at-least-32-bytes-long!!",
            ["Jwt:Issuer"] = "MaisonRider",
            ["Jwt:Audience"] = "MaisonRider",
            ["Jwt:ExpiryHours"] = "2",
            ["Jwt:RefreshExpiryDays"] = "7",
            ["EncryptionKey:key"] = Convert.ToBase64String(new byte[32]),
            ["PasswordReset:TokenMinutes"] = "15",
            ["PasswordReset:OtpMinutes"] = "5",
            ["PasswordReset:MaxOtpAttempts"] = "5",
            ["PasswordReset:ResendCooldownSeconds"] = "0"
        }).Build();
        var crypto = new FakeCrypto();
        var verifier = new PasswordVerifier(crypto);
        var users = new UserService(
            new UnitOfWork(_db),
            verifier,
            new JwtTokenHandler(config),
            otp,
            config,
            new NoOpOpsEventPublisher(),
            NullLogger<UserService>.Instance);

        var before = (await _db.Users.AsNoTracking().FirstAsync(u => u.UserId == _riderA)).TokenVersion;
        Assert.True((await users.ForgetPassword(new VerifyAndGetUserDetailsRequest { workerId = "RD-A" })).status);
        var verify = await users.VerifyOtpAsync(_riderA.ToString(), otp.LastOtp!);
        Assert.True(verify.status, verify.message);
        Assert.True((await users.UpdatePasswordWithTokenAsync(new UpdatePassword
        {
            resetToken = verify.Data!,
            password = "ResetPass1"
        })).status);

        var after = (await _db.Users.AsNoTracking().FirstAsync(u => u.UserId == _riderA)).TokenVersion;
        Assert.Equal(before + 1, after);
    }

    [Fact]
    public void Hub_acl_regression_p0_rules_intact()
    {
        var rider = Principal(RoleNames.Rider, "S1");
        var managerA = Principal(RoleNames.Manager, "S1");
        var managerB = Principal(RoleNames.Manager, "S2");
        var admin = Principal(RoleNames.Administrator, null);

        Assert.False(AdminOpsHubAccess.CanConnect(rider));
        Assert.True(AdminOpsHubAccess.CanConnect(managerA));
        Assert.True(AdminOpsHubAccess.CanJoinStore(managerA, "S1"));
        Assert.False(AdminOpsHubAccess.CanJoinStore(managerA, "S2"));
        Assert.False(AdminOpsHubAccess.CanJoinStore(managerB, "S1"));
        Assert.True(AdminOpsHubAccess.CanJoinStore(admin, "S2"));
    }

    /// <summary>Mirrors JWT OnTokenValidated TokenVersion check.</summary>
    private static bool AccessTokenStillValid(bool isActive, int dbVersion, int claimVersion)
        => isActive && dbVersion == claimVersion;

    private static int ReadTokenVersion(string jwt)
    {
        var handler = new JwtSecurityTokenHandler();
        var token = handler.ReadJwtToken(jwt);
        var raw = token.Claims.FirstOrDefault(c => c.Type == "token_version")?.Value;
        return int.TryParse(raw, out var v) ? v : 0;
    }

    private static ClaimsPrincipal Principal(string role, string? storeId)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, Guid.NewGuid().ToString()),
            new(ClaimTypes.Role, role)
        };
        if (!string.IsNullOrWhiteSpace(storeId))
            claims.Add(new Claim("storeId", storeId));
        return new ClaimsPrincipal(new ClaimsIdentity(claims, "test"));
    }

    private sealed class RecordingNotifications : IRiderNotificationService
    {
        public List<(Guid riderUserId, string orderId, long? assignedOrderId)> Cancelled { get; } = new();

        public Task NotifyDirectAssignmentAsync(Guid riderUserId, string orderId, long? assignedOrderId, string storeId, decimal orderTotal)
            => Task.CompletedTask;

        public Task NotifyOpenPoolOrderAsync(string orderId, long? assignedOrderId, string storeId, decimal orderTotal)
            => Task.CompletedTask;

        public Task NotifyOrderCancelledAsync(Guid riderUserId, string orderId, long? assignedOrderId, string? cancelReason)
        {
            Cancelled.Add((riderUserId, orderId, assignedOrderId));
            return Task.CompletedTask;
        }

        public Task<ApiResponse<List<RiderNotificationDto>>> ListForUserAsync(Guid userId, int take = 50)
            => throw new NotImplementedException();

        public Task<ApiResponse<string>> MarkReadAsync(Guid userId, long notificationId)
            => throw new NotImplementedException();

        public Task<ApiResponse<string>> MarkAllReadAsync(Guid userId)
            => throw new NotImplementedException();

        public Task<ApiResponse<SendNotificationResultDto>> SendTestToUserAsync(SendNotificationRequest request)
            => throw new NotImplementedException();

        public Task<ApiResponse<SendNotificationResultDto>> BroadcastTestAsync(BroadcastNotificationRequest request)
            => throw new NotImplementedException();
    }

    private sealed class AlwaysOkOtp : IOtpNotifier
    {
        public bool IsConfigured => true;
        public Task<bool> SendOtpAsync(string email, string phoneNumber, string userName, string otpCode)
            => Task.FromResult(true);
    }

    private sealed class CapturingOtp : IOtpNotifier
    {
        public bool IsConfigured => true;
        public string? LastOtp { get; private set; }
        public Task<bool> SendOtpAsync(string email, string phoneNumber, string userName, string otpCode)
        {
            LastOtp = otpCode;
            return Task.FromResult(true);
        }
    }

    private sealed class FakeCrypto : IPasswordCrypto
    {
        public byte[]? Encrypt(string plainText) => System.Text.Encoding.UTF8.GetBytes(plainText ?? "");
        public string? Decrypt(byte[]? cipherText)
            => cipherText == null ? null : System.Text.Encoding.UTF8.GetString(cipherText);
    }
}
