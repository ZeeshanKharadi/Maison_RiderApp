using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Rider.Application.Authentication;
using Rider.Application.DTOs.Admin;
using Rider.Application.DTOs.Auth;
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

/// <summary>
/// Real SQL Server concurrency checks. Skipped (not failed) when RIDER_TEST_SQL /
/// LocalDB is unavailable. InMemory tests must NOT be treated as concurrency evidence.
/// </summary>
public class SqlServerConcurrencyTests
{
    private static readonly string ConnectionString =
        Environment.GetEnvironmentVariable("RIDER_TEST_SQL")
        ?? "Server=(localdb)\\MSSQLLocalDB;Database=RiderManagement_Phase1Test;Trusted_Connection=True;TrustServerCertificate=True;Connect Timeout=8;MultipleActiveResultSets=true";

    private static bool? _available;
    private static string? _skipReason;

    private static bool IsAvailable()
    {
        if (_available.HasValue) return _available.Value;
        try
        {
            var options = new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseSqlServer(ConnectionString)
                .Options;
            using var db = new ApplicationDbContext(options);
            db.Database.CanConnect();
            db.Database.EnsureCreated();
            _available = true;
            return true;
        }
        catch (Exception ex)
        {
            _available = false;
            _skipReason = $"SQL Server test DB unavailable ({ex.GetType().Name}: {ex.Message}). " +
                          $"Set RIDER_TEST_SQL to an isolated database. Never use production.";
            return false;
        }
    }

    private static void RequireSql()
        => Skip.If(!IsAvailable(), _skipReason ?? "SQL Server unavailable");

    private static DbContextOptions<ApplicationDbContext> Options()
        => new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlServer(ConnectionString)
            .Options;

    private static async Task ResetDatabaseAsync()
    {
        await using var db = new ApplicationDbContext(Options());
        await db.Database.EnsureDeletedAsync();
        await db.Database.EnsureCreatedAsync();
    }

