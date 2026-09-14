using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Rider.Application.DTOs.Orders;
using Rider.Application.Interfaces;
using Rider.Application.Interfaces.Repositories;
using Rider.Domain.Common;
using Rider.Domain.Entities;

namespace Rider.Infrastructure.Services
{
    public class OrderService : IOrderService
    {
        private readonly IUnitOfWork _unitOfWork;
        private readonly IRiderNotificationService _notifications;
        private readonly IOpsEventPublisher _opsEvents;
        private readonly IConfiguration _configuration;
        private readonly ILogger<OrderService> _logger;

        public OrderService(
            IUnitOfWork unitOfWork,
            IRiderNotificationService notifications,
            IOpsEventPublisher opsEvents,
            IConfiguration configuration,
            ILogger<OrderService> logger)
        {
            _unitOfWork = unitOfWork;
            _notifications = notifications;
            _opsEvents = opsEvents;
            _configuration = configuration;
            _logger = logger;
        }

        public Task<ApiResponse<AssignOrderResultDto>> AssignOrderAsync(AssignOrderRequest request)
            => PersistAssignedOrdersAsync(request, assignToUserId: null);

        public async Task<ApiResponse<AssignOrderToRiderResultDto>> AssignOrderToRiderAsync(AssignOrderToRiderRequest request)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.workerId))
                return new ApiResponse<AssignOrderToRiderResultDto>(false, "workerId is required", null);

            var rider = await _unitOfWork.UserRepository.GetByEmployeeIdAsync(request.workerId.Trim());
            if (rider == null || rider.DeletedAt != null)
                return new ApiResponse<AssignOrderToRiderResultDto>(false, "Rider not found", null);

            if (!rider.IsActive)
                return new ApiResponse<AssignOrderToRiderResultDto>(false, "Rider account is inactive", null);

            var persist = await PersistAssignedOrdersAsync(request, rider.UserId);
            if (!persist.status || persist.Data == null)
                return new ApiResponse<AssignOrderToRiderResultDto>(false, persist.message, null);

            return new ApiResponse<AssignOrderToRiderResultDto>(true, $"Orders assigned to {rider.ThirdPartyEmployeeId}", new AssignOrderToRiderResultDto
            {
                batchId = persist.Data.batchId,
                storeId = persist.Data.storeId,
                ordersSaved = persist.Data.ordersSaved,
                itemsSaved = persist.Data.itemsSaved,
                orderIds = persist.Data.orderIds,
                workerId = rider.ThirdPartyEmployeeId,
                assignedToUserId = rider.UserId,
                riderName = rider.UserName
            });
        }

        private async Task<ApiResponse<AssignOrderResultDto>> PersistAssignedOrdersAsync(
            AssignOrderRequest request, Guid? assignToUserId)
        {
            if (request == null)
                return new ApiResponse<AssignOrderResultDto>(false, "Request body is required", null);

            if (string.IsNullOrWhiteSpace(request.storeId))
                return new ApiResponse<AssignOrderResultDto>(false, "storeId is required", null);

            try
            {
                await _unitOfWork.StoreRepository.EnsureExistsAsync(request.storeId.Trim(), request.storeId.Trim());
            }
            catch
            {
                // Stores table optional for POS push
            }

            if (request.orders == null || request.orders.Count == 0)
                return new ApiResponse<AssignOrderResultDto>(false, "At least one order is required", null);

            var batch = new AssignedOrderBatch
            {
                Time = request.time,
                StoreId = request.storeId.Trim(),
                CreatedAt = DateTime.UtcNow,
                Orders = new List<AssignedOrder>()
            };

            var itemsByOrderKey = (request.orderItems ?? new List<AssignOrderItemDto>())
                .GroupBy(i => i.itemId.ToString())
                .ToDictionary(g => g.Key, g => g.ToList());

            var savedOrderIds = new List<string>();
            var itemsSaved = 0;
            var pendingNotifications = new List<(bool direct, Guid? riderUserId, string orderId, decimal total)>();
            var isDirect = assignToUserId.HasValue;

            foreach (var dto in request.orders)
            {
                if (string.IsNullOrWhiteSpace(dto.orderId))
                    continue;

                var existing = await _unitOfWork.AssignedOrderRepository
                    .GetByExternalOrderIdAsync(dto.orderId.Trim());

                if (existing != null && existing.Status == OrderStatuses.Available)
                {
                    existing.OrderNo = dto.orderNo ?? existing.OrderNo;
                    existing.OrderTypeId = dto.orderTypeId;
                    existing.OrderState = dto.orderState;
                    existing.Comment = dto.comment;
                    existing.LastName = dto.lastName;
                    existing.FirstName = dto.firstName;
                    existing.City = dto.city;
                    existing.Street = dto.street;
                    existing.AddressNo = dto.addressNo;
                    existing.PostCode = dto.postCode;
                    existing.SecondaryAddress = dto.secondaryAddress;
                    existing.Lat = dto.lat;
                    existing.Lng = dto.lng;
                    existing.Phone = dto.phone;
                    existing.OrderTotal = dto.orderTotal;
                    existing.PaymentMethod = dto.paymentMethod;
                    existing.Cash = dto.cash;
                    existing.ExpectedCash = ResolveExpectedCash(dto.paymentMethod, dto.cash, existing.ExpectedCash);
                    existing.OrderTime = dto.orderTime;
                    existing.UpdatedAt = DateTime.UtcNow;
                    if (assignToUserId.HasValue)
                    {
                        existing.AcceptedByUserId = assignToUserId;
                        existing.IsDirectAssignment = true;
                    }

                    if (existing.Items != null)
                    {
                        foreach (var old in existing.Items.ToList())
                            await _unitOfWork.AssignedOrderItemRepository.DeleteAsync(old);
                    }

                    var refreshItems = ResolveItems(dto.orderId, itemsByOrderKey, request);
                    foreach (var item in refreshItems)
                    {
                        await _unitOfWork.AssignedOrderItemRepository.AddAsync(new AssignedOrderItem
                        {
                            AssignedOrderId = existing.Id,
                            ItemId = item.itemId,
                            Description = item.description,
                            Position = item.position,
                            Quantity = item.quantity <= 0 ? 1 : item.quantity,
                            Comment = item.comment,
                            LineNum = item.lineNum,
                            Size = item.size
                        });
                        itemsSaved++;
                    }

                    await _unitOfWork.AssignedOrderRepository.UpdateAsync(existing);
                    savedOrderIds.Add(existing.OrderId);
                    if (assignToUserId.HasValue)
                    {
                        pendingNotifications.Add((true, assignToUserId.Value, existing.OrderId, dto.orderTotal));
                    }
                    continue;
                }

                if (existing != null)
                {
                    if (assignToUserId.HasValue && existing.AcceptedByUserId != assignToUserId)
                        return new ApiResponse<AssignOrderResultDto>(
                            false,
                            $"Order {existing.OrderId} is already {existing.Status} and assigned to another rider",
                            null);

                    if (assignToUserId.HasValue)
                    {
                        pendingNotifications.Add((true, assignToUserId.Value, existing.OrderId, dto.orderTotal));
                    }

                    savedOrderIds.Add(existing.OrderId);
                    continue;
                }

                var order = new AssignedOrder
                {
                    OrderId = dto.orderId.Trim(),
                    OrderNo = string.IsNullOrWhiteSpace(dto.orderNo) ? dto.orderId.Trim() : dto.orderNo.Trim(),
                    OrderTypeId = dto.orderTypeId,
                    OrderState = dto.orderState,
                    Comment = dto.comment,
                    LastName = dto.lastName,
                    FirstName = dto.firstName,
                    City = dto.city,
                    Street = dto.street,
                    AddressNo = dto.addressNo,
                    PostCode = dto.postCode,
                    SecondaryAddress = dto.secondaryAddress,
                    Lat = dto.lat,
                    Lng = dto.lng,
                    Phone = dto.phone,
                    OrderTotal = dto.orderTotal,
                    PaymentMethod = dto.paymentMethod,
                    Cash = dto.cash,
                    ExpectedCash = ResolveExpectedCash(dto.paymentMethod, dto.cash, null),
                    OrderTime = dto.orderTime,
                    Status = OrderStatuses.Available,
                    AcceptedByUserId = assignToUserId,
                    IsDirectAssignment = isDirect,
                    CreatedAt = DateTime.UtcNow,
                    Items = new List<AssignedOrderItem>()
                };

                foreach (var item in ResolveItems(dto.orderId, itemsByOrderKey, request))
                {
                    order.Items.Add(new AssignedOrderItem
                    {
                        ItemId = item.itemId,
                        Description = item.description,
                        Position = item.position,
                        Quantity = item.quantity <= 0 ? 1 : item.quantity,
                        Comment = item.comment,
                        LineNum = item.lineNum,
                        Size = item.size
                    });
                    itemsSaved++;
                }

                batch.Orders.Add(order);
                savedOrderIds.Add(order.OrderId);
                pendingNotifications.Add((isDirect, assignToUserId, order.OrderId, dto.orderTotal));
            }

            if (savedOrderIds.Count == 0)
                return new ApiResponse<AssignOrderResultDto>(false, "No valid orders to assign", null);

            if (batch.Orders.Count > 0)
                await _unitOfWork.AssignedOrderBatchRepository.AddAsync(batch);

            await _unitOfWork.SaveChangesAsync();

            foreach (var pending in pendingNotifications)
            {
                try
                {
                    var saved = await _unitOfWork.AssignedOrderRepository
                        .GetByExternalOrderIdAsync(pending.orderId);
                    if (saved == null) continue;

                    if (pending.direct && pending.riderUserId.HasValue)
                    {
                        await _notifications.NotifyDirectAssignmentAsync(
                            pending.riderUserId.Value,
                            pending.orderId,
                            saved.Id,
                            batch.StoreId,
                            pending.total);
                    }
                    else if (!pending.direct)
                    {
                        await _notifications.NotifyOpenPoolOrderAsync(
                            pending.orderId,
                            saved.Id,
                            batch.StoreId,
                            pending.total);
                    }

                    await SafePublishOrderChanged(batch.StoreId, saved.Id, saved.OrderId, saved.Status);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Post-commit notification failed for order {OrderId}", pending.orderId);
                }
            }

            return new ApiResponse<AssignOrderResultDto>(true, "Orders assigned successfully", new AssignOrderResultDto
            {
                batchId = batch.Id,
                storeId = batch.StoreId,
                ordersSaved = savedOrderIds.Count,
                itemsSaved = itemsSaved,
                orderIds = savedOrderIds
            });
        }

        public async Task TouchLastSeenAsync(Guid userId)
        {
            var user = await _unitOfWork.UserRepository.GetByUserIdAsync(userId);
            if (user == null)
                return;

            var now = DateTime.UtcNow;
            user.LastSeenAt = now;
            await _unitOfWork.UserRepository.UpdateAsync(user);

            var heartbeatMinutes = int.TryParse(_configuration["Availability:HeartbeatMinutes"], out var hm) ? hm : 15;
            var cutoff = now.AddMinutes(-heartbeatMinutes);

            var openIntervals = await _unitOfWork.Context.Set<RiderAvailabilityInterval>()
                .Where(i => i.UserId == userId && i.EndedAt == null)
                .ToListAsync();

            foreach (var interval in openIntervals)
            {
                if (interval.StartedAt < cutoff && (!user.IsAvailableOnline || (user.LastSeenAt ?? interval.StartedAt) < cutoff))
                {
                    // Stale open interval — close as heartbeat expired when last seen is old.
                    // Refresh path: if still online and recently seen, leave open.
                }
            }

            // Close intervals older than heartbeat with no recent activity
            var stale = await _unitOfWork.Context.Set<RiderAvailabilityInterval>()
                .Where(i => i.EndedAt == null && i.StartedAt < cutoff)
                .Where(i => !_unitOfWork.Context.Set<AppUser>().Any(u =>
                    u.UserId == i.UserId && u.IsAvailableOnline && u.LastSeenAt != null && u.LastSeenAt >= cutoff))
                .ToListAsync();

            // Simpler: close this user's open interval only if LastSeen was already stale before this touch
            // After updating LastSeen, close OTHER users' stale intervals:
            var allStale = await _unitOfWork.Context.Set<RiderAvailabilityInterval>()
                .Where(i => i.EndedAt == null)
                .Join(_unitOfWork.Context.Set<AppUser>(),
                    i => i.UserId,
                    u => u.UserId,
                    (i, u) => new { Interval = i, User = u })
                .Where(x => x.User.LastSeenAt == null || x.User.LastSeenAt < cutoff)
                .Select(x => x.Interval)
                .ToListAsync();

            foreach (var interval in allStale)
            {
                // Don't close the interval we just refreshed for this user
                if (interval.UserId == userId && user.IsAvailableOnline)
                    continue;
                interval.EndedAt = now;
                interval.EndReason = "HeartbeatExpired";
            }

            if (user.IsAvailableOnline)
            {
                var open = await _unitOfWork.Context.Set<RiderAvailabilityInterval>()
                    .FirstOrDefaultAsync(i => i.UserId == userId && i.EndedAt == null);
                if (open == null)
                {
                    await _unitOfWork.Context.Set<RiderAvailabilityInterval>().AddAsync(new RiderAvailabilityInterval
                    {
                        UserId = userId,
                        StartedAt = now
                    });
                }
            }

            await _unitOfWork.SaveChangesAsync();
        }

        public async Task<ApiResponse<bool>> SetAvailabilityAsync(Guid riderUserId, bool isOnline)
        {
            var user = await _unitOfWork.UserRepository.GetByUserIdAsync(riderUserId);
            if (user == null)
                return new ApiResponse<bool>(false, "User not found", false);

            var now = DateTime.UtcNow;
            user.IsAvailableOnline = isOnline;
            user.AvailabilityChangedAt = now;
            user.LastSeenAt = now;
            await _unitOfWork.UserRepository.UpdateAsync(user);

            if (isOnline)
            {
                var open = await _unitOfWork.Context.Set<RiderAvailabilityInterval>()
                    .FirstOrDefaultAsync(i => i.UserId == riderUserId && i.EndedAt == null);
                if (open == null)
                {
                    await _unitOfWork.Context.Set<RiderAvailabilityInterval>().AddAsync(new RiderAvailabilityInterval
                    {
                        UserId = riderUserId,
                        StartedAt = now
                    });
                }
            }
            else
            {
                var open = await _unitOfWork.Context.Set<RiderAvailabilityInterval>()
                    .Where(i => i.UserId == riderUserId && i.EndedAt == null)
                    .ToListAsync();
                foreach (var interval in open)
                {
                    interval.EndedAt = now;
                    interval.EndReason = "ToggleOff";
                }
            }

            await _unitOfWork.SaveChangesAsync();

            try
            {
                await _opsEvents.PublishRiderAvailabilityChangedAsync(user.StoreId, riderUserId, isOnline);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Ops event publish failed after availability change");
            }

            return new ApiResponse<bool>(true, isOnline ? "You are online" : "You are offline", isOnline);
        }

        public async Task<ApiResponse<AvailableOrderDto>> UpdateRiderStatusAsync(
            long id, Guid riderUserId, UpdateOrderStatusRequest request)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.status))
                return new ApiResponse<AvailableOrderDto>(false, "status is required", null);

            var next = request.status.Trim();
            if (next is not (OrderStatuses.Accepted or OrderStatuses.InProgress or OrderStatuses.Completed))
                return new ApiResponse<AvailableOrderDto>(false, "Unsupported status. Use Accepted, InProgress, or Completed", null);

            var requestId = string.IsNullOrWhiteSpace(request.requestId) ? null : request.requestId.Trim();
            if (!string.IsNullOrEmpty(requestId))
            {
                var prior = await _unitOfWork.Context.Set<OrderLifecycleAudit>()
                    .AsNoTracking()
                    .FirstOrDefaultAsync(a => a.RequestId == requestId);
                if (prior != null)
                {
                    if (prior.AssignedOrderId == id && prior.NewStatus == next && prior.ActorUserId == riderUserId)
                    {
                        if (next == OrderStatuses.Completed && prior.CashCollected != request.cashCollected)
                        {
                            return new ApiResponse<AvailableOrderDto>(
                                false,
                                "Conflicting cashCollected for the same requestId",
                                null);
                        }

                        var existing = await _unitOfWork.AssignedOrderRepository.GetByIdWithItemsAsync(id);
                        return new ApiResponse<AvailableOrderDto>(true, "Status updated", MapOrder(existing!));
                    }
                    return new ApiResponse<AvailableOrderDto>(false, "Duplicate requestId", null);
                }
            }

            var rider = await _unitOfWork.UserRepository.GetByUserIdAsync(riderUserId);
            if (rider == null || !rider.IsActive)
                return new ApiResponse<AvailableOrderDto>(false, "Rider account is inactive", null);

            await using var tx = await _unitOfWork.Context.Database.BeginTransactionAsync();
            try
            {
                var order = await _unitOfWork.AssignedOrderRepository.GetByIdForUpdateAsync(id);
                if (order == null)
                    return new ApiResponse<AvailableOrderDto>(false, "Order not found", null);

                // Idempotent: already at target by same rider with same cash
                if (order.Status == next && order.AcceptedByUserId == riderUserId)
                {
                    if (next == OrderStatuses.Completed)
                    {
                        if (request.cashCollected.HasValue && order.CashCollected.HasValue
                            && order.CashCollected.Value != request.cashCollected.Value)
                        {
                            await tx.RollbackAsync();
                            return new ApiResponse<AvailableOrderDto>(false, "Cash collected does not match previous value", null);
                        }
                    }
                    await tx.CommitAsync();
                    return new ApiResponse<AvailableOrderDto>(true, "Status updated", MapOrder(order));
                }

                var previous = order.Status;
                var now = DateTime.UtcNow;

                switch (next)
                {
                    case OrderStatuses.Accepted:
                    {
                        if (order.Status != OrderStatuses.Available)
                        {
                            await tx.RollbackAsync();
                            return new ApiResponse<AvailableOrderDto>(false, "Only Available orders can be accepted", null!);
                        }
                        if (order.AcceptedByUserId.HasValue && order.AcceptedByUserId != riderUserId)
                        {
                            await tx.RollbackAsync();
                            return new ApiResponse<AvailableOrderDto>(false, "This order is assigned to another rider", null!);
                        }
                        if (order.IsDirectAssignment && order.AcceptedByUserId == null)
                        {
                            await tx.RollbackAsync();
                            return new ApiResponse<AvailableOrderDto>(false, "Order is held pending admin requeue", null!);
                        }
                        if (await _unitOfWork.AssignedOrderRepository.HasRiderRejectedAsync(id, riderUserId))
                        {
                            await tx.RollbackAsync();
                            return new ApiResponse<AvailableOrderDto>(false, "You previously rejected this order", null!);
                        }
                        if (!string.IsNullOrWhiteSpace(rider.StoreId)
                            && order.Batch != null
                            && !string.Equals(rider.StoreId, order.Batch.StoreId, StringComparison.OrdinalIgnoreCase))
                        {
                            await tx.RollbackAsync();
                            return new ApiResponse<AvailableOrderDto>(false, "Order is not available for your store", null!);
                        }

                        // Explicit Online preference required for new accepts (distinct from LastSeen heartbeat).
                        if (!rider.IsAvailableOnline)
                        {
                            await tx.RollbackAsync();
                            return new ApiResponse<AvailableOrderDto>(false, "Go online before accepting orders", null!);
                        }

                        var heartbeatMinutes = int.TryParse(
                            _configuration["Availability:HeartbeatMinutes"], out var hb) ? hb : 15;
                        var staleBefore = DateTime.UtcNow.AddMinutes(-heartbeatMinutes);
                        if (!rider.LastSeenAt.HasValue || rider.LastSeenAt.Value < staleBefore)
                        {
                            await tx.RollbackAsync();
                            return new ApiResponse<AvailableOrderDto>(
                                false,
                                "Session stale — refresh the app and go online again",
                                null!);
                        }

                        // Serialize rider-wide active-job limit across concurrent accepts.
                        await LockRiderRowAsync(riderUserId);

                        var active = await _unitOfWork.AssignedOrderRepository.CountActiveForRiderAsync(riderUserId);
                        if (active >= OrderStatuses.MaxActiveDeliveries)
                        {
                            await tx.RollbackAsync();
                            return new ApiResponse<AvailableOrderDto>(false, $"Maximum {OrderStatuses.MaxActiveDeliveries} active deliveries allowed", null!);
                        }

                        // Detach tracked entity then conditional UPDATE so only one winner succeeds
                        _unitOfWork.Context.Entry(order).State = EntityState.Detached;
                        var won = await _unitOfWork.AssignedOrderRepository.TryAcceptAvailableAsync(id, riderUserId, now);
                        if (!won)
                        {
                            await tx.RollbackAsync();
                            return new ApiResponse<AvailableOrderDto>(false, "Order was accepted by another rider", null!);
                        }

                        _unitOfWork.Context.ChangeTracker.Clear();
                        order = await _unitOfWork.AssignedOrderRepository.GetByIdForUpdateAsync(id);
                        if (order == null)
                        {
                            await tx.RollbackAsync();
                            return new ApiResponse<AvailableOrderDto>(false, "Order not found", null!);
                        }
                        break;
                    }
                    case OrderStatuses.InProgress:
                    {
                        if (order.Status != OrderStatuses.Accepted && order.Status != OrderStatuses.InProgress)
                        {
                            await tx.RollbackAsync();
                            return new ApiResponse<AvailableOrderDto>(false, "Order must be Accepted first", null);
                        }
                        if (order.AcceptedByUserId != riderUserId)
                        {
                            await tx.RollbackAsync();
                            return new ApiResponse<AvailableOrderDto>(false, "This order is assigned to another rider", null);
                        }
                        order.Status = OrderStatuses.InProgress;
                        order.PickedUpAt ??= now;
                        order.UpdatedAt = now;
                        break;
                    }
                    case OrderStatuses.Completed:
                    {
                        if (order.Status != OrderStatuses.InProgress)
                        {
                            await tx.RollbackAsync();
                            return new ApiResponse<AvailableOrderDto>(false, "Pickup (InProgress) is required before Completed", null);
                        }
                        if (order.AcceptedByUserId != riderUserId)
                        {
                            await tx.RollbackAsync();
                            return new ApiResponse<AvailableOrderDto>(false, "This order is assigned to another rider", null);
                        }

                        var expected = order.ExpectedCash ?? (IsCashMethod(order.PaymentMethod) ? order.Cash : null);
                        decimal? cashCollected = null;
                        string? cashReason = null;
                        string? cashSemantics = null;
                        if (RequiresCashOnComplete(order, expected))
                        {
                            if (!request.cashCollected.HasValue)
                            {
                                await tx.RollbackAsync();
                                return new ApiResponse<AvailableOrderDto>(false, "cashCollected is required for COD/cash orders", null);
                            }
                            if (expected.HasValue && request.cashCollected.Value != expected.Value
                                && string.IsNullOrWhiteSpace(request.cashCollectedReason))
                            {
                                await tx.RollbackAsync();
                                return new ApiResponse<AvailableOrderDto>(false, "cashCollectedReason is required when amount differs from expected", null);
                            }
                            cashCollected = request.cashCollected;
                            cashReason = request.cashCollectedReason;
                            cashSemantics = CashSemantics.RiderCollected;
                        }
                        else if (request.cashCollected.HasValue)
                        {
                            cashCollected = request.cashCollected;
                            cashReason = request.cashCollectedReason;
                            cashSemantics = CashSemantics.RiderCollected;
                        }

                        // Detach then conditional UPDATE so concurrent completions yield one financial effect.
                        _unitOfWork.Context.Entry(order).State = EntityState.Detached;
                        var completed = await _unitOfWork.AssignedOrderRepository.TryCompleteInProgressAsync(
                            id, riderUserId, now, cashCollected, cashReason, cashSemantics);
                        if (!completed)
                        {
                            await tx.RollbackAsync();
                            return new ApiResponse<AvailableOrderDto>(false, "Order was already completed or cancelled", null!);
                        }

                        _unitOfWork.Context.ChangeTracker.Clear();
                        order = await _unitOfWork.AssignedOrderRepository.GetByIdForUpdateAsync(id);
                        if (order == null)
                        {
                            await tx.RollbackAsync();
                            return new ApiResponse<AvailableOrderDto>(false, "Order not found", null!);
                        }
                        break;
                    }
                }

                await _unitOfWork.Context.Set<OrderLifecycleAudit>().AddAsync(new OrderLifecycleAudit
                {
                    AssignedOrderId = id,
                    ActorUserId = riderUserId,
                    ActorType = "Rider",
                    PreviousStatus = previous,
                    NewStatus = next,
                    Reason = request.reason,
                    RequestId = requestId,
                    CashCollected = request.cashCollected,
                    CreatedAt = now
                });

                await _unitOfWork.SaveChangesAsync();
                await tx.CommitAsync();

                var fresh = await _unitOfWork.AssignedOrderRepository.GetByIdWithItemsAsync(id);
                try
                {
                    await SafePublishOrderChanged(fresh?.Batch?.StoreId, id, fresh?.OrderId ?? "", next);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Ops event publish failed after status update");
                }

                return new ApiResponse<AvailableOrderDto>(true, "Status updated", MapOrder(fresh!));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Status update failed for order {OrderId}", id);
                try { await tx.RollbackAsync(); } catch { /* ignore */ }
                return new ApiResponse<AvailableOrderDto>(false, "Unable to update order status", null);
            }
        }

        public async Task<ApiResponse<AvailableOrderDto>> RejectOrderAsync(
            long id, Guid riderUserId, RejectOrderRequest request)
        {
            request ??= new RejectOrderRequest();
            var requestId = string.IsNullOrWhiteSpace(request.requestId) ? null : request.requestId.Trim();

            if (!string.IsNullOrEmpty(requestId))
            {
                var prior = await _unitOfWork.Context.Set<OrderLifecycleAudit>()
                    .AsNoTracking()
                    .FirstOrDefaultAsync(a => a.RequestId == requestId);
                if (prior != null)
                {
                    var existing = await _unitOfWork.AssignedOrderRepository.GetByIdWithItemsAsync(id);
                    return new ApiResponse<AvailableOrderDto>(true, "Order rejected", existing == null ? null : MapOrder(existing));
                }
            }

            await using var tx = await _unitOfWork.Context.Database.BeginTransactionAsync();
            try
            {
                var order = await _unitOfWork.AssignedOrderRepository.GetByIdForUpdateAsync(id);
                if (order == null)
                    return new ApiResponse<AvailableOrderDto>(false, "Order not found", null);

                if (order.Status != OrderStatuses.Available
                    && !(order.Status == OrderStatuses.Accepted && order.AcceptedByUserId == riderUserId))
                {
                    await tx.RollbackAsync();
                    return new ApiResponse<AvailableOrderDto>(false, "Order cannot be rejected in its current state", null);
                }

                if (order.AcceptedByUserId.HasValue && order.AcceptedByUserId != riderUserId
                    && order.Status != OrderStatuses.Available)
                {
                    await tx.RollbackAsync();
                    return new ApiResponse<AvailableOrderDto>(false, "This order is assigned to another rider", null);
                }

                // Direct reserved Available: only reserved rider may reject
                if (order.Status == OrderStatuses.Available
                    && order.AcceptedByUserId.HasValue
                    && order.AcceptedByUserId != riderUserId)
                {
                    await tx.RollbackAsync();
                    return new ApiResponse<AvailableOrderDto>(false, "This order is assigned to another rider", null);
                }

                if (await _unitOfWork.AssignedOrderRepository.HasRiderRejectedAsync(id, riderUserId))
                {
                    await tx.RollbackAsync();
                    var already = await _unitOfWork.AssignedOrderRepository.GetByIdWithItemsAsync(id);
                    return new ApiResponse<AvailableOrderDto>(true, "Order rejected", MapOrder(already!));
                }

                var wasDirect = order.IsDirectAssignment || (order.AcceptedByUserId == riderUserId && order.Status == OrderStatuses.Available);
                var previous = order.Status;
                var now = DateTime.UtcNow;

                await _unitOfWork.Context.Set<OrderRejection>().AddAsync(new OrderRejection
                {
                    AssignedOrderId = id,
                    RiderUserId = riderUserId,
                    Reason = request.reason,
                    IsDirectAssignment = wasDirect,
                    CreatedAt = now
                });

                if (wasDirect)
                {
                    // Keep out of public pool: Status Available, clear assignee, keep IsDirectAssignment
                    order.Status = OrderStatuses.Available;
                    order.AcceptedByUserId = null;
                    order.AcceptedAt = null;
                    order.IsDirectAssignment = true;
                }
                else
                {
                    // Pool reject: order stays Available for others
                    order.Status = OrderStatuses.Available;
                }

                // If rider had Accepted it, release back (pool) or hold (direct)
                if (previous == OrderStatuses.Accepted)
                {
                    order.AcceptedAt = null;
                    if (!wasDirect)
                        order.AcceptedByUserId = null;
                }

                order.UpdatedAt = now;

                await _unitOfWork.Context.Set<OrderLifecycleAudit>().AddAsync(new OrderLifecycleAudit
                {
                    AssignedOrderId = id,
                    ActorUserId = riderUserId,
                    ActorType = "Rider",
                    PreviousStatus = previous,
                    NewStatus = "Rejected",
                    Reason = request.reason,
                    RequestId = requestId,
                    CreatedAt = now
                });

                var notif = new AdminNotification
                {
                    StoreId = order.Batch?.StoreId,
                    Category = "orders",
                    Title = "Order rejected",
                    Body = $"Rider rejected order {order.OrderId}",
                    OrderId = order.OrderId,
                    AssignedOrderId = order.Id,
                    CreatedAt = now
                };
                await _unitOfWork.Context.Set<AdminNotification>().AddAsync(notif);

                await _unitOfWork.SaveChangesAsync();
                await tx.CommitAsync();

                try
                {
                    await SafePublishOrderChanged(order.Batch?.StoreId, order.Id, order.OrderId, order.Status);
                    await _opsEvents.PublishAdminNotificationCreatedAsync(notif.StoreId, notif.Id, notif.Title);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Post-reject publish failed");
                }

                var fresh = await _unitOfWork.AssignedOrderRepository.GetByIdWithItemsAsync(id);
                return new ApiResponse<AvailableOrderDto>(true, "Order rejected", MapOrder(fresh!));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Reject failed for order {OrderId}", id);
                try { await tx.RollbackAsync(); } catch { /* ignore */ }
                return new ApiResponse<AvailableOrderDto>(false, "Unable to reject order", null);
            }
        }

        public async Task<ApiResponse<List<AvailableOrderDto>>> GetAvailableOrdersAsync(Guid riderUserId)
        {
            var orders = await _unitOfWork.AssignedOrderRepository.GetAvailableWithItemsAsync(riderUserId);
            var list = orders
                .GroupBy(o => o.OrderId.Trim(), StringComparer.OrdinalIgnoreCase)
                .Select(g => g.OrderByDescending(o => o.CreatedAt).First())
                .OrderByDescending(o => o.CreatedAt)
                .Select(MapOrder)
                .ToList();
            return new ApiResponse<List<AvailableOrderDto>>(true, "Available orders", list);
        }

        public async Task<ApiResponse<List<AvailableOrderDto>>> GetActiveOrdersAsync(Guid riderUserId)
        {
            var orders = await _unitOfWork.AssignedOrderRepository.GetActiveForRiderAsync(riderUserId);
            return new ApiResponse<List<AvailableOrderDto>>(true, "Active orders", orders.Select(MapOrder).ToList());
        }

        public async Task<ApiResponse<List<AvailableOrderDto>>> GetOrderHistoryAsync(Guid riderUserId, int page, int pageSize)
        {
            if (page < 1) page = 1;
            if (pageSize < 1) pageSize = 20;
            if (pageSize > 100) pageSize = 100;
            var skip = (page - 1) * pageSize;
            var orders = await _unitOfWork.AssignedOrderRepository.GetHistoryForRiderAsync(riderUserId, skip, pageSize);
            return new ApiResponse<List<AvailableOrderDto>>(true, "Order history", orders.Select(MapOrder).ToList());
        }

        public async Task<ApiResponse<RiderPerformanceDto>> GetPerformanceAsync(Guid riderUserId, DateTime? from, DateTime? to)
        {
            var toUtc = to ?? DateTime.UtcNow;
            var fromUtc = from ?? toUtc.AddDays(-7);

            var completed = await _unitOfWork.Context.Set<AssignedOrder>()
                .AsNoTracking()
                .Where(o => o.AcceptedByUserId == riderUserId
                    && o.Status == OrderStatuses.Completed
                    && (o.CompletedAt ?? o.UpdatedAt ?? o.CreatedAt) >= fromUtc
                    && (o.CompletedAt ?? o.UpdatedAt ?? o.CreatedAt) < toUtc)
                .ToListAsync();

            double? avgMinutes = null;
            var withDuration = completed
                .Where(o => o.AcceptedAt.HasValue && o.CompletedAt.HasValue)
                .Select(o => (o.CompletedAt!.Value - o.AcceptedAt!.Value).TotalMinutes)
                .Where(m => m >= 0)
                .ToList();
            if (withDuration.Count > 0)
                avgMinutes = withDuration.Average();

            var intervals = await _unitOfWork.Context.Set<RiderAvailabilityInterval>()
                .AsNoTracking()
                .Where(i => i.UserId == riderUserId
                    && i.StartedAt < toUtc
                    && (i.EndedAt == null || i.EndedAt > fromUtc))
                .ToListAsync();

            double onlineHours = 0;
            foreach (var i in intervals)
            {
                var start = i.StartedAt < fromUtc ? fromUtc : i.StartedAt;
                var end = (i.EndedAt ?? toUtc) > toUtc ? toUtc : (i.EndedAt ?? toUtc);
                if (end > start)
                    onlineHours += (end - start).TotalHours;
            }

            var codCollected = completed.Sum(o => o.CashCollected ?? 0);
            var codOutstanding = completed.Sum(o =>
            {
                var collected = o.CashCollected ?? 0;
                var handed = o.CashHandedOverAmount ?? 0;
                return Math.Max(0, collected - handed);
            });

            return new ApiResponse<RiderPerformanceDto>(true, "Performance", new RiderPerformanceDto
            {
                completedCount = completed.Count,
                avgDurationMinutes = avgMinutes,
                onlineHours = Math.Round(onlineHours, 2),
                codCollected = codCollected,
                codOutstanding = codOutstanding,
                from = fromUtc,
                to = toUtc
            });
        }

        public async Task<ApiResponse<AvailableOrderDto>> GetOrderByIdAsync(long id, Guid? riderUserId = null)
        {
            var order = await _unitOfWork.AssignedOrderRepository.GetByIdWithItemsAsync(id);
            if (order == null)
                return new ApiResponse<AvailableOrderDto>(false, "Order not found", null);

            if (riderUserId.HasValue && !await RiderCanSeeOrderAsync(order, riderUserId.Value))
                return new ApiResponse<AvailableOrderDto>(false, "Order not found", null);

            return new ApiResponse<AvailableOrderDto>(true, "Success", MapOrder(order));
        }

        public async Task<ApiResponse<AvailableOrderDto>> GetOrderByExternalIdAsync(string orderId, Guid? riderUserId = null)
        {
            if (string.IsNullOrWhiteSpace(orderId))
                return new ApiResponse<AvailableOrderDto>(false, "Order id is required", null);

            var order = await _unitOfWork.AssignedOrderRepository
                .GetByExternalOrderIdAsync(orderId.Trim());
            if (order == null)
                return new ApiResponse<AvailableOrderDto>(false, "Order not found", null);

            if (riderUserId.HasValue && !await RiderCanSeeOrderAsync(order, riderUserId.Value))
                return new ApiResponse<AvailableOrderDto>(false, "Order not found", null);

            return new ApiResponse<AvailableOrderDto>(true, "Success", MapOrder(order));
        }

        private async Task<bool> RiderCanSeeOrderAsync(AssignedOrder order, Guid riderUserId)
        {
            if (order.AcceptedByUserId == riderUserId)
                return true;

            if (order.Status == OrderStatuses.Available)
            {
                if (await _unitOfWork.AssignedOrderRepository.HasRiderRejectedAsync(order.Id, riderUserId))
                    return false;
                if (order.IsDirectAssignment && order.AcceptedByUserId == null)
                    return false;
                if (order.AcceptedByUserId.HasValue && order.AcceptedByUserId != riderUserId)
                    return false;
                return true;
            }

            return false;
        }

        private async Task SafePublishOrderChanged(string? storeId, long assignedOrderId, string orderId, string status)
        {
            try
            {
                await _opsEvents.PublishOrderChangedAsync(storeId, assignedOrderId, orderId, status);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "PublishOrderChanged failed");
            }
        }

        private static decimal? ResolveExpectedCash(string? paymentMethod, decimal? cash, decimal? existing)
        {
            if (IsCashMethod(paymentMethod) || (cash.HasValue && cash.Value > 0))
                return cash ?? existing;
            return null; // never use OrderTotal for prepaid
        }

        private static bool IsCashMethod(string? paymentMethod)
        {
            var m = (paymentMethod ?? "").Trim().ToLowerInvariant();
            return m is "cash" or "cod" or "c";
        }

        private static bool RequiresCashOnComplete(AssignedOrder order, decimal? expected)
            => IsCashMethod(order.PaymentMethod) || (expected.HasValue && expected.Value > 0);

        private static List<AssignOrderItemDto> ResolveItems(
            string orderId,
            Dictionary<string, List<AssignOrderItemDto>> itemsByOrderKey,
            AssignOrderRequest request)
        {
            if (itemsByOrderKey.TryGetValue(orderId, out var list))
                return list;

            if (long.TryParse(orderId, out var numericId) &&
                itemsByOrderKey.TryGetValue(numericId.ToString(), out var byNumeric))
                return byNumeric;

            if (request.orders?.Count == 1 &&
                request.orderItems != null &&
                request.orderItems.Count > 0)
                return request.orderItems;

            return new List<AssignOrderItemDto>();
        }

        internal static AvailableOrderDto MapOrder(AssignedOrder o) => new()
        {
            id = o.Id,
            orderId = o.OrderId,
            orderNo = o.OrderNo,
            displayOrderNo = string.IsNullOrWhiteSpace(o.OrderNo) ? o.OrderId : o.OrderNo,
            storeId = o.Batch?.StoreId,
            storeLat = o.Batch?.Store?.Latitude,
            storeLng = o.Batch?.Store?.Longitude,
            orderTypeId = o.OrderTypeId,
            orderState = o.OrderState,
            status = o.Status,
            comment = o.Comment,
            firstName = o.FirstName,
            lastName = o.LastName,
            city = o.City,
            street = o.Street,
            addressNo = o.AddressNo,
            postCode = o.PostCode,
            secondaryAddress = o.SecondaryAddress,
            lat = o.Lat,
            lng = o.Lng,
            phone = o.Phone,
            orderTotal = o.OrderTotal,
            paymentMethod = o.PaymentMethod,
            cash = o.Cash,
            orderTime = o.OrderTime,
            batchTime = o.Batch?.Time,
            createdAt = o.CreatedAt,
            acceptedAt = o.AcceptedAt,
            pickedUpAt = o.PickedUpAt,
            completedAt = o.CompletedAt,
            cashCollected = o.CashCollected,
            expectedCash = o.ExpectedCash,
            cashCollectedReason = o.CashCollectedReason,
            cashHandedOverAt = o.CashHandedOverAt,
            cashHandedOverAmount = o.CashHandedOverAmount,
            cashSemanticsNote = o.CashSemanticsNote,
            isDirectAssignment = o.IsDirectAssignment,
            acceptedByUserId = o.AcceptedByUserId,
            items = (o.Items ?? Enumerable.Empty<AssignedOrderItem>())
                .Select(i => new AssignOrderItemDto
                {
                    itemId = i.ItemId,
                    description = i.Description,
                    position = i.Position,
                    quantity = i.Quantity,
                    comment = i.Comment,
                    lineNum = i.LineNum,
                    size = i.Size
                })
                .ToList()
        };

        /// <summary>
        /// Take an exclusive lock on the rider Users row so concurrent accepts serialize
        /// the active-job count check. No-ops gracefully on providers without UPDLOCK.
        /// </summary>
        private async Task LockRiderRowAsync(Guid riderUserId)
        {
            try
            {
                await _unitOfWork.Context.Database.ExecuteSqlInterpolatedAsync(
                    $"SELECT 1 FROM Users WITH (UPDLOCK, ROWLOCK) WHERE UserId = {riderUserId}");
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Rider row lock unavailable; continuing without UPDLOCK");
            }
        }
    }
}
