using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Rider.Application.Authentication;
using Rider.Application.DTOs.Auth;
using Rider.Application.DTOs.Notifications;
using Rider.Application.Helpers;
using Rider.Application.Interfaces;
using Rider.Domain.Common;
using Rider.Domain.Entities;
using Rider.Infrastructure.Helpers;
using Rider.Infrastructure.Services;
using Rider.Persistence.Contexts;
using Rider.Persistence.Repositories;

namespace Rider.Tests;

public class AvailabilityIntervalTests : IDisposable
{
    private readonly ApplicationDbContext _db;
    private readonly OrderService _orders;
    private readonly UserService _users;
    private readonly Guid _rider = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    public AvailabilityIntervalTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase("avail-" + Guid.NewGuid())
            .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
            .Options;
        _db = new ApplicationDbContext(options);
        _db.Database.EnsureCreated();

        _db.Stores.Add(new Store { StoreId = "S1", Name = "Store 1", IsActive = true });
        var crypto = new FakeCrypto();
        var verifier = new PasswordVerifier(crypto);
        var user = new AppUser
        {
            UserId = _rider,
            ThirdPartyEmployeeId = "RD-A",
            UserName = "A",
            IsActive = true,
            IsVerified = true,
            StoreId = "S1",
            IsAvailableOnline = false
        };
        verifier.SetPassword(user, "PassA1!");
        _db.Users.Add(user);
        _db.SaveChanges();

        var uow = new UnitOfWork(_db);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Availability:HeartbeatMinutes"] = "15",
            ["Location:StaleSeconds"] = "90",
            ["Jwt:RefreshExpiryDays"] = "7",
            ["PasswordReset:TokenMinutes"] = "15",
            ["PasswordReset:OtpMinutes"] = "5",
            ["PasswordReset:MaxOtpAttempts"] = "5",
            ["PasswordReset:ResendCooldownSeconds"] = "0"
        }).Build();

        _orders = new OrderService(
            uow,
            new NoOpNotifications(),
            new NoOpOpsEventPublisher(),
            config,
            NullLogger<OrderService>.Instance);

        _users = new UserService(
            uow,
            verifier,
            new NoJwt(),
            new AlwaysOkOtp(),
            config,
            new NoOpOpsEventPublisher(),
            NullLogger<UserService>.Instance);
    }

    public void Dispose() => _db.Dispose();

    [Fact]
    public async Task Online_creates_interval_returned_on_current_user_and_duplicate_online_keeps_start()
    {
        var first = await _orders.SetAvailabilityAsync(_rider, true);
        Assert.True(first.status, first.message);
        Assert.True(first.Data!.isOnline);
        Assert.NotNull(first.Data.currentOnlineStartedAt);
        var started = first.Data.currentOnlineStartedAt!.Value;

        await Task.Delay(20);
        var dup = await _orders.SetAvailabilityAsync(_rider, true);
        Assert.True(dup.status);
        Assert.Equal(started, dup.Data!.currentOnlineStartedAt);

        var openCount = await _db.RiderAvailabilityIntervals.CountAsync(i =>
            i.UserId == _rider && i.EndedAt == null);
        Assert.Equal(1, openCount);

        var me = await _users.GetCurrentUser(_rider.ToString());
        Assert.True(me.status);
        Assert.True(me.Data!.isAvailableOnline);
        Assert.Equal(started, me.Data.currentOnlineStartedAt);
    }

    [Fact]
    public async Task Offline_clears_interval_start_on_current_user()
    {
        Assert.True((await _orders.SetAvailabilityAsync(_rider, true)).status);
        var off = await _orders.SetAvailabilityAsync(_rider, false);
        Assert.True(off.status);
        Assert.False(off.Data!.isOnline);
        Assert.Null(off.Data.currentOnlineStartedAt);

        var me = await _users.GetCurrentUser(_rider.ToString());
        Assert.False(me.Data!.isAvailableOnline);
        Assert.Null(me.Data.currentOnlineStartedAt);

        Assert.Equal(0, await _db.RiderAvailabilityIntervals.CountAsync(i =>
            i.UserId == _rider && i.EndedAt == null));
    }

    [Fact]
    public async Task Overlapping_open_intervals_collapse_to_earliest_start()
    {
        var early = DateTime.UtcNow.AddHours(-2);
        _db.RiderAvailabilityIntervals.AddRange(
            new RiderAvailabilityInterval { UserId = _rider, StartedAt = early },
            new RiderAvailabilityInterval { UserId = _rider, StartedAt = DateTime.UtcNow.AddMinutes(-5) });
        var user = await _db.Users.FirstAsync(u => u.UserId == _rider);
        user.IsAvailableOnline = true;
        await _db.SaveChangesAsync();

        var result = await _orders.SetAvailabilityAsync(_rider, true);
        Assert.True(result.status);
        Assert.Equal(early, result.Data!.currentOnlineStartedAt);

        Assert.Equal(1, await _db.RiderAvailabilityIntervals.CountAsync(i =>
            i.UserId == _rider && i.EndedAt == null));
    }

    [Fact]
    public async Task CurrentUser_online_without_interval_does_not_invent_start()
    {
        var user = await _db.Users.FirstAsync(u => u.UserId == _rider);
        user.IsAvailableOnline = true;
        await _db.SaveChangesAsync();

        var me = await _users.GetCurrentUser(_rider.ToString());
        Assert.True(me.Data!.isAvailableOnline);
        Assert.Null(me.Data.currentOnlineStartedAt);
    }

    private sealed class NoOpNotifications : IRiderNotificationService
    {
        public Task NotifyDirectAssignmentAsync(Guid riderUserId, string orderId, long? assignedOrderId, string storeId, decimal orderTotal)
            => Task.CompletedTask;
        public Task NotifyOpenPoolOrderAsync(string orderId, long? assignedOrderId, string storeId, decimal orderTotal)
            => Task.CompletedTask;
        public Task NotifyOrderCancelledAsync(Guid riderUserId, string orderId, long? assignedOrderId, string? cancelReason)
            => Task.CompletedTask;
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

    private sealed class NoJwt : IJwtTokenHandler
    {
        public string GenerateAccessToken(GetUserResponse user) => "t";
        public string GenerateRefreshToken() => "r";
        public Guid? GetUserIdFromExpiredToken(string accessToken) => null;
    }

    private sealed class AlwaysOkOtp : IOtpNotifier
    {
        public bool IsConfigured => true;
        public Task<bool> SendOtpAsync(string email, string phoneNumber, string userName, string otpCode)
            => Task.FromResult(true);
    }

    private sealed class FakeCrypto : IPasswordCrypto
    {
        public byte[]? Encrypt(string plainText) => System.Text.Encoding.UTF8.GetBytes(plainText ?? "");
        public string? Decrypt(byte[]? cipherText)
            => cipherText == null ? null : System.Text.Encoding.UTF8.GetString(cipherText);
    }
}
