using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Rider.Application.DTOs.Admin;
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
/// Financial acceptance fixture (InMemory). Proves balance math and isolation.
/// Concurrent handover races are covered by SqlServerConcurrencyTests when SQL is available.
/// </summary>
public class FinanceAcceptanceTests : IDisposable
{
    private readonly ApplicationDbContext _db;
    private readonly OrderService _orders;
    private readonly AdminService _admin;
    private readonly RiderFinanceService _finance;
    private readonly Guid _riderA = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private readonly Guid _riderB = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private readonly Guid _adminId = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private readonly AdminActor _adminActor;

    public FinanceAcceptanceTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase("finance-" + Guid.NewGuid())
            .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
            .Options;
        _db = new ApplicationDbContext(options);
        _db.Database.EnsureCreated();

        _db.Users.AddRange(
            OnlineRider(_riderA, "RD-A"),
            OnlineRider(_riderB, "RD-B"),
            new AppUser
            {
                UserId = _adminId,
                ThirdPartyEmployeeId = "ADM",
                UserName = "Admin",
                IsActive = true,
                IsVerified = true,
                StoreId = "S1"
            });
        _db.Stores.Add(new Store { StoreId = "S1", Name = "Store 1", IsActive = true });
        _db.AppSettings.AddRange(
            new AppSetting { SettingKey = "PayoutMode", SettingValue = "fixed" },
            new AppSetting { SettingKey = "PayoutFixedFee", SettingValue = "50" },
            new AppSetting { SettingKey = "PayoutPercent", SettingValue = "10" });
        _db.SaveChanges();

