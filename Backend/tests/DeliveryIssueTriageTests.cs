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

public class DeliveryIssueTriageTests : IDisposable
{
    private readonly ApplicationDbContext _db;
    private readonly OrderService _orders;
    private readonly AdminService _admin;
    private readonly Guid _riderA = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private readonly Guid _riderB = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private readonly Guid _adminId = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private readonly Guid _manager2Id = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private readonly AdminActor _headOffice;
    private readonly AdminActor _managerS1;
    private readonly AdminActor _managerS2;

    public DeliveryIssueTriageTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase("triage-" + Guid.NewGuid())
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
                UserId = _riderA, ThirdPartyEmployeeId = "RD-A", UserName = "Rider A",
                IsActive = true, IsVerified = true, StoreId = "S1", IsAvailableOnline = true,
                LastSeenAt = DateTime.UtcNow
            },
            new AppUser
            {
                UserId = _riderB, ThirdPartyEmployeeId = "RD-B", UserName = "Rider B",
                IsActive = true, IsVerified = true, StoreId = "S2", IsAvailableOnline = true,
                LastSeenAt = DateTime.UtcNow
            },
            new AppUser
            {
                UserId = _adminId, ThirdPartyEmployeeId = "ADM", UserName = "Admin",
                IsActive = true, IsVerified = true
            },
            new AppUser
            {
                UserId = _manager2Id, ThirdPartyEmployeeId = "MGR2", UserName = "Mgr S2",
                IsActive = true, IsVerified = true, StoreId = "S2"
            });
        _db.SaveChanges();

        var uow = new UnitOfWork(_db);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Availability:HeartbeatMinutes"] = "15"
        }).Build();
        var crypto = new FakeCrypto();
        var verifier = new PasswordVerifier(crypto);
        _orders = new OrderService(uow, new NoOpRiderNotifications(), new NoOpOpsEventPublisher(),
            config, NullLogger<OrderService>.Instance);
        _admin = new AdminService(uow, crypto, verifier, new NoOpOpsEventPublisher(),
            new NoOpRiderNotifications(), config, NullLogger<AdminService>.Instance);

        _headOffice = new AdminActor
        {
            UserId = _adminId, WorkerId = "ADM", Name = "Admin",
            Roles = new List<string> { RoleNames.Administrator }
        };
        _managerS1 = new AdminActor
        {
            UserId = Guid.Parse("11111111-1111-1111-1111-111111111111"),
            WorkerId = "MGR1", Name = "Mgr S1", StoreId = "S1",
            Roles = new List<string> { RoleNames.Manager }
        };
        _managerS2 = new AdminActor
        {
            UserId = _manager2Id, WorkerId = "MGR2", Name = "Mgr S2", StoreId = "S2",
            Roles = new List<string> { RoleNames.Manager }
        };
    }

    public void Dispose() => _db.Dispose();

    private async Task<(long orderId, long issueId, string rowVersion)> SeedOpenIssueAsync()
    {
        var batch = new AssignedOrderBatch { StoreId = "S1", Time = "now", CreatedAt = DateTime.UtcNow };
        _db.AssignedOrderBatches.Add(batch);
        await _db.SaveChangesAsync();
        var order = new AssignedOrder
        {
            BatchId = batch.Id, OrderId = "TRI-" + Guid.NewGuid().ToString("N")[..6],
            OrderNo = "TRI", OrderTypeId = "D", OrderState = "Open", Comment = "",
            LastName = "L", FirstName = "F", City = "C", Street = "S", AddressNo = "1",
            PostCode = "0", SecondaryAddress = "", Phone = "1", OrderTime = "now",
            OrderTotal = 20, PaymentMethod = "cash", Cash = 20, ExpectedCash = 20,
            Status = OrderStatuses.InProgress, AcceptedByUserId = _riderA,
            AcceptedAt = DateTime.UtcNow.AddMinutes(-10),
            PickedUpAt = DateTime.UtcNow.AddMinutes(-5),
            CreatedAt = DateTime.UtcNow.AddMinutes(-15), UpdatedAt = DateTime.UtcNow
        };
        _db.AssignedOrders.Add(order);
        await _db.SaveChangesAsync();

        var reported = await _orders.ReportDeliveryIssueAsync(order.Id, _riderA, new ReportDeliveryIssueRequest
        {
            reason = DeliveryIssueReasons.CustomerUnreachable,
            note = "No answer",
            requestId = "triage-" + Guid.NewGuid().ToString("N")
        });
        Assert.True(reported.status, reported.message);
        Assert.Equal(DeliveryIssueStatuses.New, reported.Data!.status);

        var detail = await _admin.GetDeliveryIssueReportAsync(_headOffice, reported.Data.id);
        Assert.True(detail.status);
        return (order.Id, reported.Data.id, detail.Data!.rowVersion);
    }

    [Fact]
    public async Task Acknowledge_note_close_preserves_history_and_delivery_fields()
    {
        var (orderId, issueId, rowVersion) = await SeedOpenIssueAsync();
        var before = await _db.AssignedOrders.AsNoTracking().FirstAsync(o => o.Id == orderId);

        var ack = await _admin.AcknowledgeDeliveryIssueAsync(_managerS1, issueId, new DeliveryIssueTriageRequest
        {
            internalNote = "Calling customer",
            rowVersion = rowVersion
        });
        Assert.True(ack.status, ack.message);
        Assert.Equal(DeliveryIssueStatuses.Acknowledged, ack.Data!.status);
        Assert.Equal("Calling customer", ack.Data.internalNote);
        Assert.NotNull(ack.Data.acknowledgedAt);

        var note = await _admin.UpdateDeliveryIssueNoteAsync(_managerS1, issueId, new DeliveryIssueTriageRequest
        {
            internalNote = "Left voicemail",
            rowVersion = ack.Data.rowVersion
        });
        Assert.True(note.status, note.message);
        Assert.Equal("Left voicemail", note.Data!.internalNote);
        Assert.Equal(DeliveryIssueStatuses.Acknowledged, note.Data.status);

        var close = await _admin.CloseDeliveryIssueAsync(_managerS1, issueId, new DeliveryIssueTriageRequest
        {
            internalNote = "Resolved with rider",
            rowVersion = note.Data.rowVersion
        });
        Assert.True(close.status, close.message);
        Assert.Equal(DeliveryIssueStatuses.Closed, close.Data!.status);
        Assert.NotNull(close.Data.closedAt);

        var after = await _db.AssignedOrders.AsNoTracking().FirstAsync(o => o.Id == orderId);
        Assert.Equal(before.Status, after.Status);
        Assert.Equal(before.CashCollected, after.CashCollected);
        Assert.Equal(before.CashHandedOverAmount, after.CashHandedOverAmount);

        var hist = await _admin.GetDeliveryIssueReportAsync(_headOffice, issueId);
        Assert.True(hist.Data!.history.Count >= 4); // Reported, Ack, Note, Close
        Assert.Contains(hist.Data.history, h => h.action == DeliveryIssueTriageActions.Reported);
        Assert.Contains(hist.Data.history, h => h.action == DeliveryIssueTriageActions.Acknowledged);
        Assert.Contains(hist.Data.history, h => h.action == DeliveryIssueTriageActions.NoteUpdated);
        Assert.Contains(hist.Data.history, h => h.action == DeliveryIssueTriageActions.Closed);

        var riderView = await _orders.GetOrderByIdAsync(orderId, _riderA);
        Assert.True(riderView.status);
        var riderIssue = Assert.Single(riderView.Data!.issueReports);
        Assert.Equal(DeliveryIssueStatuses.Closed, riderIssue.status);
        Assert.DoesNotContain(
            typeof(DeliveryIssueReportDto).GetProperties().Select(p => p.Name),
            name => name.Equals("internalNote", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Cannot_close_before_acknowledge_and_manager_store_scoped()
    {
        var (_, issueId, rowVersion) = await SeedOpenIssueAsync();

        var closeEarly = await _admin.CloseDeliveryIssueAsync(_managerS1, issueId, new DeliveryIssueTriageRequest
        {
            rowVersion = rowVersion
        });
        Assert.False(closeEarly.status);
        Assert.Contains("Acknowledge", closeEarly.message, StringComparison.OrdinalIgnoreCase);

        var crossStore = await _admin.AcknowledgeDeliveryIssueAsync(_managerS2, issueId, new DeliveryIssueTriageRequest
        {
            rowVersion = rowVersion
        });
        Assert.False(crossStore.status);
        Assert.Contains("not found", crossStore.message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Concurrent_admin_actions_do_not_overwrite()
    {
        var (_, issueId, rowVersion) = await SeedOpenIssueAsync();

        var a = await _admin.AcknowledgeDeliveryIssueAsync(_managerS1, issueId, new DeliveryIssueTriageRequest
        {
            internalNote = "First",
            rowVersion = rowVersion
        });
        Assert.True(a.status, a.message);

        var stale = await _admin.UpdateDeliveryIssueNoteAsync(_headOffice, issueId, new DeliveryIssueTriageRequest
        {
            internalNote = "Stale overwrite",
            rowVersion = rowVersion // old version
        });
        Assert.False(stale.status);
        Assert.Contains("another admin", stale.message, StringComparison.OrdinalIgnoreCase);

        var current = await _admin.GetDeliveryIssueReportAsync(_headOffice, issueId);
        Assert.Equal("First", current.Data!.internalNote);
        Assert.Equal(DeliveryIssueStatuses.Acknowledged, current.Data.status);
    }

    [Fact]
    public async Task List_defaults_to_open_and_can_filter_closed()
    {
        var (_, openId, rv) = await SeedOpenIssueAsync();
        var ack = await _admin.AcknowledgeDeliveryIssueAsync(_managerS1, openId, new DeliveryIssueTriageRequest
        {
            rowVersion = rv
        });
        var closed = await _admin.CloseDeliveryIssueAsync(_managerS1, openId, new DeliveryIssueTriageRequest
        {
            rowVersion = ack.Data!.rowVersion
        });
        Assert.True(closed.status);

        var (_, stillOpen, _) = await SeedOpenIssueAsync();

        var openList = await _admin.ListDeliveryIssueReportsAsync(_managerS1, null, null, null);
        Assert.True(openList.status);
        Assert.DoesNotContain(openList.Data!, x => x.status == DeliveryIssueStatuses.Closed);
        Assert.Contains(openList.Data!, x => x.id == stillOpen);

        var closedList = await _admin.ListDeliveryIssueReportsAsync(
            _managerS1, null, null, null, status: DeliveryIssueStatuses.Closed);
        Assert.Contains(closedList.Data!, x => x.id == openId);

        var search = await _admin.ListDeliveryIssueReportsAsync(
            _managerS1, null, null, null, status: DeliveryIssueStatuses.Closed, q: "No answer", includeClosed: true);
        Assert.Contains(search.Data!, x => x.id == openId);
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
        public Task NotifyOrderCancelledAsync(Guid riderUserId, string orderId, long? assignedOrderId, string? cancelReason)
            => Task.CompletedTask;
        public Task<ApiResponse<List<RiderNotificationDto>>> ListForUserAsync(Guid userId, int take = 50)
            => throw new NotImplementedException();
        public Task<ApiResponse<string>> MarkReadAsync(Guid userId, long notificationId) => throw new NotImplementedException();
        public Task<ApiResponse<string>> MarkAllReadAsync(Guid userId) => throw new NotImplementedException();
        public Task<ApiResponse<string>> SoftDeleteAsync(Guid userId, long notificationId)
            => throw new NotImplementedException();
        public Task<ApiResponse<string>> SoftDeleteAllAsync(Guid userId) => throw new NotImplementedException();
        public Task<ApiResponse<SendNotificationResultDto>> SendTestToUserAsync(SendNotificationRequest request)
            => throw new NotImplementedException();
        public Task<ApiResponse<SendNotificationResultDto>> BroadcastTestAsync(BroadcastNotificationRequest request)
            => throw new NotImplementedException();
    }
}
