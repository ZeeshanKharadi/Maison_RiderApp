using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Rider.Application.DTOs.Admin;
using Rider.Application.DTOs.Float;
using Rider.Application.DTOs.Orders;
using Rider.Application.Interfaces;
using Rider.Domain.Common;
using Rider.Domain.Entities;
using Rider.Infrastructure.Services;
using Rider.Persistence.Contexts;
using Rider.Persistence.Repositories;

namespace Rider.Tests;

/// <summary>Critical money rules: exact COD, float issue→ack→return, return cap.</summary>
public class FloatMoneyTests : IDisposable
{
    private readonly ApplicationDbContext _db;
    private readonly OrderService _orders;
    private readonly RiderFloatService _float;
    private readonly Guid _rider = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private readonly Guid _adminId = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private readonly AdminActor _admin;

    public FloatMoneyTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase("float-money-" + Guid.NewGuid())
            .ConfigureWarnings(w => w.Ignore(
                Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
            .Options;
        _db = new ApplicationDbContext(options);
        _db.Database.EnsureCreated();
        _db.Users.AddRange(
            new AppUser
            {
                UserId = _rider, ThirdPartyEmployeeId = "RD", UserName = "Rider",
                IsActive = true, IsVerified = true, StoreId = "S1",
                IsAvailableOnline = true, LastSeenAt = DateTime.UtcNow
            },
            new AppUser
            {
                UserId = _adminId, ThirdPartyEmployeeId = "ADM", UserName = "Admin",
                IsActive = true, IsVerified = true, StoreId = "S1"
            });
        _db.SaveChanges();

        var uow = new UnitOfWork(_db);
        var config = new Microsoft.Extensions.Configuration.ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Availability:HeartbeatMinutes"] = "15" })
            .Build();
        _float = new RiderFloatService(uow);
        _orders = new OrderService(
            uow,
            new NoOpN(),
            new NoOpO(),
            config,
            Microsoft.Extensions.Logging.Abstractions.NullLogger<OrderService>.Instance);
        _admin = new AdminActor
        {
            UserId = _adminId, WorkerId = "ADM", Name = "Admin", StoreId = "S1",
            Roles = new List<string> { RoleNames.Administrator }
        };
    }

    public void Dispose() => _db.Dispose();

    [Fact]
    public async Task Exact_cod_required_overpayment_and_underpayment_fail()
    {
        var id = await SeedInProgress(2100m);
        Assert.False((await Complete(id, 2000m)).status);
        Assert.False((await Complete(id, 2200m)).status);
        Assert.True((await Complete(id, 2100m)).status);
        var order = await _db.AssignedOrders.AsNoTracking().FirstAsync(o => o.Id == id);
        Assert.Equal(2100m, order.CashCollected);
    }

    [Fact]
    public async Task Float_issue_ack_return_and_cannot_over_return()
    {
        var issue = await _float.IssueAsync(_admin, new FloatMutationRequest
        {
            riderUserId = _rider, storeId = "S1", amount = 2000m, requestId = "iss-1"
        });
        Assert.True(issue.status, issue.message);
        Assert.Equal(0m, await _float.GetOutstandingFloatAsync(_rider));

        var ack = await _float.AcknowledgeAsync(_rider, new FloatAcknowledgeRequest
        {
            issueId = issue.Data!.id, requestId = "ack-1"
        });
        Assert.True(ack.status, ack.message);
        Assert.Equal(2000m, await _float.GetOutstandingFloatAsync(_rider));

        var tooMuch = await _float.RecordReturnAsync(_admin, new FloatMutationRequest
        {
            riderUserId = _rider, storeId = "S1", amount = 2500m, requestId = "ret-x"
        });
        Assert.False(tooMuch.status);

        var ret = await _float.RecordReturnAsync(_admin, new FloatMutationRequest
        {
            riderUserId = _rider, storeId = "S1", amount = 500m, requestId = "ret-1"
        });
        Assert.True(ret.status, ret.message);
        Assert.Equal(1500m, await _float.GetOutstandingFloatAsync(_rider));

        var replay = await _float.IssueAsync(_admin, new FloatMutationRequest
        {
            riderUserId = _rider, storeId = "S1", amount = 2000m, requestId = "iss-1"
        });
        Assert.True(replay.status);
        Assert.Equal(1, await _db.Set<RiderFloatLedger>().CountAsync(e => e.EntryType == FloatEntryTypes.Issue));
    }

    [Fact]
    public async Task Return_is_scoped_to_originating_store_wallet_remains_rider_wide()
    {
        var s1 = await _float.IssueAsync(_admin, new FloatMutationRequest
        {
            riderUserId = _rider, storeId = "S1", amount = 1000m, requestId = "iss-s1"
        });
        Assert.True(s1.status, s1.message);
        Assert.True((await _float.AcknowledgeAsync(_rider, new FloatAcknowledgeRequest
        {
            issueId = s1.Data!.id, requestId = "ack-s1"
        })).status);

        // Administrator (head office) may issue float from another store for the same rider.
        var hoAdmin = new AdminActor
        {
            UserId = _adminId, WorkerId = "ADM", Name = "Admin", StoreId = null,
            Roles = new List<string> { RoleNames.Administrator }
        };
        var s2 = await _float.IssueAsync(hoAdmin, new FloatMutationRequest
        {
            riderUserId = _rider, storeId = "S2", amount = 400m, requestId = "iss-s2"
        });
        Assert.True(s2.status, s2.message);
        Assert.True((await _float.AcknowledgeAsync(_rider, new FloatAcknowledgeRequest
        {
            issueId = s2.Data!.id, requestId = "ack-s2"
        })).status);

        Assert.Equal(1400m, await _float.GetOutstandingFloatAsync(_rider));

        var overFromS1 = await _float.RecordReturnAsync(_admin, new FloatMutationRequest
        {
            riderUserId = _rider, storeId = "S1", amount = 1200m, requestId = "ret-s1-over"
        });
        Assert.False(overFromS1.status);

        var retS1 = await _float.RecordReturnAsync(_admin, new FloatMutationRequest
        {
            riderUserId = _rider, storeId = "S1", amount = 1000m, requestId = "ret-s1"
        });
        Assert.True(retS1.status, retS1.message);
        Assert.Equal(400m, await _float.GetOutstandingFloatAsync(_rider));

        var conflictReplay = await _float.RecordReturnAsync(_admin, new FloatMutationRequest
        {
            riderUserId = _rider, storeId = "S1", amount = 900m, requestId = "ret-s1"
        });
        Assert.False(conflictReplay.status);
    }

    private async Task<ApiResponse<AvailableOrderDto>> Complete(long id, decimal amount)
        => await _orders.UpdateRiderStatusAsync(id, _rider, new UpdateOrderStatusRequest
        {
            status = OrderStatuses.Completed,
            cashCollected = amount,
            requestId = $"c-{id}-{amount}-{Guid.NewGuid():N}"
        });

    private async Task<long> SeedInProgress(decimal expected)
    {
        var batch = new AssignedOrderBatch { StoreId = "S1", Time = "now", CreatedAt = DateTime.UtcNow };
        _db.AssignedOrderBatches.Add(batch);
        await _db.SaveChangesAsync();
        var order = new AssignedOrder
        {
            BatchId = batch.Id, OrderId = "F" + Guid.NewGuid().ToString("N")[..6], OrderNo = "F",
            OrderTypeId = "D", OrderState = "", FirstName = "C", LastName = "U",
            Street = "S", AddressNo = "1", City = "C", PostCode = "0", SecondaryAddress = "",
            Phone = "0", Comment = "", OrderTime = "now", Status = OrderStatuses.Available,
            PaymentMethod = "cash", ExpectedCash = expected, Cash = expected, OrderTotal = expected,
            CreatedAt = DateTime.UtcNow, Items = new List<AssignedOrderItem>()
        };
        _db.AssignedOrders.Add(order);
        await _db.SaveChangesAsync();
        Assert.True((await _orders.UpdateRiderStatusAsync(order.Id, _rider,
            new UpdateOrderStatusRequest { status = OrderStatuses.Accepted })).status);
        Assert.True((await _orders.UpdateRiderStatusAsync(order.Id, _rider,
            new UpdateOrderStatusRequest { status = OrderStatuses.InProgress })).status);
        return order.Id;
    }

    private sealed class NoOpN : IRiderNotificationService
    {
        public Task NotifyDirectAssignmentAsync(Guid riderUserId, string orderId, long? assignedOrderId, string storeId, decimal orderTotal) => Task.CompletedTask;
        public Task NotifyOpenPoolOrderAsync(string orderId, long? assignedOrderId, string storeId, decimal orderTotal) => Task.CompletedTask;
        public Task NotifyOrderCancelledAsync(Guid riderUserId, string orderId, long? assignedOrderId, string? cancelReason) => Task.CompletedTask;
        public Task<ApiResponse<List<Rider.Application.DTOs.Notifications.RiderNotificationDto>>> ListForUserAsync(Guid userId, int take = 50) => throw new NotImplementedException();
        public Task<ApiResponse<string>> MarkReadAsync(Guid userId, long notificationId) => throw new NotImplementedException();
        public Task<ApiResponse<string>> MarkAllReadAsync(Guid userId) => throw new NotImplementedException();
        public Task<ApiResponse<string>> SoftDeleteAsync(Guid userId, long notificationId) => throw new NotImplementedException();
        public Task<ApiResponse<string>> SoftDeleteAllAsync(Guid userId) => throw new NotImplementedException();
        public Task<ApiResponse<Rider.Application.DTOs.Notifications.SendNotificationResultDto>> SendTestToUserAsync(Rider.Application.DTOs.Notifications.SendNotificationRequest request) => throw new NotImplementedException();
        public Task<ApiResponse<Rider.Application.DTOs.Notifications.SendNotificationResultDto>> BroadcastTestAsync(Rider.Application.DTOs.Notifications.BroadcastNotificationRequest request) => throw new NotImplementedException();
    }

    private sealed class NoOpO : IOpsEventPublisher
    {
        public Task PublishOrderChangedAsync(string? storeId, long assignedOrderId, string orderId, string status, CancellationToken ct = default) => Task.CompletedTask;
        public Task PublishRiderAvailabilityChangedAsync(string? storeId, Guid riderUserId, bool isOnline, CancellationToken ct = default) => Task.CompletedTask;
        public Task PublishAdminNotificationCreatedAsync(string? storeId, long notificationId, string title, CancellationToken ct = default) => Task.CompletedTask;
        public Task PublishRiderLocationChangedAsync(string? storeId, Guid riderUserId, double? latitude, double? longitude, DateTime? locationUpdatedAt, int activeOrderCount, string? deliveryStatus, bool cleared, CancellationToken ct = default) => Task.CompletedTask;
    }
}
