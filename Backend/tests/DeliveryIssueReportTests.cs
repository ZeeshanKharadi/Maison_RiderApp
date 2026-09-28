using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Rider.Application.DTOs.Admin;
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

public class DeliveryIssueReportTests : IDisposable
{
    private readonly ApplicationDbContext _db;
    private readonly OrderService _orders;
    private readonly AdminService _admin;
    private readonly Guid _riderA = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private readonly Guid _riderB = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private readonly Guid _adminId = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private readonly AdminActor _headOffice;
    private readonly AdminActor _managerS1;

    public DeliveryIssueReportTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase("issue-" + Guid.NewGuid())
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
                UserId = _riderA,
                ThirdPartyEmployeeId = "RD-A",
                UserName = "Rider A",
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
                UserName = "Rider B",
                IsActive = true,
                IsVerified = true,
                StoreId = "S2",
                IsAvailableOnline = true,
                LastSeenAt = DateTime.UtcNow
            },
            new AppUser
            {
                UserId = _adminId,
                ThirdPartyEmployeeId = "ADM",
                UserName = "Admin",
                IsActive = true,
                IsVerified = true,
                StoreId = null
            });
        _db.SaveChanges();

        var uow = new UnitOfWork(_db);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Availability:HeartbeatMinutes"] = "15"
        }).Build();
        var crypto = new FakeCrypto();
        var verifier = new PasswordVerifier(crypto);

        _orders = new OrderService(
            uow,
            new NoOpRiderNotifications(),
            new NoOpOpsEventPublisher(),
            config,
            NullLogger<OrderService>.Instance);

        _admin = new AdminService(
            uow,
            crypto,
            verifier,
            new NoOpOpsEventPublisher(),
            new NoOpRiderNotifications(),
            config,
            NullLogger<AdminService>.Instance);

        _headOffice = new AdminActor
        {
            UserId = _adminId,
            WorkerId = "ADM",
            Name = "Admin",
            StoreId = null,
            Roles = new List<string> { RoleNames.Administrator }
        };
        _managerS1 = new AdminActor
        {
            UserId = Guid.Parse("11111111-1111-1111-1111-111111111111"),
            WorkerId = "MGR1",
            Name = "Mgr S1",
            StoreId = "S1",
            Roles = new List<string> { RoleNames.Manager }
        };
    }

    public void Dispose() => _db.Dispose();

    private async Task<long> SeedActiveForRiderAsync(
        Guid riderId,
        string storeId,
        string orderId,
        string status = OrderStatuses.InProgress)
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
            Status = status,
            AcceptedByUserId = riderId,
            AcceptedAt = DateTime.UtcNow.AddMinutes(-10),
            PickedUpAt = status is OrderStatuses.InProgress or OrderStatuses.OnTheWay
                ? DateTime.UtcNow.AddMinutes(-5)
                : null,
            CreatedAt = DateTime.UtcNow.AddMinutes(-15),
            UpdatedAt = DateTime.UtcNow
        };
        _db.AssignedOrders.Add(order);
        await _db.SaveChangesAsync();
        return order.Id;
    }

    [Fact]
    public async Task Owner_can_report_issue_without_changing_status_or_cash()
    {
        var id = await SeedActiveForRiderAsync(_riderA, "S1", "ISSUE-1");
        var before = await _db.AssignedOrders.AsNoTracking().FirstAsync(o => o.Id == id);

        var res = await _orders.ReportDeliveryIssueAsync(id, _riderA, new ReportDeliveryIssueRequest
        {
            reason = DeliveryIssueReasons.CustomerUnreachable,
            note = "No answer after 2 calls",
            requestId = "req-1"
        });

        Assert.True(res.status, res.message);
        Assert.NotNull(res.Data);
        Assert.Equal(DeliveryIssueReasons.CustomerUnreachable, res.Data!.reasonCode);
        Assert.Equal("No answer after 2 calls", res.Data.note);

        var after = await _db.AssignedOrders.AsNoTracking().FirstAsync(o => o.Id == id);
        Assert.Equal(before.Status, after.Status);
        Assert.Equal(before.CashCollected, after.CashCollected);
        Assert.Equal(before.CashHandedOverAmount, after.CashHandedOverAmount);
        Assert.Equal(before.AcceptedByUserId, after.AcceptedByUserId);

        Assert.Equal(1, await _db.DeliveryIssueReports.CountAsync());
        Assert.Equal(1, await _db.AdminNotifications.CountAsync(n => n.Title == "Delivery issue reported"));
        Assert.Contains(
            await _db.OrderLifecycleAudits.Where(a => a.AssignedOrderId == id).ToListAsync(),
            a => a.NewStatus == DeliveryIssueReasons.AuditEventStatus);
    }

    [Fact]
    public async Task Other_reason_requires_note_and_invalid_reason_rejected()
    {
        var id = await SeedActiveForRiderAsync(_riderA, "S1", "ISSUE-2");

        var missing = await _orders.ReportDeliveryIssueAsync(id, _riderA, new ReportDeliveryIssueRequest
        {
            reason = DeliveryIssueReasons.Other,
            requestId = "req-other-1"
        });
        Assert.False(missing.status);
        Assert.Contains("note", missing.message, StringComparison.OrdinalIgnoreCase);

        var bad = await _orders.ReportDeliveryIssueAsync(id, _riderA, new ReportDeliveryIssueRequest
        {
            reason = "VehicleBroken",
            requestId = "req-bad"
        });
        Assert.False(bad.status);
        Assert.Contains("Invalid reason", bad.message, StringComparison.OrdinalIgnoreCase);

        Assert.Equal(0, await _db.DeliveryIssueReports.CountAsync());
    }

    [Fact]
    public async Task Non_owner_and_cross_store_cannot_report()
    {
        var id = await SeedActiveForRiderAsync(_riderA, "S1", "ISSUE-3");

        var otherRider = await _orders.ReportDeliveryIssueAsync(id, _riderB, new ReportDeliveryIssueRequest
        {
            reason = DeliveryIssueReasons.AddressIssue,
            requestId = "req-x"
        });
        Assert.False(otherRider.status);
        Assert.True(
            otherRider.message.Contains("not found", StringComparison.OrdinalIgnoreCase)
            || otherRider.message.Contains("another rider", StringComparison.OrdinalIgnoreCase));

        Assert.Equal(0, await _db.DeliveryIssueReports.CountAsync());
    }

    [Fact]
    public async Task Idempotent_retry_returns_same_report()
    {
        var id = await SeedActiveForRiderAsync(_riderA, "S1", "ISSUE-4");
        var req = new ReportDeliveryIssueRequest
        {
            reason = DeliveryIssueReasons.CustomerRefused,
            note = "Left at door refused",
            requestId = "idem-1"
        };

        var first = await _orders.ReportDeliveryIssueAsync(id, _riderA, req);
        var second = await _orders.ReportDeliveryIssueAsync(id, _riderA, req);

        Assert.True(first.status);
        Assert.True(second.status);
        Assert.Equal(first.Data!.id, second.Data!.id);
        Assert.Equal(1, await _db.DeliveryIssueReports.CountAsync());
    }

    [Fact]
    public async Task Same_requestId_with_changed_reason_or_note_is_conflict()
    {
        var id = await SeedActiveForRiderAsync(_riderA, "S1", "ISSUE-4B");
        Assert.True((await _orders.ReportDeliveryIssueAsync(id, _riderA, new ReportDeliveryIssueRequest
        {
            reason = DeliveryIssueReasons.CustomerUnreachable,
            note = "First note",
            requestId = "idem-conflict"
        })).status);

        var changedReason = await _orders.ReportDeliveryIssueAsync(id, _riderA, new ReportDeliveryIssueRequest
        {
            reason = DeliveryIssueReasons.AddressIssue,
            note = "First note",
            requestId = "idem-conflict"
        });
        Assert.False(changedReason.status);
        Assert.Contains("Conflicting", changedReason.message, StringComparison.OrdinalIgnoreCase);

        var changedNote = await _orders.ReportDeliveryIssueAsync(id, _riderA, new ReportDeliveryIssueRequest
        {
            reason = DeliveryIssueReasons.CustomerUnreachable,
            note = "Different note",
            requestId = "idem-conflict"
        });
        Assert.False(changedNote.status);
        Assert.Contains("Conflicting", changedNote.message, StringComparison.OrdinalIgnoreCase);

        Assert.Equal(1, await _db.DeliveryIssueReports.CountAsync());
        Assert.Equal(1, await _db.AdminNotifications.CountAsync(n => n.Title == "Delivery issue reported"));
        Assert.Equal(1, await _db.OrderLifecycleAudits.CountAsync(a =>
            a.AssignedOrderId == id && a.NewStatus == DeliveryIssueReasons.AuditEventStatus));
    }

    [Fact]
    public async Task Cannot_report_after_cancel_or_complete()
    {
        var cancelId = await SeedActiveForRiderAsync(_riderA, "S1", "ISSUE-5", OrderStatuses.InProgress);
        var completeId = await SeedActiveForRiderAsync(_riderA, "S1", "ISSUE-6", OrderStatuses.InProgress);

        Assert.True((await _admin.CancelOrderAsync(_headOffice, cancelId, "Admin cancel")).status);
        var afterCancel = await _orders.ReportDeliveryIssueAsync(cancelId, _riderA, new ReportDeliveryIssueRequest
        {
            reason = DeliveryIssueReasons.AddressIssue,
            requestId = "after-cancel"
        });
        Assert.False(afterCancel.status);
        Assert.Contains("cancel", afterCancel.message, StringComparison.OrdinalIgnoreCase);

        Assert.True((await _orders.UpdateRiderStatusAsync(completeId, _riderA, new UpdateOrderStatusRequest
        {
            status = OrderStatuses.Completed,
            cashCollected = 20,
            requestId = "complete-1"
        })).status);

        var afterComplete = await _orders.ReportDeliveryIssueAsync(completeId, _riderA, new ReportDeliveryIssueRequest
        {
            reason = DeliveryIssueReasons.AddressIssue,
            requestId = "after-complete"
        });
        Assert.False(afterComplete.status);
        Assert.Contains("completed", afterComplete.message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Concurrent_cancel_while_reporting_fails_cleanly()
    {
        var id = await SeedActiveForRiderAsync(_riderA, "S1", "ISSUE-7");

        var reportTask = _orders.ReportDeliveryIssueAsync(id, _riderA, new ReportDeliveryIssueRequest
        {
            reason = DeliveryIssueReasons.CustomerUnreachable,
            requestId = "race-report"
        });
        var cancelTask = _admin.CancelOrderAsync(_headOffice, id, "Race cancel");

        await Task.WhenAll(reportTask, cancelTask);

        var report = await reportTask;
        var cancel = await cancelTask;
        var order = await _db.AssignedOrders.AsNoTracking().FirstAsync(o => o.Id == id);

        if (cancel.status)
            Assert.Equal(OrderStatuses.Cancelled, order.Status);

        if (report.status)
        {
            Assert.Equal(1, await _db.DeliveryIssueReports.CountAsync(r => r.AssignedOrderId == id));
            Assert.NotEqual(OrderStatuses.Completed, order.Status);
            Assert.NotEqual(OrderStatuses.Available, order.Status);
        }
        else
        {
            Assert.False(string.IsNullOrWhiteSpace(report.message));
        }

        Assert.True(cancel.status || report.status);
    }

    [Fact]
    public async Task Manager_store_isolation_on_issue_list_and_order_detail()
    {
        var s1 = await SeedActiveForRiderAsync(_riderA, "S1", "ISSUE-S1");
        var s2 = await SeedActiveForRiderAsync(_riderB, "S2", "ISSUE-S2");

        Assert.True((await _orders.ReportDeliveryIssueAsync(s1, _riderA, new ReportDeliveryIssueRequest
        {
            reason = DeliveryIssueReasons.AddressIssue,
            requestId = "s1-iss"
        })).status);
        Assert.True((await _orders.ReportDeliveryIssueAsync(s2, _riderB, new ReportDeliveryIssueRequest
        {
            reason = DeliveryIssueReasons.CustomerRefused,
            requestId = "s2-iss"
        })).status);

        var m1 = await _admin.ListDeliveryIssueReportsAsync(_managerS1, storeId: null, from: null, to: null);
        Assert.True(m1.status);
        Assert.All(m1.Data!, r => Assert.Equal("S1", r.storeId));
        Assert.Contains(m1.Data!, r => r.assignedOrderId == s1);

        var m2Denied = await _admin.ListDeliveryIssueReportsAsync(_managerS1, storeId: "S2", from: null, to: null);
        Assert.False(m2Denied.status);

        var detailOther = await _admin.GetOrderAsync(_managerS1, s2);
        Assert.False(detailOther.status);

        var detailOwn = await _admin.GetOrderAsync(_managerS1, s1);
        Assert.True(detailOwn.status);
        Assert.Single(detailOwn.Data!.issueReports);
        Assert.Equal(_riderA, detailOwn.Data.issueReports[0].riderUserId);
        Assert.Equal("Rider A", detailOwn.Data.issueReports[0].riderName);

        var head = await _admin.ListDeliveryIssueReportsAsync(_headOffice, storeId: null, from: null, to: null);
        Assert.True(head.status);
        Assert.Equal(2, head.Data!.Count);
    }

    private sealed class FakeCrypto : IPasswordCrypto
    {
        public byte[]? Encrypt(string plainText) => System.Text.Encoding.UTF8.GetBytes(plainText ?? "");
        public string? Decrypt(byte[]? cipherText)
            => cipherText == null ? null : System.Text.Encoding.UTF8.GetString(cipherText);
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
