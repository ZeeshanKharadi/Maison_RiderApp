using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Rider.Application.Authorization;
using Rider.Application.DTOs.Auth;
using Rider.Application.DTOs.Notifications;
using Rider.Application.DTOs.Orders;
using Rider.Application.Helpers;
using Rider.Application.Interfaces;
using Rider.Domain.Common;
using Rider.Domain.Entities;
using Rider.Infrastructure.Helpers;
using Rider.Infrastructure.Services;
using Rider.Persistence.Contexts;
using Rider.Persistence.Repositories;

namespace Rider.Tests;

/// <summary>P0 security: store scoping, hub ACL, login bypass removal.</summary>
public class SecurityP0Tests : IDisposable
{
    private readonly ApplicationDbContext _db;
    private readonly OrderService _orders;
    private readonly Guid _riderStoreA = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private readonly Guid _riderStoreB = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    public SecurityP0Tests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase("security-p0-" + Guid.NewGuid())
            .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
            .Options;
        _db = new ApplicationDbContext(options);
        _db.Database.EnsureCreated();

        _db.Stores.AddRange(
            new Store { StoreId = "S1", Name = "Store 1", IsActive = true },
            new Store { StoreId = "S2", Name = "Store 2", IsActive = true });

        _db.Users.AddRange(
            new AppUser
            {
                UserId = _riderStoreA,
                ThirdPartyEmployeeId = "RD-A",
                UserName = "A",
                IsActive = true,
                IsVerified = true,
                StoreId = "S1",
                IsAvailableOnline = true,
                LastSeenAt = DateTime.UtcNow
            },
            new AppUser
            {
                UserId = _riderStoreB,
                ThirdPartyEmployeeId = "RD-B",
                UserName = "B",
                IsActive = true,
                IsVerified = true,
                StoreId = "S2",
                IsAvailableOnline = true,
                LastSeenAt = DateTime.UtcNow
            },
            new AppUser
            {
                UserId = Guid.Parse("00000000-0000-0000-0000-000000000001"),
                ThirdPartyEmployeeId = "000000",
                UserName = "Legacy",
                IsActive = false,
                IsVerified = false,
                StoreId = "S1"
            });
        _db.SaveChanges();