    private static OrderService CreateOrders(ApplicationDbContext db)
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Availability:HeartbeatMinutes"] = "15"
        }).Build();
        return new OrderService(
            new UnitOfWork(db),
            new NoOpRiderNotifications(),
            new NoOpOps(),
            config,
            NullLogger<OrderService>.Instance);
    }

    private static AdminService CreateAdmin(ApplicationDbContext db)
    {
        var crypto = new FakeCrypto();
        return new AdminService(
            new UnitOfWork(db),
            crypto,
            new PasswordVerifier(crypto),
            new NoOpOps(),
            new NoOpRiderNotifications(),
            new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Location:StaleSeconds"] = "90"
            }).Build(),
            NullLogger<AdminService>.Instance);
    }

    private static UserService CreateUsers(ApplicationDbContext db)
    {
        var crypto = new FakeCrypto();
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["PasswordReset:TokenMinutes"] = "15",
            ["PasswordReset:OtpMinutes"] = "5",
            ["PasswordReset:MaxOtpAttempts"] = "5",
            ["PasswordReset:ResendCooldownSeconds"] = "0",
            ["Jwt:RefreshExpiryDays"] = "7"
        }).Build();
        return new UserService(
            new UnitOfWork(db),
            new PasswordVerifier(crypto),
            new FakeJwt(),
            new AlwaysOkOtp(),
            config,
            new NoOpOps(),
            NullLogger<UserService>.Instance);
    }

    private static async Task<(Guid riderA, Guid riderB, Guid adminId)> SeedUsersAsync(ApplicationDbContext db)
    {
        var riderA = Guid.NewGuid();
        var riderB = Guid.NewGuid();
        var adminId = Guid.NewGuid();
        db.Users.AddRange(
            Online(riderA, "RD-A"),
            Online(riderB, "RD-B"),
            new AppUser
            {
                UserId = adminId,
                ThirdPartyEmployeeId = "ADM",
                UserName = "Admin",
                IsActive = true,
                IsVerified = true,
                StoreId = "S1"
            });
        db.Stores.Add(new Store { StoreId = "S1", Name = "Store 1", IsActive = true });
        await db.SaveChangesAsync();
        return (riderA, riderB, adminId);
    }

    private static AppUser Online(Guid id, string worker) => new()
    {
        UserId = id,
        ThirdPartyEmployeeId = worker,
        UserName = worker,
        IsActive = true,
        IsVerified = true,
        StoreId = "S1",
        IsAvailableOnline = true,
        LastSeenAt = DateTime.UtcNow
    };

    private static async Task<long> SeedAvailableAsync(ApplicationDbContext db, string orderId, decimal? expected = 100m)
    {
        var batch = new AssignedOrderBatch { StoreId = "S1", Time = "now", CreatedAt = DateTime.UtcNow };
        db.AssignedOrderBatches.Add(batch);
        await db.SaveChangesAsync();
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
            Cash = expected,
            ExpectedCash = expected,
            OrderTotal = expected ?? 0,
            CreatedAt = DateTime.UtcNow,
            Items = new List<AssignedOrderItem>()
        };
        db.AssignedOrders.Add(order);
        await db.SaveChangesAsync();
        return order.Id;
    }

    [SkippableFact]
    public async Task Two_riders_accept_one_order_exactly_one_succeeds()
    {
        RequireSql();
        await ResetDatabaseAsync();

        long orderId;
        Guid riderA, riderB;
        await using (var seed = new ApplicationDbContext(Options()))
        {
            (riderA, riderB, _) = await SeedUsersAsync(seed);
            orderId = await SeedAvailableAsync(seed, "RACE-1");
        }

        async Task<bool> Accept(Guid rider)
        {
            await using var db = new ApplicationDbContext(Options());
            var svc = CreateOrders(db);
            var r = await svc.UpdateRiderStatusAsync(orderId, rider, new UpdateOrderStatusRequest { status = OrderStatuses.Accepted });
            return r.status;
        }

        var results = await Task.WhenAll(Accept(riderA), Accept(riderB));
        Assert.Equal(1, results.Count(x => x));

        await using var verify = new ApplicationDbContext(Options());
        var order = await verify.AssignedOrders.AsNoTracking().FirstAsync(o => o.Id == orderId);
        Assert.Equal(OrderStatuses.Accepted, order.Status);
        Assert.NotNull(order.AcceptedByUserId);
        Assert.True(order.AcceptedByUserId == riderA || order.AcceptedByUserId == riderB);

        var audits = await verify.Set<OrderLifecycleAudit>().AsNoTracking()
            .Where(a => a.AssignedOrderId == orderId && a.NewStatus == OrderStatuses.Accepted)
            .ToListAsync();
        Assert.Single(audits);
    }

    [SkippableFact]
    public async Task Rider_with_four_active_concurrent_accepts_at_most_one_of_two()
    {
        RequireSql();
        await ResetDatabaseAsync();

        Guid riderA;
        long id5, id6;
        await using (var seed = new ApplicationDbContext(Options()))
        {
            (riderA, _, _) = await SeedUsersAsync(seed);
            var orders = CreateOrders(seed);
            for (var i = 0; i < 4; i++)
            {
                var id = await SeedAvailableAsync(seed, "M" + i);
                Assert.True((await orders.UpdateRiderStatusAsync(id, riderA,
                    new UpdateOrderStatusRequest { status = OrderStatuses.Accepted })).status);
            }
            id5 = await SeedAvailableAsync(seed, "M5");
            id6 = await SeedAvailableAsync(seed, "M6");
        }

        async Task<bool> Accept(long id)
        {
            await using var db = new ApplicationDbContext(Options());
            var r = await CreateOrders(db).UpdateRiderStatusAsync(id, riderA,
                new UpdateOrderStatusRequest { status = OrderStatuses.Accepted });
            return r.status;
        }

        var results = await Task.WhenAll(Accept(id5), Accept(id6));
        Assert.True(results.Count(x => x) <= 1);

        await using var verify = new ApplicationDbContext(Options());
        var active = await verify.AssignedOrders.CountAsync(o =>
            o.AcceptedByUserId == riderA
            && OrderStatuses.ActiveStatuses.Contains(o.Status));
        Assert.True(active <= OrderStatuses.MaxActiveDeliveries);
    }

    [SkippableFact]
    public async Task Concurrent_completion_one_financial_effect()
    {
        RequireSql();
        await ResetDatabaseAsync();

        Guid riderA;
        long id;
        await using (var seed = new ApplicationDbContext(Options()))
        {
            (riderA, _, _) = await SeedUsersAsync(seed);
            id = await SeedAvailableAsync(seed, "CMP", 100m);
            var orders = CreateOrders(seed);
            Assert.True((await orders.UpdateRiderStatusAsync(id, riderA, new UpdateOrderStatusRequest { status = OrderStatuses.Accepted })).status);
            Assert.True((await orders.UpdateRiderStatusAsync(id, riderA, new UpdateOrderStatusRequest { status = OrderStatuses.InProgress })).status);
        }

        async Task<(bool ok, string msg)> Complete(string requestId, decimal cash)
        {
            await using var db = new ApplicationDbContext(Options());
            var r = await CreateOrders(db).UpdateRiderStatusAsync(id, riderA, new UpdateOrderStatusRequest
            {
                status = OrderStatuses.Completed,
                cashCollected = cash,
                requestId = requestId
            });
            return (r.status, r.message);
        }

        var results = await Task.WhenAll(
            Complete("cmp-1", 100m),
            Complete("cmp-2", 100m));
        // Both clients may observe success (winner + already-completed same cash),
        // but only one completion audit / financial mutation is allowed.
        Assert.True(results.Count(r => r.ok) >= 1);

        await using var verify = new ApplicationDbContext(Options());
        var order = await verify.AssignedOrders.AsNoTracking().FirstAsync(o => o.Id == id);
        Assert.Equal(OrderStatuses.Completed, order.Status);
        Assert.Equal(100m, order.CashCollected);
        var completions = await verify.Set<OrderLifecycleAudit>().CountAsync(a =>
            a.AssignedOrderId == id && a.NewStatus == OrderStatuses.Completed);
        Assert.Equal(1, completions);
    }

    [SkippableFact]
    public async Task Lost_response_retry_same_requestId_is_idempotent()
    {
        RequireSql();
        await ResetDatabaseAsync();

        Guid riderA;
        long id;
        await using (var seed = new ApplicationDbContext(Options()))
        {
            (riderA, _, _) = await SeedUsersAsync(seed);
            id = await SeedAvailableAsync(seed, "IDEMP", 100m);
            var orders = CreateOrders(seed);
            Assert.True((await orders.UpdateRiderStatusAsync(id, riderA, new UpdateOrderStatusRequest { status = OrderStatuses.Accepted })).status);
            Assert.True((await orders.UpdateRiderStatusAsync(id, riderA, new UpdateOrderStatusRequest { status = OrderStatuses.InProgress })).status);
            Assert.True((await orders.UpdateRiderStatusAsync(id, riderA, new UpdateOrderStatusRequest
            {
                status = OrderStatuses.Completed,
                cashCollected = 100m,
                requestId = "lost-1"
            })).status);
        }

        await using var retryDb = new ApplicationDbContext(Options());
        var retry = await CreateOrders(retryDb).UpdateRiderStatusAsync(id, riderA, new UpdateOrderStatusRequest
        {
            status = OrderStatuses.Completed,
            cashCollected = 100m,
            requestId = "lost-1"
        });
        Assert.True(retry.status, retry.message);

        var conflict = await CreateOrders(retryDb).UpdateRiderStatusAsync(id, riderA, new UpdateOrderStatusRequest
        {
            status = OrderStatuses.Completed,
            cashCollected = 90m,
            requestId = "lost-1"
        });
        Assert.False(conflict.status);

        await using var verify = new ApplicationDbContext(Options());
        var order = await verify.AssignedOrders.AsNoTracking().FirstAsync(o => o.Id == id);
        Assert.Equal(100m, order.CashCollected);
        Assert.Equal(1, await verify.Set<OrderLifecycleAudit>().CountAsync(a => a.RequestId == "lost-1"));
    }

    [SkippableFact]
    public async Task Simultaneous_reset_token_exactly_one_succeeds()
    {
        RequireSql();
        await ResetDatabaseAsync();

        Guid userId;
        string resetToken;
        await using (var seed = new ApplicationDbContext(Options()))
        {
            userId = Guid.NewGuid();
            var crypto = new FakeCrypto();
            var verifier = new PasswordVerifier(crypto);
            var account = new AppUser
            {
                UserId = userId,
                ThirdPartyEmployeeId = "RD-RESET",
                UserName = "Reset",
                Email = "reset@example.com",
                IsActive = true,
                IsVerified = true
            };
            verifier.SetPassword(account, "OldPass1");
            seed.Users.Add(account);
            await seed.SaveChangesAsync();

            var users = CreateUsers(seed);
            Assert.True((await users.ForgetPassword(new VerifyAndGetUserDetailsRequest { workerId = "RD-RESET" })).status);
            var otp = await seed.Set<OtpCode>().OrderByDescending(o => o.OtpId).FirstAsync();
            var verify = await users.VerifyOtpAsync(userId.ToString(), otp.OtpCodeValue);
            Assert.True(verify.status, verify.message);
            resetToken = verify.Data!;
        }

        async Task<bool> Consume(string password)
        {
            await using var db = new ApplicationDbContext(Options());
            var r = await CreateUsers(db).UpdatePasswordWithTokenAsync(new UpdatePassword
            {
                resetToken = resetToken,
                password = password
            });
            return r.status;
        }

        var results = await Task.WhenAll(Consume("NewPassA1"), Consume("NewPassB1"));
        Assert.Equal(1, results.Count(x => x));

        await using var verifyDb = new ApplicationDbContext(Options());
        var tokens = await verifyDb.Set<PasswordResetToken>().AsNoTracking()
            .Where(t => t.UserId == userId)
            .ToListAsync();
        Assert.Contains(tokens, t => t.UsedAt != null);
        Assert.Equal(1, tokens.Count(t => t.UsedAt != null));

        var userRow = await verifyDb.Users.AsNoTracking().FirstAsync(u => u.UserId == userId);
        Assert.True(userRow.TokenVersion >= 1);
    }

    [SkippableFact]
    public async Task Simultaneous_handovers_cannot_exceed_collectible_or_duplicate()
    {
        RequireSql();
        await ResetDatabaseAsync();

        Guid riderA, adminId;
        long id;
        await using (var seed = new ApplicationDbContext(Options()))
        {
            (riderA, _, adminId) = await SeedUsersAsync(seed);
            id = await SeedAvailableAsync(seed, "HO", 1000m);
            var orders = CreateOrders(seed);
            Assert.True((await orders.UpdateRiderStatusAsync(id, riderA, new UpdateOrderStatusRequest { status = OrderStatuses.Accepted })).status);
            Assert.True((await orders.UpdateRiderStatusAsync(id, riderA, new UpdateOrderStatusRequest { status = OrderStatuses.InProgress })).status);
            Assert.True((await orders.UpdateRiderStatusAsync(id, riderA, new UpdateOrderStatusRequest
            {
                status = OrderStatuses.Completed,
                cashCollected = 1000m,
                requestId = "c-ho"
            })).status);
        }

        var actor = new AdminActor
        {
            UserId = adminId,
            WorkerId = "ADM",
            Name = "Admin",
            StoreId = "S1",
            Roles = new List<string> { RoleNames.Administrator }
        };

        async Task<bool> Hand(string requestId, decimal amount)
        {
            await using var db = new ApplicationDbContext(Options());
            var r = await CreateAdmin(db).ConfirmCashHandoverAsync(actor, id, new CashHandoverRequest
            {
                amount = amount,
                requestId = requestId
            });
            return r.status;
        }

        var results = await Task.WhenAll(Hand("h1", 700m), Hand("h2", 700m));
        Assert.True(results.Count(x => x) <= 1);

        await using var verify = new ApplicationDbContext(Options());
        var order = await verify.AssignedOrders.AsNoTracking().FirstAsync(o => o.Id == id);
        Assert.True((order.CashCollected ?? 0) - (order.CashHandedOverAmount ?? 0) >= 0);
        Assert.True((order.CashHandedOverAmount ?? 0) <= 1000m);
        if (results.Count(x => x) == 1)
            Assert.Equal(700m, order.CashHandedOverAmount);

        var audits = await verify.Set<OrderLifecycleAudit>().CountAsync(a =>
            a.AssignedOrderId == id && a.Reason != null && a.Reason.Contains("CashHandover"));
        Assert.Equal(results.Count(x => x), audits);
    }

    [SkippableFact]
    public async Task Accept_versus_admin_cancellation()
    {
        RequireSql();
        await ResetDatabaseAsync();

        Guid riderA, adminId;
        long id;
        await using (var seed = new ApplicationDbContext(Options()))
        {
            (riderA, _, adminId) = await SeedUsersAsync(seed);
            id = await SeedAvailableAsync(seed, "CXL-A");
        }

        var actor = new AdminActor
        {
            UserId = adminId,
            WorkerId = "ADM",
            Name = "Admin",
            StoreId = "S1",
            Roles = new List<string> { RoleNames.Administrator }
        };

        async Task<bool> Accept()
        {
            await using var db = new ApplicationDbContext(Options());
            return (await CreateOrders(db).UpdateRiderStatusAsync(id, riderA,
                new UpdateOrderStatusRequest { status = OrderStatuses.Accepted })).status;
        }

        async Task<bool> Cancel()
        {
            await using var db = new ApplicationDbContext(Options());
            return (await CreateAdmin(db).CancelOrderAsync(actor, id, "admin cancel race")).status;
        }

        var results = await Task.WhenAll(Accept(), Cancel());
        Assert.True(results.Count(x => x) >= 1);

        await using var verify = new ApplicationDbContext(Options());
        var order = await verify.AssignedOrders.AsNoTracking().FirstAsync(o => o.Id == id);
        Assert.True(order.Status is OrderStatuses.Accepted or OrderStatuses.Cancelled);
        if (order.Status == OrderStatuses.Accepted)
            Assert.Equal(riderA, order.AcceptedByUserId);
        Assert.False(string.IsNullOrWhiteSpace(order.Status));
    }

    [SkippableFact]
    public async Task Pickup_versus_admin_cancellation()
    {
        RequireSql();
        await ResetDatabaseAsync();

        Guid riderA, adminId;
        long id;
        await using (var seed = new ApplicationDbContext(Options()))
        {
            (riderA, _, adminId) = await SeedUsersAsync(seed);
            id = await SeedAvailableAsync(seed, "CXL-P");
            var orders = CreateOrders(seed);
            Assert.True((await orders.UpdateRiderStatusAsync(id, riderA,
                new UpdateOrderStatusRequest { status = OrderStatuses.Accepted })).status);
        }

        var actor = new AdminActor
        {
            UserId = adminId,
            WorkerId = "ADM",
            Name = "Admin",
            StoreId = "S1",
            Roles = new List<string> { RoleNames.Administrator }
        };

        async Task<bool> Pickup()
        {
            await using var db = new ApplicationDbContext(Options());
            return (await CreateOrders(db).UpdateRiderStatusAsync(id, riderA,
                new UpdateOrderStatusRequest { status = OrderStatuses.InProgress })).status;
        }

        async Task<bool> Cancel()
        {
            await using var db = new ApplicationDbContext(Options());
            return (await CreateAdmin(db).CancelOrderAsync(actor, id, "cancel during pickup")).status;
        }

        var results = await Task.WhenAll(Pickup(), Cancel());
        Assert.True(results.Count(x => x) >= 1);

        await using var verify = new ApplicationDbContext(Options());
        var order = await verify.AssignedOrders.AsNoTracking().FirstAsync(o => o.Id == id);
        Assert.True(order.Status is OrderStatuses.InProgress or OrderStatuses.Cancelled);
        Assert.NotEqual(OrderStatuses.Accepted, order.Status); // must have left Accepted
        var audits = await verify.Set<OrderLifecycleAudit>().AsNoTracking()
            .Where(a => a.AssignedOrderId == id).ToListAsync();
        Assert.Contains(audits, a => a.NewStatus == OrderStatuses.Accepted);
        Assert.True(audits.Any(a => a.NewStatus is OrderStatuses.InProgress or OrderStatuses.Cancelled));
    }

    private sealed class FakeCrypto : IPasswordCrypto
    {
        public byte[]? Encrypt(string plainText) => System.Text.Encoding.UTF8.GetBytes(plainText);
        public string? Decrypt(byte[]? cipherText) => cipherText == null ? null : System.Text.Encoding.UTF8.GetString(cipherText);
    }

    private sealed class FakeJwt : IJwtTokenHandler
    {
        public string GenerateAccessToken(GetUserResponse user) => "access";
        public string GenerateRefreshToken() => Guid.NewGuid().ToString("N");
        public Guid? GetUserIdFromExpiredToken(string accessToken) => null;
    }

    private sealed class AlwaysOkOtp : IOtpNotifier
    {
        public bool IsConfigured => true;
        public Task<bool> SendOtpAsync(string email, string phoneNumber, string userName, string otpCode)
            => Task.FromResult(true);
    }

    private sealed class NoOpOps : IOpsEventPublisher
    {
        public Task PublishOrderChangedAsync(string? storeId, long assignedOrderId, string orderId, string status, CancellationToken ct = default)
            => Task.CompletedTask;
        public Task PublishRiderAvailabilityChangedAsync(string? storeId, Guid riderUserId, bool isOnline, CancellationToken ct = default)
            => Task.CompletedTask;
        public Task PublishAdminNotificationCreatedAsync(string? storeId, long notificationId, string title, CancellationToken ct = default)
            => Task.CompletedTask;
        public Task PublishRiderLocationChangedAsync(
            string? storeId, Guid riderUserId, double? latitude, double? longitude, DateTime? locationUpdatedAt,
            int activeOrderCount, string? deliveryStatus, bool cleared, CancellationToken ct = default)
            => Task.CompletedTask;
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

        public Task<ApiResponse<List<Rider.Application.DTOs.Notifications.RiderNotificationDto>>> ListForUserAsync(Guid userId, int take = 50)
            => throw new NotImplementedException();
        public Task<ApiResponse<string>> MarkReadAsync(Guid userId, long notificationId) => throw new NotImplementedException();
        public Task<ApiResponse<string>> MarkAllReadAsync(Guid userId) => throw new NotImplementedException();
        public Task<ApiResponse<Rider.Application.DTOs.Notifications.SendNotificationResultDto>> SendTestToUserAsync(
            Rider.Application.DTOs.Notifications.SendNotificationRequest request) => throw new NotImplementedException();
        public Task<ApiResponse<Rider.Application.DTOs.Notifications.SendNotificationResultDto>> BroadcastTestAsync(
            Rider.Application.DTOs.Notifications.BroadcastNotificationRequest request) => throw new NotImplementedException();
    }
}
