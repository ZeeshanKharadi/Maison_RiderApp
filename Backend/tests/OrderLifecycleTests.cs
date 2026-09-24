using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Rider.Application.DTOs.Notifications;
using Rider.Application.DTOs.Orders;
using Rider.Application.Interfaces;
using Rider.Domain.Common;
using Rider.Domain.Entities;
using Rider.Infrastructure.Services;
using Rider.Persistence.Contexts;
using Rider.Persistence.Repositories;

namespace Rider.Tests;

public class OrderLifecycleTests : IDisposable
{
    private readonly ApplicationDbContext _db;
    private readonly OrderService _orders;
    private readonly Guid _riderA = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private readonly Guid _riderB = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    public OrderLifecycleTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase("orders-" + Guid.NewGuid())
            .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
            .Options;
        _db = new ApplicationDbContext(options);
        _db.Database.EnsureCreated();

        _db.Users.AddRange(
            new AppUser
            {
                UserId = _riderA,
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
                UserId = _riderB,
                ThirdPartyEmployeeId = "RD-B",
                UserName = "B",
                IsActive = true,
                IsVerified = true,
                StoreId = "S1",
                IsAvailableOnline = true,
                LastSeenAt = DateTime.UtcNow
            });
        _db.Stores.Add(new Store { StoreId = "S1", Name = "Store 1", IsActive = true });
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