        var uow = new UnitOfWork(_db);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Availability:HeartbeatMinutes"] = "15"
        }).Build();

        _orders = new OrderService(
            uow,
            new NoOpRiderNotifications(),
            new NoOpOpsEventPublisher(),
            config,
            NullLogger<OrderService>.Instance);
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
    public async Task Available_list_excludes_other_store_orders()
    {
        var idS1 = await SeedAvailableAsync("S1", "OA1");
        var idS2 = await SeedAvailableAsync("S2", "OB1");

        var forA = await _orders.GetAvailableOrdersAsync(_riderStoreA);
        Assert.True(forA.status);
        Assert.Contains(forA.Data!, o => o.id == idS1);
        Assert.DoesNotContain(forA.Data!, o => o.id == idS2);

        var forB = await _orders.GetAvailableOrdersAsync(_riderStoreB);
        Assert.Contains(forB.Data!, o => o.id == idS2);
        Assert.DoesNotContain(forB.Data!, o => o.id == idS1);
    }

    [Fact]
    public async Task Get_by_id_hides_other_store_available_order()
    {
        var idS2 = await SeedAvailableAsync("S2", "OB2");
        var result = await _orders.GetOrderByIdAsync(idS2, _riderStoreA);
        Assert.False(result.status);
        Assert.Equal("Order not found", result.message);
        Assert.Null(result.Data);
    }

    [Fact]
    public async Task Reject_other_store_available_order_denied()
    {
        var idS2 = await SeedAvailableAsync("S2", "OB3");
        var reject = await _orders.RejectOrderAsync(idS2, _riderStoreA, new RejectOrderRequest { reason = "nope" });
        Assert.False(reject.status);
        Assert.Equal("Order not found", reject.message);

        Assert.Empty(await _db.OrderRejections.AsNoTracking()
            .Where(r => r.AssignedOrderId == idS2).ToListAsync());
    }

    [Fact]
    public async Task Accept_other_store_available_order_denied()
    {
        var idS2 = await SeedAvailableAsync("S2", "OB4");
        var accept = await _orders.UpdateRiderStatusAsync(
            idS2, _riderStoreA, new UpdateOrderStatusRequest { status = OrderStatuses.Accepted });
        Assert.False(accept.status);
        Assert.Contains("store", accept.message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Same_store_reject_still_leaves_available()
    {
        var id = await SeedAvailableAsync("S1", "OA2");
        var reject = await _orders.RejectOrderAsync(id, _riderStoreA, new RejectOrderRequest { reason = "too far" });
        Assert.True(reject.status, reject.message);
        var order = await _db.AssignedOrders.AsNoTracking().FirstAsync(o => o.Id == id);
        Assert.Equal(OrderStatuses.Available, order.Status);
    }

    [Fact]
    public void Hub_rider_cannot_connect_or_join_store()
    {
        var rider = Principal(RoleNames.Rider, "S1");
        Assert.False(AdminOpsHubAccess.CanConnect(rider));
        Assert.False(AdminOpsHubAccess.CanJoinStore(rider, "S1"));
        Assert.False(AdminOpsHubAccess.CanJoinStore(rider, "S2"));
    }

    [Fact]
    public void Hub_manager_cannot_join_other_store()
    {
        var manager = Principal(RoleNames.Manager, "S1");
        Assert.True(AdminOpsHubAccess.CanConnect(manager));
        Assert.True(AdminOpsHubAccess.CanJoinStore(manager, "S1"));
        Assert.False(AdminOpsHubAccess.CanJoinStore(manager, "S2"));
    }

    [Fact]
    public void Hub_administrator_can_join_any_store_and_is_head_office()
    {
        var admin = Principal(RoleNames.Administrator, null);
        Assert.True(AdminOpsHubAccess.CanConnect(admin));
        Assert.True(AdminOpsHubAccess.IsHeadOffice(admin));
        Assert.True(AdminOpsHubAccess.CanJoinStore(admin, "S1"));
        Assert.True(AdminOpsHubAccess.CanJoinStore(admin, "S2"));
    }

    [Fact]
    public async Task Inactive_000000_cannot_bypass_login_checks()
    {
        var uow = new UnitOfWork(_db);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Key"] = "unit-test-jwt-key-at-least-32-bytes-long!!",
            ["Jwt:Issuer"] = "t",
            ["Jwt:Audience"] = "t",
            ["Jwt:ExpiryHours"] = "1",
            ["Jwt:RefreshExpiryDays"] = "1",
            ["EncryptionKey:key"] = Convert.ToBase64String(new byte[32])
        }).Build();

        var crypto = new PasswordCrypto(config);
        var verifier = new PasswordVerifier(crypto);
        var user = await uow.UserRepository.GetByEmployeeIdAsync("000000");
        Assert.NotNull(user);
        verifier.SetPassword(user!, "Secret1!");
        user!.IsActive = false;
        user.IsVerified = false;
        await uow.UserRepository.UpdateAsync(user);
        await uow.SaveChangesAsync();

        var jwt = new Rider.Infrastructure.Authentication.JwtTokenHandler(config);
        var users = new UserService(
            uow,
            verifier,
            jwt,
            new NoOpOtp(),
            config,
            new NoOpOpsEventPublisher(),
            NullLogger<UserService>.Instance);

        var login = await users.UserLoginUsingEmailandPassword(new LoginModel
        {
            userid = "000000",
            password = "Secret1!"
        });
        Assert.False(login.status);
        Assert.Contains("inactive", login.message, StringComparison.OrdinalIgnoreCase);
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

    private sealed class NoOpOtp : IOtpNotifier
    {
        public bool IsConfigured => true;
        public Task<bool> SendOtpAsync(string email, string phoneNumber, string userName, string otpCode)
            => Task.FromResult(true);
    }

    private sealed class NoOpRiderNotifications : IRiderNotificationService
    {
        public Task NotifyDirectAssignmentAsync(Guid riderUserId, string orderId, long? assignedOrderId, string storeId, decimal orderTotal)
            => Task.CompletedTask;

        public Task NotifyOpenPoolOrderAsync(string orderId, long? assignedOrderId, string storeId, decimal orderTotal)
            => Task.CompletedTask;

        public Task NotifyOrderCancelledAsync(
            Guid riderUserId, string orderId, long? assignedOrderId, string? cancelReason)
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
}
