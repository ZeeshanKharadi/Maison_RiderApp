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

public class FailedDeliveryTests : IDisposable
{
    private readonly ApplicationDbContext _db;
    private readonly OrderService _orders;
    private readonly AdminService _admin;
    private readonly Guid _riderA = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private readonly Guid _riderB = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private readonly Guid _adminId = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private readonly AdminActor _headOffice;
    private readonly AdminActor _managerS1;
    private readonly AdminActor _managerS2;

    public FailedDeliveryTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase("fail-" + Guid.NewGuid())
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
        _managerS2 = new AdminActor
        {
            UserId = Guid.Parse("22222222-2222-2222-2222-222222222222"),
            WorkerId = "MGR2",
            Name = "Mgr S2",
            StoreId = "S2",
            Roles = new List<string> { RoleNames.Manager }
        };
    }

    public void Dispose() => _db.Dispose();

    private async Task<long> SeedActiveAsync(
        Guid riderId,
        string storeId,
        string orderId,
        string status = OrderStatuses.OnTheWay,
        decimal? cashCollected = null)
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
            OrderTotal = 25,
            PaymentMethod = "cash",
            Cash = 25,
            ExpectedCash = 25,
            CashCollected = cashCollected,
            CashSemanticsNote = cashCollected.HasValue ? CashSemantics.RiderCollected : null,
            Status = status,
            AcceptedByUserId = riderId,
            AcceptedAt = DateTime.UtcNow.AddMinutes(-20),
            PickedUpAt = DateTime.UtcNow.AddMinutes(-10),
            CreatedAt = DateTime.UtcNow.AddMinutes(-30),
            UpdatedAt = DateTime.UtcNow,
            RowVersion = Guid.NewGuid().ToByteArray()
        };
        _db.AssignedOrders.Add(order);
        await _db.SaveChangesAsync();
        return order.Id;
    }

    [Fact]
    public async Task Happy_path_preserves_cash_and_gates_cancel_until_store_receipt()
    {
        var id = await SeedActiveAsync(_riderA, "S1", "FAIL-1", cashCollected: 25m);

        var req = await _orders.RequestFailedDeliveryAsync(id, _riderA, new RequestFailedDeliveryRequest
        {
            reason = DeliveryIssueReasons.CustomerRefused,
            note = "Won't take order",
            requestId = "fail-req-1"
        });
        Assert.True(req.status, req.message);
        Assert.Equal(OrderStatuses.OnTheWay, req.Data!.status);
        Assert.Equal(FailureRequestStatuses.Pending, req.Data.failure!.requestStatus);
        Assert.True(req.Data.failure.cashCollectedWarning);
        Assert.Equal(25m, req.Data.failure.cashCollected);

        var cancelBlocked = await _admin.CancelOrderAsync(_managerS1, id, "too soon");
        Assert.False(cancelBlocked.status);

        var approve = await _admin.ApproveFailureReturnAsync(_managerS1, id, new FailureDecisionRequest
        {
            note = "Bring it back"
        });
        Assert.True(approve.status, approve.message);
        Assert.Equal(OrderStatuses.ReturningToStore, approve.Data!.status);
        Assert.Equal(FailureRequestStatuses.ReturnApproved, approve.Data.failure!.requestStatus);
        Assert.Equal(25m, approve.Data.cashCollected);

        var cancelDuringReturn = await _admin.CancelOrderAsync(_managerS1, id, "still too soon");
        Assert.False(cancelDuringReturn.status);

        var returned = await _orders.ConfirmReturnToStoreAsync(id, _riderA, "ret-1");
        Assert.True(returned.status, returned.message);
        Assert.Equal(OrderStatuses.AwaitingStoreReceipt, returned.Data!.status);

        var receipt = await _admin.ConfirmStoreReceiptAsync(_managerS1, id, new FailureDecisionRequest());
        Assert.True(receipt.status, receipt.message);
        Assert.Equal(OrderStatuses.Failed, receipt.Data!.status);
        Assert.Equal(FailureRequestStatuses.StoreReceived, receipt.Data.failure!.requestStatus);
        Assert.Equal(25m, receipt.Data.cashCollected);
        Assert.Equal(25m, receipt.Data.expectedCash);

        var cancelOk = await _admin.CancelOrderAsync(_managerS1, id, "Customer refused — cancelled after return");
        Assert.True(cancelOk.status, cancelOk.message);
        Assert.Equal(OrderStatuses.Cancelled, cancelOk.Data!.status);
        Assert.Equal(25m, cancelOk.Data.cashCollected);
    }

    [Fact]
    public async Task Reject_keeps_status_and_allows_continue_delivery()
    {
        var id = await SeedActiveAsync(_riderA, "S1", "FAIL-2");

        Assert.True((await _orders.RequestFailedDeliveryAsync(id, _riderA, new RequestFailedDeliveryRequest
        {
            reason = DeliveryIssueReasons.AddressIssue,
            requestId = "fail-req-2"
        })).status);

        var reject = await _admin.RejectFailureRequestAsync(_managerS1, id, new FailureDecisionRequest
        {
            note = "Try again"
        });
        Assert.True(reject.status, reject.message);
        Assert.Equal(OrderStatuses.OnTheWay, reject.Data!.status);
        Assert.Equal(FailureRequestStatuses.Rejected, reject.Data.failure!.requestStatus);

        var advance = await _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest
        {
            status = OrderStatuses.ArrivedAtCustomer,
            requestId = "adv-1"
        });
        Assert.True(advance.status, advance.message);
    }

    [Fact]
    public async Task Ownership_and_store_scope_enforced_duplicate_pending_rejected()
    {
        var id = await SeedActiveAsync(_riderA, "S1", "FAIL-3");

        Assert.True((await _orders.RequestFailedDeliveryAsync(id, _riderA, new RequestFailedDeliveryRequest
        {
            reason = DeliveryIssueReasons.CustomerUnreachable,
            requestId = "fail-req-3"
        })).status);

        var otherRider = await _orders.RequestFailedDeliveryAsync(id, _riderB, new RequestFailedDeliveryRequest
        {
            reason = DeliveryIssueReasons.Other,
            note = "x",
            requestId = "fail-req-3b"
        });
        Assert.False(otherRider.status);

        var dup = await _orders.RequestFailedDeliveryAsync(id, _riderA, new RequestFailedDeliveryRequest
        {
            reason = DeliveryIssueReasons.CustomerRefused,
            requestId = "fail-req-3c"
        });
        Assert.False(dup.status);

        var wrongStore = await _admin.ApproveFailureReturnAsync(_managerS2, id, new FailureDecisionRequest());
        Assert.False(wrongStore.status);

        var idempotent = await _orders.RequestFailedDeliveryAsync(id, _riderA, new RequestFailedDeliveryRequest
        {
            reason = DeliveryIssueReasons.CustomerUnreachable,
            requestId = "fail-req-3"
        });
        Assert.True(idempotent.status, idempotent.message);
        Assert.Equal(FailureRequestStatuses.Pending, idempotent.Data!.failure!.requestStatus);
    }

    [Fact]
    public async Task Requeue_from_Failed_non_COD_clears_failure_no_auto_assign()
    {
        var id = await SeedActiveAsync(_riderA, "S1", "FAIL-4"); // no CashCollected
        Assert.True((await _orders.RequestFailedDeliveryAsync(id, _riderA, new RequestFailedDeliveryRequest
        {
            reason = DeliveryIssueReasons.Other,
            note = "gate locked",
            requestId = "fail-req-4"
        })).status);
        Assert.True((await _admin.ApproveFailureReturnAsync(_headOffice, id, new FailureDecisionRequest())).status);
        Assert.True((await _orders.ConfirmReturnToStoreAsync(id, _riderA)).status);
        Assert.True((await _admin.ConfirmStoreReceiptAsync(_headOffice, id, new FailureDecisionRequest())).status);

        var requeue = await _admin.RequeueOrderAsync(_headOffice, id);
        Assert.True(requeue.status, requeue.message);
        Assert.Equal(OrderStatuses.Available, requeue.Data!.status);
        Assert.Null(requeue.Data.acceptedByUserId);
        Assert.Null(requeue.Data.failure?.requestStatus);
        Assert.Null(requeue.Data.cashCollected);
        Assert.False(requeue.Data.isDirectAssignment);
        Assert.False(requeue.Data.requeueBlockedByUnreconciledCash);
    }

    [Fact]
    public async Task Failed_COD_handover_then_requeue_remains_blocked_cash_preserved()
    {
        // Regression: previously cash-collected Failed orders stay blocked after handover.
        // Supporting two collecting riders on one order requires a separate per-rider cash ledger.
        var id = await SeedActiveAsync(_riderA, "S1", "FAIL-COD-HO-BLOCK", cashCollected: 40m);

        Assert.True((await _orders.RequestFailedDeliveryAsync(id, _riderA, new RequestFailedDeliveryRequest
        {
            reason = DeliveryIssueReasons.CustomerRefused,
            requestId = "fail-cod-ho-1"
        })).status);
        Assert.True((await _admin.ApproveFailureReturnAsync(_managerS1, id, new FailureDecisionRequest())).status);
        Assert.True((await _orders.ConfirmReturnToStoreAsync(id, _riderA)).status);
        Assert.True((await _admin.ConfirmStoreReceiptAsync(_managerS1, id, new FailureDecisionRequest())).status);

        var beforeHo = await _admin.GetOrderAsync(_managerS1, id);
        Assert.True(beforeHo.status);
        Assert.Equal(OrderStatuses.Failed, beforeHo.Data!.status);
        Assert.True(beforeHo.Data.requeueBlockedByUnreconciledCash);
        Assert.Equal(40m, beforeHo.Data.cashCollected);

        var blockedBefore = await _admin.RequeueOrderAsync(_managerS1, id);
        Assert.False(blockedBefore.status);
        Assert.Contains("40", blockedBefore.message);

        var handover = await _admin.ConfirmCashHandoverAsync(
            _managerS1, id, new CashHandoverRequest { requestId = "ho-cod-block-1" });
        Assert.True(handover.status, handover.message);
        Assert.Equal(40m, handover.Data!.cashCollected);
        Assert.Equal(40m, handover.Data.cashHandedOverAmount);
        Assert.Equal(0m, handover.Data.cashOutstandingToStore);
        Assert.True(handover.Data.requeueBlockedByUnreconciledCash);
        Assert.Contains("ledger", handover.Data.requeueBlockReason, StringComparison.OrdinalIgnoreCase);

        var blockedAfter = await _admin.RequeueOrderAsync(_managerS1, id);
        Assert.False(blockedAfter.status);
        Assert.Contains("collected", blockedAfter.message, StringComparison.OrdinalIgnoreCase);

        var row = await _db.AssignedOrders.AsNoTracking().FirstAsync(o => o.Id == id);
        Assert.Equal(OrderStatuses.Failed, row.Status);
        Assert.Equal(40m, row.CashCollected);
        Assert.Equal(40m, row.CashHandedOverAmount);
        Assert.Equal(_riderA, row.AcceptedByUserId);

        var audits = await _db.OrderLifecycleAudits
            .AsNoTracking()
            .Where(a => a.AssignedOrderId == id)
            .ToListAsync();
        Assert.Contains(audits, a => a.NewStatus == OrderStatuses.Failed);
        Assert.Contains(audits, a => a.Reason != null && a.Reason.Contains("CashHandover", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(audits, a => a.NewStatus == OrderStatuses.Available && a.Reason == "Requeued");
    }

    [Fact]
    public async Task Failed_non_COD_may_requeue_cash_collected_Failed_may_not()
    {
        var nonCod = await SeedActiveAsync(_riderA, "S1", "FAIL-NO-CASH");
        Assert.True((await _orders.RequestFailedDeliveryAsync(nonCod, _riderA, new RequestFailedDeliveryRequest
        {
            reason = DeliveryIssueReasons.AddressIssue,
            requestId = "fail-nocash-1"
        })).status);
        Assert.True((await _admin.ApproveFailureReturnAsync(_managerS1, nonCod, new FailureDecisionRequest())).status);
        Assert.True((await _orders.ConfirmReturnToStoreAsync(nonCod, _riderA)).status);
        Assert.True((await _admin.ConfirmStoreReceiptAsync(_managerS1, nonCod, new FailureDecisionRequest())).status);
        var rq1 = await _admin.RequeueOrderAsync(_managerS1, nonCod);
        Assert.True(rq1.status, rq1.message);

        var cod = await SeedActiveAsync(_riderA, "S1", "FAIL-FULL-HO", cashCollected: 15m);
        Assert.True((await _orders.RequestFailedDeliveryAsync(cod, _riderA, new RequestFailedDeliveryRequest
        {
            reason = DeliveryIssueReasons.Other,
            note = "ok",
            requestId = "fail-fullho-1"
        })).status);
        Assert.True((await _admin.ApproveFailureReturnAsync(_managerS1, cod, new FailureDecisionRequest())).status);
        Assert.True((await _orders.ConfirmReturnToStoreAsync(cod, _riderA)).status);
        Assert.True((await _admin.ConfirmStoreReceiptAsync(_managerS1, cod, new FailureDecisionRequest())).status);
        Assert.True((await _admin.ConfirmCashHandoverAsync(
            _managerS1, cod, new CashHandoverRequest { amount = 15m, requestId = "ho-full-1" })).status);
        var rq2 = await _admin.RequeueOrderAsync(_managerS1, cod);
        Assert.False(rq2.status);
        var still = await _db.AssignedOrders.AsNoTracking().FirstAsync(o => o.Id == cod);
        Assert.Equal(OrderStatuses.Failed, still.Status);
        Assert.Equal(15m, still.CashCollected);
        Assert.Equal(15m, still.CashHandedOverAmount);
    }

    [Fact]
    public async Task Rider_cannot_advance_while_returning()
    {
        var id = await SeedActiveAsync(_riderA, "S1", "FAIL-5");
        Assert.True((await _orders.RequestFailedDeliveryAsync(id, _riderA, new RequestFailedDeliveryRequest
        {
            reason = DeliveryIssueReasons.CustomerUnreachable,
            requestId = "fail-req-5"
        })).status);
        Assert.True((await _admin.ApproveFailureReturnAsync(_managerS1, id, new FailureDecisionRequest())).status);

        var blocked = await _orders.UpdateRiderStatusAsync(id, _riderA, new UpdateOrderStatusRequest
        {
            status = OrderStatuses.ArrivedAtCustomer
        });
        Assert.False(blocked.status);
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

        public Task<ApiResponse<string>> SoftDeleteAsync(Guid userId, long notificationId)
            => throw new NotImplementedException();

        public Task<ApiResponse<string>> SoftDeleteAllAsync(Guid userId)
            => throw new NotImplementedException();

        public Task<ApiResponse<SendNotificationResultDto>> SendTestToUserAsync(SendNotificationRequest request)
            => throw new NotImplementedException();

        public Task<ApiResponse<SendNotificationResultDto>> BroadcastTestAsync(BroadcastNotificationRequest request)
            => throw new NotImplementedException();
    }
}
