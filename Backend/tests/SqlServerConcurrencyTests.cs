using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Rider.Application.Authentication;
using Rider.Application.DTOs.Admin;
using Rider.Application.DTOs.Auth;
using Rider.Application.DTOs.Float;
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

        // Race must stay non-throwing and allow either committed winner.
        // Repeat until both final outcomes are observed (or cap attempts).
        var sawPickupFinal = false;
        var sawCancelFinal = false;
        const int maxAttempts = 60;

        for (var attempt = 0; attempt < maxAttempts && !(sawPickupFinal && sawCancelFinal); attempt++)
        {
            await ResetDatabaseAsync();

            Guid riderA, adminId;
            long id;
            await using (var seed = new ApplicationDbContext(Options()))
            {
                (riderA, _, adminId) = await SeedUsersAsync(seed);
                id = await SeedAvailableAsync(seed, $"CXL-P-{attempt}");
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

            async Task<(bool ok, string message)> Pickup()
            {
                await using var db = new ApplicationDbContext(Options());
                var result = await CreateOrders(db).UpdateRiderStatusAsync(id, riderA,
                    new UpdateOrderStatusRequest { status = OrderStatuses.InProgress });
                return (result.status, result.message ?? "");
            }

            async Task<(bool ok, string message)> Cancel()
            {
                await using var db = new ApplicationDbContext(Options());
                var result = await CreateAdmin(db).CancelOrderAsync(actor, id, "cancel during pickup");
                return (result.status, result.message ?? "");
            }

            var results = await Task.WhenAll(Pickup(), Cancel());
            var pickup = results[0];
            var cancel = results[1];

            // Neither side may throw — failures are ApiResponse.status=false.
            Assert.True(pickup.ok || cancel.ok, $"attempt {attempt}: expected at least one success. pickup={pickup.message}; cancel={cancel.message}");

            await using var verify = new ApplicationDbContext(Options());
            var order = await verify.AssignedOrders.AsNoTracking().FirstAsync(o => o.Id == id);
            Assert.True(
                order.Status is OrderStatuses.InProgress or OrderStatuses.Cancelled,
                $"attempt {attempt}: unexpected status {order.Status}");
            Assert.NotEqual(OrderStatuses.Accepted, order.Status);

            var cancelAudits = await verify.Set<OrderLifecycleAudit>().AsNoTracking()
                .CountAsync(a => a.AssignedOrderId == id
                    && a.NewStatus == OrderStatuses.Cancelled
                    && a.ActorType == "Admin");

            if (order.Status == OrderStatuses.InProgress)
            {
                sawPickupFinal = true;
                Assert.True(pickup.ok, $"pickup-win attempt {attempt}: pickup must succeed ({pickup.message})");
                Assert.False(cancel.ok, $"pickup-win attempt {attempt}: cancel must lose cleanly ({cancel.message})");
                Assert.Equal(0, cancelAudits); // cancel did not commit
                Assert.Contains("concurrent", cancel.message, StringComparison.OrdinalIgnoreCase);
            }
            else
            {
                sawCancelFinal = true;
                Assert.True(cancel.ok, $"cancel-win attempt {attempt}: cancel must succeed ({cancel.message})");
                Assert.Equal(1, cancelAudits);
                Assert.Equal(OrderStatuses.Cancelled, order.Status);
                // Pickup may have lost the race (false) or never applied after cancel.
                if (!pickup.ok)
                {
                    Assert.True(
                        pickup.message.Contains("cancel", StringComparison.OrdinalIgnoreCase)
                        || pickup.message.Contains("concurrent", StringComparison.OrdinalIgnoreCase)
                        || pickup.message.Contains("Cannot move", StringComparison.OrdinalIgnoreCase)
                        || pickup.message.Contains("Accepted", StringComparison.OrdinalIgnoreCase),
                        $"cancel-win attempt {attempt}: unexpected pickup message: {pickup.message}");
                }
            }

            var audits = await verify.Set<OrderLifecycleAudit>().AsNoTracking()
                .Where(a => a.AssignedOrderId == id).ToListAsync();
            Assert.Contains(audits, a => a.NewStatus == OrderStatuses.Accepted);
            Assert.True(audits.Any(a => a.NewStatus is OrderStatuses.InProgress or OrderStatuses.Cancelled));
        }

        Assert.True(sawPickupFinal, $"never observed pickup-final InProgress in {maxAttempts} attempts");
        Assert.True(sawCancelFinal, $"never observed cancel-final Cancelled in {maxAttempts} attempts");
    }

    [SkippableFact]
    public async Task Report_issue_versus_admin_cancel_and_complete_and_duplicate_requestId()
    {
        RequireSql();

        // --- report vs cancel ---
        await ResetDatabaseAsync();
        Guid riderA, adminId;
        long cancelRaceId;
        await using (var seed = new ApplicationDbContext(Options()))
        {
            (riderA, _, adminId) = await SeedUsersAsync(seed);
            cancelRaceId = await SeedActiveInProgressAsync(seed, riderA, "ISSUE-CXL");
        }

        var actor = new AdminActor
        {
            UserId = adminId,
            WorkerId = "ADM",
            Name = "Admin",
            StoreId = "S1",
            Roles = new List<string> { RoleNames.Administrator }
        };

        async Task<(bool ok, string msg)> ReportCancelRace()
        {
            await using var db = new ApplicationDbContext(Options());
            var r = await CreateOrders(db).ReportDeliveryIssueAsync(cancelRaceId, riderA,
                new ReportDeliveryIssueRequest
                {
                    reason = DeliveryIssueReasons.CustomerUnreachable,
                    note = "race note",
                    requestId = "sql-race-cancel"
                });
            return (r.status, r.message ?? "");
        }

        async Task<(bool ok, string msg)> CancelRace()
        {
            await using var db = new ApplicationDbContext(Options());
            var r = await CreateAdmin(db).CancelOrderAsync(actor, cancelRaceId, "cancel during report");
            return (r.status, r.message ?? "");
        }

        var cancelRace = await Task.WhenAll(ReportCancelRace(), CancelRace());
        Assert.True(cancelRace[0].ok || cancelRace[1].ok);

        await using (var verify = new ApplicationDbContext(Options()))
        {
            var order = await verify.AssignedOrders.AsNoTracking().FirstAsync(o => o.Id == cancelRaceId);
            var reports = await verify.Set<DeliveryIssueReport>().AsNoTracking()
                .Where(r => r.AssignedOrderId == cancelRaceId).ToListAsync();
            var issueAudits = await verify.Set<OrderLifecycleAudit>().AsNoTracking()
                .CountAsync(a => a.AssignedOrderId == cancelRaceId
                    && a.NewStatus == DeliveryIssueReasons.AuditEventStatus);
            var issueNotifs = await verify.Set<AdminNotification>().AsNoTracking()
                .CountAsync(n => n.AssignedOrderId == cancelRaceId
                    && n.Title == "Delivery issue reported");

            Assert.Equal(reports.Count, issueAudits);
            Assert.Equal(reports.Count, issueNotifs);
            if (order.Status == OrderStatuses.Cancelled)
            {
                Assert.True(cancelRace[1].ok);
                if (!cancelRace[0].ok)
                    Assert.False(string.IsNullOrWhiteSpace(cancelRace[0].msg));
            }
            else
            {
                Assert.True(OrderStatuses.IsActiveStatus(order.Status));
                Assert.True(cancelRace[0].ok);
                Assert.Single(reports);
            }
        }

        // --- report vs complete ---
        await ResetDatabaseAsync();
        long completeRaceId;
        await using (var seed = new ApplicationDbContext(Options()))
        {
            (riderA, _, _) = await SeedUsersAsync(seed);
            completeRaceId = await SeedActiveInProgressAsync(seed, riderA, "ISSUE-CMP");
        }

        async Task<(bool ok, string msg)> ReportCompleteRace()
        {
            await using var db = new ApplicationDbContext(Options());
            var r = await CreateOrders(db).ReportDeliveryIssueAsync(completeRaceId, riderA,
                new ReportDeliveryIssueRequest
                {
                    reason = DeliveryIssueReasons.AddressIssue,
                    requestId = "sql-race-complete"
                });
            return (r.status, r.message ?? "");
        }

        async Task<(bool ok, string msg)> CompleteRace()
        {
            await using var db = new ApplicationDbContext(Options());
            var r = await CreateOrders(db).UpdateRiderStatusAsync(completeRaceId, riderA,
                new UpdateOrderStatusRequest
                {
                    status = OrderStatuses.Completed,
                    cashCollected = 20m,
                    requestId = "sql-complete-1"
                });
            return (r.status, r.message ?? "");
        }

        var completeRace = await Task.WhenAll(ReportCompleteRace(), CompleteRace());
        Assert.True(completeRace[0].ok || completeRace[1].ok);

        await using (var verify = new ApplicationDbContext(Options()))
        {
            var order = await verify.AssignedOrders.AsNoTracking().FirstAsync(o => o.Id == completeRaceId);
            var reports = await verify.Set<DeliveryIssueReport>().AsNoTracking()
                .CountAsync(r => r.AssignedOrderId == completeRaceId);
            var issueAudits = await verify.Set<OrderLifecycleAudit>().AsNoTracking()
                .CountAsync(a => a.AssignedOrderId == completeRaceId
                    && a.NewStatus == DeliveryIssueReasons.AuditEventStatus);
            Assert.Equal(reports, issueAudits);
            if (order.Status == OrderStatuses.Completed)
            {
                Assert.True(completeRace[1].ok);
                if (!completeRace[0].ok)
                    Assert.Contains("completed", completeRace[0].msg, StringComparison.OrdinalIgnoreCase);
            }
            else
            {
                Assert.True(OrderStatuses.IsActiveStatus(order.Status));
                Assert.True(completeRace[0].ok);
                Assert.Equal(1, reports);
            }
        }

        // --- concurrent identical requestId ---
        await ResetDatabaseAsync();
        long idemId;
        await using (var seed = new ApplicationDbContext(Options()))
        {
            (riderA, _, _) = await SeedUsersAsync(seed);
            idemId = await SeedActiveInProgressAsync(seed, riderA, "ISSUE-IDEM");
        }

        async Task<(bool ok, string msg, long? reportId)> ReportSameKey()
        {
            await using var db = new ApplicationDbContext(Options());
            var r = await CreateOrders(db).ReportDeliveryIssueAsync(idemId, riderA,
                new ReportDeliveryIssueRequest
                {
                    reason = DeliveryIssueReasons.CustomerRefused,
                    note = "same payload",
                    requestId = "sql-idem-twin"
                });
            return (r.status, r.message ?? "", r.Data?.id);
        }

        var twins = await Task.WhenAll(ReportSameKey(), ReportSameKey());
        Assert.True(twins[0].ok);
        Assert.True(twins[1].ok);
        Assert.Equal(twins[0].reportId, twins[1].reportId);

        await using (var verify = new ApplicationDbContext(Options()))
        {
            Assert.Equal(1, await verify.Set<DeliveryIssueReport>().CountAsync(r => r.AssignedOrderId == idemId));
            Assert.Equal(1, await verify.Set<OrderLifecycleAudit>().CountAsync(a =>
                a.AssignedOrderId == idemId && a.NewStatus == DeliveryIssueReasons.AuditEventStatus));
            Assert.Equal(1, await verify.Set<AdminNotification>().CountAsync(n =>
                n.AssignedOrderId == idemId && n.Title == "Delivery issue reported"));
        }
    }

    [Fact]
    public async Task Float_identical_ack_retries_succeed_conflicting_ack_does_not_overwrite()
    {
        RequireSql();
        await ResetDatabaseAsync();

        Guid riderA;
        Guid adminId;
        long issueId;
        await using (var seed = new ApplicationDbContext(Options()))
        {
            (riderA, _, adminId) = await SeedUsersAsync(seed);
            var actor = new AdminActor
            {
                UserId = adminId,
                WorkerId = "ADM",
                Name = "Admin",
                StoreId = "S1",
                Roles = new List<string> { RoleNames.Administrator }
            };
            var issued = await new RiderFloatService(new UnitOfWork(seed)).IssueAsync(actor, new FloatMutationRequest
            {
                riderUserId = riderA,
                storeId = "S1",
                amount = 500m,
                requestId = "sql-float-iss-1"
            });
            Assert.True(issued.status, issued.message);
            issueId = issued.Data!.id;
        }

        async Task<(bool ok, string msg, string? ackReq)> Ack(string requestId)
        {
            await using var db = new ApplicationDbContext(Options());
            var r = await new RiderFloatService(new UnitOfWork(db)).AcknowledgeAsync(
                riderA,
                new FloatAcknowledgeRequest { issueId = issueId, requestId = requestId });
            return (r.status, r.message ?? "", r.Data?.requestId);
        }

        var twins = await Task.WhenAll(Ack("sql-float-ack-1"), Ack("sql-float-ack-1"));
        Assert.True(twins[0].ok, twins[0].msg);
        Assert.True(twins[1].ok, twins[1].msg);

        var conflict = await Ack("sql-float-ack-other");
        Assert.False(conflict.ok);

        await using (var verify = new ApplicationDbContext(Options()))
        {
            var row = await verify.Set<RiderFloatLedger>().AsNoTracking()
                .FirstAsync(e => e.Id == issueId);
            Assert.Equal(FloatIssueStatuses.Acknowledged, row.Status);
            Assert.Equal("sql-float-ack-1", row.AckRequestId);
            Assert.Equal(1, await verify.Set<RiderFloatLedger>()
                .CountAsync(e => e.Id == issueId && e.Status == FloatIssueStatuses.Acknowledged));
        }
    }

    private static async Task<long> SeedActiveInProgressAsync(
        ApplicationDbContext db, Guid riderId, string orderId)
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
            OrderState = "Open",
            Comment = "",
            LastName = "L",
            FirstName = "F",
            City = "C",
            Street = "S",
            AddressNo = "1",
            PostCode = "0",
            SecondaryAddress = "",
            Phone = "1",
            OrderTime = "now",
            OrderTotal = 20,
            PaymentMethod = "cash",
            Cash = 20,
            ExpectedCash = 20,
            Status = OrderStatuses.InProgress,
            AcceptedByUserId = riderId,
            AcceptedAt = DateTime.UtcNow.AddMinutes(-10),
            PickedUpAt = DateTime.UtcNow.AddMinutes(-5),
            CreatedAt = DateTime.UtcNow.AddMinutes(-15),
            UpdatedAt = DateTime.UtcNow
        };
        db.AssignedOrders.Add(order);
        await db.SaveChangesAsync();
        return order.Id;
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
        public Task<ApiResponse<string>> SoftDeleteAsync(Guid userId, long notificationId)
            => throw new NotImplementedException();
        public Task<ApiResponse<string>> SoftDeleteAllAsync(Guid userId) => throw new NotImplementedException();
        public Task<ApiResponse<Rider.Application.DTOs.Notifications.SendNotificationResultDto>> SendTestToUserAsync(
            Rider.Application.DTOs.Notifications.SendNotificationRequest request) => throw new NotImplementedException();
        public Task<ApiResponse<Rider.Application.DTOs.Notifications.SendNotificationResultDto>> BroadcastTestAsync(
            Rider.Application.DTOs.Notifications.BroadcastNotificationRequest request) => throw new NotImplementedException();
    }
}
