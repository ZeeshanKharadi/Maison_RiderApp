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

        public OrderService(IUnitOfWork unitOfWork, IRiderNotificationService notifications)
        {
            _unitOfWork = unitOfWork;
            _notifications = notifications;
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
                // Stores table is added by 003_AdminPortal.sql — AssignOrder must not depend on it.
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

            foreach (var dto in request.orders)
            {
                if (string.IsNullOrWhiteSpace(dto.orderId))
                    continue;

                var existing = await _unitOfWork.AssignedOrderRepository
                    .GetByExternalOrderIdAsync(dto.orderId.Trim());

                if (existing != null && existing.Status == "Available")
                {
                    // Upsert: refresh available order details from latest AssignOrder push
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
                    existing.OrderTime = dto.orderTime;
                    existing.UpdatedAt = DateTime.UtcNow;
                    if (assignToUserId.HasValue)
                        existing.AcceptedByUserId = assignToUserId;

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
                        pendingNotifications.Add((
                            true,
                            assignToUserId.Value,
                            existing.OrderId,
                            dto.orderTotal));
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
                    OrderTime = dto.orderTime,
                    Status = "Available",
                    AcceptedByUserId = assignToUserId,
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
                pendingNotifications.Add((
                    assignToUserId.HasValue,
                    assignToUserId,
                    order.OrderId,
                    dto.orderTotal));
            }

            if (savedOrderIds.Count == 0)
                return new ApiResponse<AssignOrderResultDto>(false, "No valid orders to assign", null);

            if (batch.Orders.Count > 0)
                await _unitOfWork.AssignedOrderBatchRepository.AddAsync(batch);

            await _unitOfWork.SaveChangesAsync();

            foreach (var pending in pendingNotifications)
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

            user.LastSeenAt = DateTime.UtcNow;
            await _unitOfWork.UserRepository.UpdateAsync(user);
            await _unitOfWork.SaveChangesAsync();
        }

        public async Task<ApiResponse<AvailableOrderDto>> UpdateRiderStatusAsync(
            long id, Guid riderUserId, UpdateOrderStatusRequest request)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.status))
                return new ApiResponse<AvailableOrderDto>(false, "status is required", null);

            var order = await _unitOfWork.AssignedOrderRepository.GetByIdForUpdateAsync(id);
            if (order == null)
                return new ApiResponse<AvailableOrderDto>(false, "Order not found", null);

            var next = request.status.Trim();
            var now = DateTime.UtcNow;

            switch (next)
            {
                case "Accepted":
                    if (order.Status != "Available")
                        return new ApiResponse<AvailableOrderDto>(false, "Only Available orders can be accepted", null);
                    if (order.AcceptedByUserId.HasValue && order.AcceptedByUserId != riderUserId)
                        return new ApiResponse<AvailableOrderDto>(false, "This order is assigned to another rider", null);
                    order.Status = "Accepted";
                    order.AcceptedByUserId = riderUserId;
                    order.AcceptedAt ??= now;
                    break;
                case "InProgress":
                    if (order.Status != "Accepted" && order.Status != "InProgress")
                        return new ApiResponse<AvailableOrderDto>(false, "Order must be Accepted first", null);
                    if (order.AcceptedByUserId != riderUserId)
                        return new ApiResponse<AvailableOrderDto>(false, "This order is assigned to another rider", null);
                    order.Status = "InProgress";
                    order.PickedUpAt ??= now;
                    break;
                case "Completed":
                    if (order.Status != "InProgress" && order.Status != "Accepted")
                        return new ApiResponse<AvailableOrderDto>(false, "Order is not in a completable state", null);
                    if (order.AcceptedByUserId != riderUserId)
                        return new ApiResponse<AvailableOrderDto>(false, "This order is assigned to another rider", null);
                    order.Status = "Completed";
                    order.CompletedAt ??= now;
                    if (request.cashCollected.HasValue)
                        order.CashCollected = request.cashCollected;
                    break;
                default:
                    return new ApiResponse<AvailableOrderDto>(false, "Unsupported status. Use Accepted, InProgress, or Completed", null);
            }

            order.UpdatedAt = now;
            await _unitOfWork.AssignedOrderRepository.UpdateAsync(order);
            await _unitOfWork.SaveChangesAsync();

            var fresh = await _unitOfWork.AssignedOrderRepository.GetByIdWithItemsAsync(id);
            return new ApiResponse<AvailableOrderDto>(true, "Status updated", MapOrder(fresh));
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

        public async Task<ApiResponse<AvailableOrderDto>> GetOrderByIdAsync(long id)
        {
            var order = await _unitOfWork.AssignedOrderRepository.GetByIdWithItemsAsync(id);
            if (order == null)
                return new ApiResponse<AvailableOrderDto>(false, "Order not found", null);

            return new ApiResponse<AvailableOrderDto>(true, "Success", MapOrder(order));
        }

        public async Task<ApiResponse<AvailableOrderDto>> GetOrderByExternalIdAsync(string orderId)
        {
            if (string.IsNullOrWhiteSpace(orderId))
                return new ApiResponse<AvailableOrderDto>(false, "Order id is required", null);

            var order = await _unitOfWork.AssignedOrderRepository
                .GetByExternalOrderIdAsync(orderId.Trim());
            if (order == null)
                return new ApiResponse<AvailableOrderDto>(false, "Order not found", null);

            return new ApiResponse<AvailableOrderDto>(true, "Success", MapOrder(order));
        }

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

            // Single-order payload: POS often sends distinct menu itemIds, not orderId.
            if (request.orders?.Count == 1 &&
                request.orderItems != null &&
                request.orderItems.Count > 0)
                return request.orderItems;

            return new List<AssignOrderItemDto>();
        }

        private static AvailableOrderDto MapOrder(AssignedOrder o) => new()
        {
            id = o.Id,
            orderId = o.OrderId,
            orderNo = o.OrderNo,
            storeId = o.Batch?.StoreId,
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
    }
}