        var uow = new UnitOfWork(_db);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Availability:HeartbeatMinutes"] = "15"
        }).Build();

        _orders = new OrderService(
            uow,
            new NoOpRiderNotifications(),
            new NoOpOps(),
            config,
            NullLogger<OrderService>.Instance);

        var crypto = new FakeCrypto();
        _admin = new AdminService(
            uow,
            crypto,
            new PasswordVerifier(crypto),
            new NoOpOps(),
            new NoOpRiderNotifications(),
            new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Location:StaleSeconds"] = "90"
            }).Build(),
            NullLogger<AdminService>.Instance);

        _finance = new RiderFinanceService(uow);
        _adminActor = new AdminActor
        {
            UserId = _adminId,
            WorkerId = "ADM",
            Name = "Admin",
            StoreId = "S1",
            Roles = new List<string> { RoleNames.Administrator }
        };
    }

    public void Dispose() => _db.Dispose();

    [Fact]
    public async Task Fixture_collections_handover_isolation_and_idempotent_retry()
    {
        var idA = await SeedAndCompleteAsync("OA", expected: 1000m, collected: 1000m);
        var idB = await SeedAndCompleteAsync("OB", expected: 500m, collected: 450m, reason: "short change");

        var summary = (await _finance.GetSummaryAsync(_riderA, null, null)).Data!;
        Assert.Equal(1450m, summary.cashCollectedTotal);
        Assert.Equal(50m, summary.codShortageTotal);
        Assert.Equal(1450m, summary.cashHeld);
        Assert.Equal(0m, summary.cashHandedOverTotal);
        Assert.True(summary.compensationAvailable);
        Assert.Equal(100m, summary.calculatedCompensation); // 2 * fixed 50 — not COD

        var ho = await _admin.ConfirmCashHandoverAsync(_adminActor, idA, new CashHandoverRequest
        {
            amount = 1000m,
            requestId = "ho-a-1"
        });
        Assert.True(ho.status, ho.message);

        summary = (await _finance.GetSummaryAsync(_riderA, null, null)).Data!;
        Assert.Equal(450m, summary.cashHeld);
        Assert.Equal(1000m, summary.cashHandedOverTotal);

        var retry = await _admin.ConfirmCashHandoverAsync(_adminActor, idA, new CashHandoverRequest
        {
            amount = 1000m,
            requestId = "ho-a-1"
        });
        Assert.True(retry.status, retry.message);
        summary = (await _finance.GetSummaryAsync(_riderA, null, null)).Data!;
        Assert.Equal(450m, summary.cashHeld);

        var orderA = await _db.AssignedOrders.AsNoTracking().FirstAsync(o => o.Id == idA);
        Assert.Equal(1000m, orderA.CashHandedOverAmount);

        var bSummary = (await _finance.GetSummaryAsync(_riderB, null, null)).Data!;
        Assert.Equal(0m, bSummary.cashHeld);
        Assert.Equal(0m, bSummary.cashCollectedTotal);

        var bHandover = await _admin.ConfirmCashHandoverAsync(
            new AdminActor
            {
                UserId = _riderB,
                WorkerId = "RD-B",
                Name = "B",
                StoreId = "S2",
                Roles = new List<string> { RoleNames.Manager }
            },
            idB,
            new CashHandoverRequest { amount = 450m, requestId = "ho-b-steal" });
        Assert.False(bHandover.status);

        var still = await _db.AssignedOrders.AsNoTracking().FirstAsync(o => o.Id == idB);
        Assert.Null(still.CashHandedOverAmount);
    }

    [Fact]
    public async Task Accepted_uncollected_and_prepaid_contribute_zero_cash_held()
    {
        var acceptedId = await SeedAvailableAsync("ACC", 200m, "cash");
        Assert.True((await _orders.UpdateRiderStatusAsync(acceptedId, _riderA,
            new UpdateOrderStatusRequest { status = OrderStatuses.Accepted })).status);

        var prepaidId = await SeedAvailableAsync("PRE", null, "card");
        await CompleteLifecycleAsync(prepaidId, cashCollected: null);

        var summary = (await _finance.GetSummaryAsync(_riderA, null, null)).Data!;
        Assert.Equal(0m, summary.cashHeld);
        Assert.Equal(0m, summary.cashCollectedTotal);

        var prepaid = await _db.AssignedOrders.AsNoTracking().FirstAsync(o => o.Id == prepaidId);
        Assert.Equal(OrderStatuses.Completed, prepaid.Status);
        Assert.Null(prepaid.CashCollected);
    }

    [Fact]
    public async Task Partial_handover_and_rejects_negative_or_excessive()
    {
        var id = await SeedAndCompleteAsync("PH", 1000m, 1000m);

        var neg = await _admin.ConfirmCashHandoverAsync(_adminActor, id, new CashHandoverRequest
        {
            amount = -10m,
            requestId = "ho-neg"
        });
        Assert.False(neg.status);

        var over = await _admin.ConfirmCashHandoverAsync(_adminActor, id, new CashHandoverRequest
        {
            amount = 1001m,
            requestId = "ho-over"
        });
        Assert.False(over.status);

        var part = await _admin.ConfirmCashHandoverAsync(_adminActor, id, new CashHandoverRequest
        {
            amount = 400m,
            requestId = "ho-part-1"
        });
        Assert.True(part.status, part.message);

        var summary = (await _finance.GetSummaryAsync(_riderA, null, null)).Data!;
        Assert.Equal(600m, summary.cashHeld);
        Assert.Equal(400m, summary.cashHandedOverTotal);

        var rest = await _admin.ConfirmCashHandoverAsync(_adminActor, id, new CashHandoverRequest
        {
            amount = 600m,
            requestId = "ho-part-2"
        });
        Assert.True(rest.status, rest.message);
        summary = (await _finance.GetSummaryAsync(_riderA, null, null)).Data!;
        Assert.Equal(0m, summary.cashHeld);
    }

    [Fact]
    public async Task Legacy_ambiguous_excluded_from_definitive_cash_held()
    {
        var batch = new AssignedOrderBatch { StoreId = "S1", Time = "now", CreatedAt = DateTime.UtcNow };
        _db.AssignedOrderBatches.Add(batch);
        await _db.SaveChangesAsync();

        _db.AssignedOrders.Add(new AssignedOrder
        {
            BatchId = batch.Id,
            OrderId = "LEG",
            OrderNo = "LEG",
            OrderTypeId = "D",
            OrderState = "Done",
            Comment = "",
            LastName = "L",
            FirstName = "F",
            City = "C",
            Street = "S",
            AddressNo = "1",
            PostCode = "0",
            SecondaryAddress = "",
            Phone = "0",
            OrderTime = "now",
            Status = OrderStatuses.Completed,
            PaymentMethod = "cash",
            Cash = 300,
            ExpectedCash = 300,
            CashCollected = 300,
            CashSemanticsNote = CashSemantics.LegacyAmbiguous,
            AcceptedByUserId = _riderA,
            CompletedAt = DateTime.UtcNow,
            OrderTotal = 300,
            CreatedAt = DateTime.UtcNow,
            Items = new List<AssignedOrderItem>()
        });
        await _db.SaveChangesAsync();

        var summary = (await _finance.GetSummaryAsync(_riderA, null, null)).Data!;
        Assert.Equal(0m, summary.cashHeld);
        Assert.Equal(1, summary.legacyAmbiguousCount);
    }

    [Fact]
    public async Task Period_filter_does_not_silently_become_all_time_balance()
    {
        var oldId = await SeedAndCompleteAsync("OLD", 1000m, 1000m);
        var old = await _db.AssignedOrders.FirstAsync(o => o.Id == oldId);
        old.CompletedAt = DateTime.UtcNow.AddDays(-40);
        old.CreatedAt = DateTime.UtcNow.AddDays(-40);
        await _db.SaveChangesAsync();

        await SeedAndCompleteAsync("NEW", 200m, 200m);

        var period = (await _finance.GetSummaryAsync(
            _riderA,
            DateTime.UtcNow.AddDays(-7),
            DateTime.UtcNow.AddDays(1))).Data!;
        Assert.True(period.isPeriodFilter);
        Assert.Equal(200m, period.cashHeld);

        var all = (await _finance.GetSummaryAsync(_riderA, null, null)).Data!;
        Assert.False(all.isPeriodFilter);
        Assert.Equal(1200m, all.cashHeld);
    }

    [Fact]
    public async Task Compensation_unavailable_when_settings_unresolved()
    {
        _db.AppSettings.RemoveRange(_db.AppSettings);
        await _db.SaveChangesAsync();

        await SeedAndCompleteAsync("C1", 100m, 100m);
        var summary = (await _finance.GetSummaryAsync(_riderA, null, null)).Data!;
        Assert.False(summary.compensationAvailable);
        Assert.Null(summary.calculatedCompensation);
        Assert.Contains("unresolved", summary.compensationNote!, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(100m, summary.cashHeld); // COD still definitive
    }

    private async Task<long> SeedAndCompleteAsync(
        string orderId, decimal expected, decimal collected, string? reason = null)
    {
        var id = await SeedAvailableAsync(orderId, expected, "cash");
        await CompleteLifecycleAsync(id, collected, reason);
        return id;
    }

    private async Task CompleteLifecycleAsync(long id, decimal? cashCollected, string? reason = null)
    {
        Assert.True((await _orders.UpdateRiderStatusAsync(id, _riderA,
            new UpdateOrderStatusRequest { status = OrderStatuses.Accepted })).status);
        Assert.True((await _orders.UpdateRiderStatusAsync(id, _riderA,
            new UpdateOrderStatusRequest { status = OrderStatuses.InProgress })).status);
        var complete = await _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest
        {
            status = OrderStatuses.Completed,
            cashCollected = cashCollected,
            cashCollectedReason = reason,
            requestId = $"complete-{id}-{cashCollected}"
        });
        Assert.True(complete.status, complete.message);
    }

    private async Task<long> SeedAvailableAsync(string orderId, decimal? expectedCash, string payment)
    {
        var batch = new AssignedOrderBatch { StoreId = "S1", Time = "now", CreatedAt = DateTime.UtcNow };
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
            PaymentMethod = payment,
            Cash = expectedCash,
            ExpectedCash = expectedCash,
            OrderTotal = expectedCash ?? 50m,
            CreatedAt = DateTime.UtcNow,
            Items = new List<AssignedOrderItem>()
        };
        _db.AssignedOrders.Add(order);
        await _db.SaveChangesAsync();
        return order.Id;
    }

    private static AppUser OnlineRider(Guid id, string workerId) => new()
    {
        UserId = id,
        ThirdPartyEmployeeId = workerId,
        UserName = workerId,
        IsActive = true,
        IsVerified = true,
        StoreId = "S1",
        IsAvailableOnline = true,
        LastSeenAt = DateTime.UtcNow
    };

    private sealed class FakeCrypto : IPasswordCrypto
    {
        public byte[]? Encrypt(string plainText) => System.Text.Encoding.UTF8.GetBytes(plainText);
        public string? Decrypt(byte[]? cipherText) => cipherText == null ? null : System.Text.Encoding.UTF8.GetString(cipherText);
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
