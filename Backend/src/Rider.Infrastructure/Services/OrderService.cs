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

        public OrderService(IUnitOfWork unitOfWork)
        {
            _unitOfWork = unitOfWork;
        }

        public async Task<ApiResponse<AssignOrderResultDto>> AssignOrderAsync(AssignOrderRequest request)
        {
            if (request == null)
                return new ApiResponse<AssignOrderResultDto>(false, "Request body is required", null);

            if (string.IsNullOrWhiteSpace(request.storeId))
                return new ApiResponse<AssignOrderResultDto>(false, "storeId is required", null);

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
                    continue;
                }

                if (existing != null)
                {
                    // Already accepted/in progress — skip duplicate assign
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
            }

            if (savedOrderIds.Count == 0)
                return new ApiResponse<AssignOrderResultDto>(false, "No valid orders to assign", null);

            if (batch.Orders.Count > 0)
                await _unitOfWork.AssignedOrderBatchRepository.AddAsync(batch);

            await _unitOfWork.SaveChangesAsync();

            return new ApiResponse<AssignOrderResultDto>(true, "Orders assigned successfully", new AssignOrderResultDto
            {
                batchId = batch.Id,
                storeId = batch.StoreId,
                ordersSaved = savedOrderIds.Count,
                itemsSaved = itemsSaved,
                orderIds = savedOrderIds
            });
        }

        public async Task<ApiResponse<List<AvailableOrderDto>>> GetAvailableOrdersAsync()
        {
            var orders = await _unitOfWork.AssignedOrderRepository.GetAvailableWithItemsAsync();
            var list = orders.Select(MapOrder).ToList();
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