    private async Task<long> SeedAvailableOrderAsync(string orderId = "O1", decimal? expectedCash = 100m, string payment = "cash")
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
            OrderTotal = 500,
            CreatedAt = DateTime.UtcNow,
            Items = new List<AssignedOrderItem>()
        };
        _db.AssignedOrders.Add(order);
        await _db.SaveChangesAsync();
        return order.Id;
    }

    [Fact]
    public async Task Two_riders_race_accept_only_one_wins()
    {
        var id = await SeedAvailableOrderAsync();

        var t1 = _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest { status = OrderStatuses.Accepted });
        var t2 = _orders.UpdateRiderStatusAsync(id, _riderB, new UpdateOrderStatusRequest { status = OrderStatuses.Accepted });
        var results = await Task.WhenAll(t1, t2);
        var wins = results.Count(r => r.status);
        Assert.Equal(1, wins);

        var order = await _db.AssignedOrders.AsNoTracking().FirstAsync(o => o.Id == id);
        Assert.Equal(OrderStatuses.Accepted, order.Status);
        Assert.True(order.AcceptedByUserId == _riderA || order.AcceptedByUserId == _riderB);
    }

    [Fact]
    public async Task Max_five_active_enforced()
    {
        for (var i = 0; i < 5; i++)
        {
            var id = await SeedAvailableOrderAsync("M" + i);
            var r = await _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest { status = OrderStatuses.Accepted });
            Assert.True(r.status, r.message);
        }

        var sixth = await SeedAvailableOrderAsync("M6");
        var fail = await _orders.UpdateRiderStatusAsync(sixth, _riderA, new UpdateOrderStatusRequest { status = OrderStatuses.Accepted });
        Assert.False(fail.status);
        Assert.Contains("Maximum", fail.message);
    }

    [Fact]
    public async Task Pickup_required_before_complete()
    {
        var id = await SeedAvailableOrderAsync();
        Assert.True((await _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest { status = OrderStatuses.Accepted })).status);

        var complete = await _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest
        {
            status = OrderStatuses.Completed,
            cashCollected = 100
        });
        Assert.False(complete.status);
        Assert.Contains("Pickup", complete.message);
    }

    [Fact]
    public async Task Idempotent_complete_same_cash_succeeds()
    {
        var id = await SeedAvailableOrderAsync();
        await _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest { status = OrderStatuses.Accepted });
        await _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest { status = OrderStatuses.InProgress });

        var first = await _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest
        {
            status = OrderStatuses.Completed,
            cashCollected = 100,
            requestId = "req-1"
        });
        Assert.True(first.status, first.message);

        var second = await _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest
        {
            status = OrderStatuses.Completed,
            cashCollected = 100,
            requestId = "req-1"
        });
        Assert.True(second.status, second.message);

        var differentCash = await _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest
        {
            status = OrderStatuses.Completed,
            cashCollected = 90
        });
        Assert.False(differentCash.status);
    }

    [Fact]
    public async Task Cod_mismatch_without_reason_fails()
    {
        var id = await SeedAvailableOrderAsync(expectedCash: 100);
        await _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest { status = OrderStatuses.Accepted });
        await _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest { status = OrderStatuses.InProgress });

        var fail = await _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest
        {
            status = OrderStatuses.Completed,
            cashCollected = 80
        });
        Assert.False(fail.status);
        Assert.Contains("cashCollectedReason", fail.message);
    }

    [Fact]
    public async Task Same_requestId_different_cash_is_conflict()
    {
        var id = await SeedAvailableOrderAsync();
        await _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest { status = OrderStatuses.Accepted });
        await _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest { status = OrderStatuses.InProgress });

        var first = await _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest
        {
            status = OrderStatuses.Completed,
            cashCollected = 100,
            requestId = "req-conflict"
        });
        Assert.True(first.status, first.message);

        var conflict = await _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest
        {
            status = OrderStatuses.Completed,
            cashCollected = 80,
            requestId = "req-conflict"
        });
        Assert.False(conflict.status);
        Assert.Contains("Conflicting", conflict.message);

        var order = await _db.AssignedOrders.AsNoTracking().FirstAsync(o => o.Id == id);
        Assert.Equal(100m, order.CashCollected);
    }

    [Fact]
    public async Task Offline_rider_cannot_accept()
    {
        var rider = await _db.Users.FirstAsync(u => u.UserId == _riderA);
        rider.IsAvailableOnline = false;
        await _db.SaveChangesAsync();

        var id = await SeedAvailableOrderAsync("OFF1");
        var fail = await _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest { status = OrderStatuses.Accepted });
        Assert.False(fail.status);
        Assert.Contains("online", fail.message, StringComparison.OrdinalIgnoreCase);

        var order = await _db.AssignedOrders.AsNoTracking().FirstAsync(o => o.Id == id);
        Assert.Equal(OrderStatuses.Available, order.Status);
        Assert.Null(order.AcceptedByUserId);
    }

    [Fact]
    public async Task Fine_grained_forward_transitions_succeed()
    {
        var id = await SeedAvailableOrderAsync("FG1");
        Assert.True((await _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest { status = OrderStatuses.Accepted })).status);

        string[] steps =
        {
            OrderStatuses.NavigatingToPickup,
            OrderStatuses.ArrivedAtPickup,
            OrderStatuses.InProgress,
            OrderStatuses.OnTheWay,
            OrderStatuses.ArrivedAtCustomer,
            OrderStatuses.Delivered
        };
        foreach (var step in steps)
        {
            var r = await _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest { status = step });
            Assert.True(r.status, $"{step}: {r.message}");
            var row = await _db.AssignedOrders.AsNoTracking().FirstAsync(o => o.Id == id);
            Assert.Equal(step, row.Status);
        }

        var complete = await _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest
        {
            status = OrderStatuses.Completed,
            cashCollected = 100
        });
        Assert.True(complete.status, complete.message);
    }

    [Fact]
    public async Task Fine_grained_backward_fails()
    {
        var id = await SeedAvailableOrderAsync("FG2");
        await _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest { status = OrderStatuses.Accepted });
        await _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest { status = OrderStatuses.OnTheWay });

        var back = await _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest
        {
            status = OrderStatuses.NavigatingToPickup
        });
        Assert.False(back.status);
        var row = await _db.AssignedOrders.AsNoTracking().FirstAsync(o => o.Id == id);
        Assert.Equal(OrderStatuses.OnTheWay, row.Status);
    }

    [Fact]
    public async Task Active_count_includes_fine_grained_statuses()
    {
        var id = await SeedAvailableOrderAsync("FG3");
        await _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest { status = OrderStatuses.Accepted });
        await _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest { status = OrderStatuses.ArrivedAtCustomer });

        var active = await _orders.GetActiveOrdersAsync(_riderA);
        Assert.True(active.status);
        Assert.Contains(active.Data!, o => o.id == id);
        Assert.Equal(OrderStatuses.ArrivedAtCustomer, active.Data!.First(o => o.id == id).status);
    }

    [Fact]
    public async Task Reject_leaves_pool_available_and_records_rejection()
    {
        var id = await SeedAvailableOrderAsync("RJ1");
        var reject = await _orders.RejectOrderAsync(id, _riderA, new RejectOrderRequest { reason = "too far" });
        Assert.True(reject.status, reject.message);

        var order = await _db.AssignedOrders.AsNoTracking().FirstAsync(o => o.Id == id);
        Assert.Equal(OrderStatuses.Available, order.Status);

        var rej = await _db.OrderRejections.AsNoTracking().FirstOrDefaultAsync(r => r.AssignedOrderId == id);
        Assert.NotNull(rej);
        Assert.Equal(_riderA, rej!.RiderUserId);

        var audit = await _db.OrderLifecycleAudits.AsNoTracking()
            .FirstOrDefaultAsync(a => a.AssignedOrderId == id && a.NewStatus == OrderStatuses.Rejected);
        Assert.NotNull(audit);
    }

    [Fact]
    public async Task Location_update_requires_active_delivery_and_clears_after_complete()
    {
        var denied = await _orders.UpdateRiderLocationAsync(_riderA, new UpdateRiderLocationRequest
        {
            latitude = 24.86,
            longitude = 67.00
        });
        Assert.False(denied.status);

        var id = await SeedAvailableOrderAsync("LOC1");
        Assert.True((await _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest { status = OrderStatuses.Accepted })).status);

        var ok = await _orders.UpdateRiderLocationAsync(_riderA, new UpdateRiderLocationRequest
        {
            latitude = 24.861,
            longitude = 67.002
        });
        Assert.True(ok.status, ok.message);
        Assert.Equal(24.861, ok.Data!.latitude, 3);

        var user = await _db.Users.AsNoTracking().FirstAsync(u => u.UserId == _riderA);
        Assert.NotNull(user.LastLatitude);
        Assert.NotNull(user.LocationUpdatedAt);

        Assert.True((await _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest { status = OrderStatuses.InProgress })).status);
        Assert.True((await _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest
        {
            status = OrderStatuses.Completed,
            cashCollected = 100
        })).status);

        user = await _db.Users.AsNoTracking().FirstAsync(u => u.UserId == _riderA);
        Assert.Null(user.LastLatitude);
        Assert.Null(user.LocationUpdatedAt);
    }

    private sealed class NoOpRiderNotifications : IRiderNotificationService
    {
        public Task NotifyDirectAssignmentAsync(Guid riderUserId, string orderId, long? assignedOrderId, string storeId, decimal orderTotal)
            => Task.CompletedTask;

        public Task NotifyOpenPoolOrderAsync(string orderId, long? assignedOrderId, string storeId, decimal orderTotal)
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
