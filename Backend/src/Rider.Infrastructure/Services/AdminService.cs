using System.Globalization;
using System.Text;
using Rider.Application.DTOs.Admin;
using Rider.Application.DTOs.Orders;
using Rider.Application.Helpers;
using Rider.Application.Interfaces;
using Rider.Application.Interfaces.Repositories;
using Rider.Domain.Common;
using Rider.Domain.Entities;

namespace Rider.Infrastructure.Services
{
    public class AdminService : IAdminService
    {
        private static readonly TimeSpan OnlineWindow = TimeSpan.FromMinutes(10);

        private readonly IUnitOfWork _unitOfWork;
        private readonly IPasswordCrypto _passwordCrypto;

        public AdminService(IUnitOfWork unitOfWork, IPasswordCrypto passwordCrypto)
        {
            _unitOfWork = unitOfWork;
            _passwordCrypto = passwordCrypto;
        }

        public async Task<AdminActor> ResolveActorAsync(string userId)
        {
            if (!Guid.TryParse(userId, out var uid))
                return null;

            var user = await _unitOfWork.UserRepository.GetByUserIdAsync(uid);
            if (user == null)
                return null;

            return new AdminActor
            {
                UserId = user.UserId,
                WorkerId = user.ThirdPartyEmployeeId,
                Name = user.UserName,
                StoreId = user.StoreId,
                Roles = RolesOf(user)
            };
        }

        public async Task<ApiResponse<List<AdminRiderDto>>> ListRidersAsync(AdminActor actor, string storeId)
        {
            var scoped = ScopeStore(actor, storeId);
            if (scoped.denied)
                return Fail<List<AdminRiderDto>>(scoped.message);

            var riders = await _unitOfWork.UserRepository.ListRidersAsync(scoped.storeId);
            var stores = await StoreLookupAsync();
            var list = riders.Select(u => MapRider(u, stores)).ToList();
            return Ok(list, "Riders");
        }

        public async Task<ApiResponse<AdminRiderDto>> GetRiderAsync(AdminActor actor, Guid riderId)
        {
            var rider = await _unitOfWork.UserRepository.GetByUserIdAsync(riderId);
            if (rider == null || !IsRider(rider))
                return Fail<AdminRiderDto>("Rider not found");

            if (!CanSeeStore(actor, rider.StoreId))
                return Fail<AdminRiderDto>("Rider not found");

            var stores = await StoreLookupAsync();
            return Ok(MapRider(rider, stores), "Success");
        }

        public async Task<ApiResponse<AdminRiderDto>> CreateRiderAsync(AdminActor actor, CreateRiderRequest request)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.workerId) || string.IsNullOrWhiteSpace(request.name))
                return Fail<AdminRiderDto>("workerId and name are required");

            var workerId = request.workerId.Trim();
            if (await _unitOfWork.UserRepository.ExistsAsync(u =>
                    u.ThirdPartyEmployeeId == workerId && u.DeletedAt == null))
                return Fail<AdminRiderDto>("A user with this workerId already exists");

            var storeId = ScopeStore(actor, request.storeId);
            if (storeId.denied)
                return Fail<AdminRiderDto>(storeId.message);

            if (!actor.IsHeadOffice && string.IsNullOrWhiteSpace(storeId.storeId))
                return Fail<AdminRiderDto>("Store is required");

            if (!string.IsNullOrWhiteSpace(request.password) && request.password.Length < 6)
                return Fail<AdminRiderDto>("Password must be at least 6 characters");

            var riderRole = await _unitOfWork.RoleRepository.GetByNameAsync(RoleNames.Rider);
            if (riderRole == null)
                return Fail<AdminRiderDto>("Rider role is not configured");

            if (!string.IsNullOrWhiteSpace(storeId.storeId))
                await _unitOfWork.StoreRepository.EnsureExistsAsync(storeId.storeId, storeId.storeId);

            var hasPassword = !string.IsNullOrWhiteSpace(request.password);
            var user = new AppUser
            {
                UserId = Guid.NewGuid(),
                UserName = request.name.Trim(),
                Email = string.IsNullOrWhiteSpace(request.email)
                    ? $"{workerId.ToLowerInvariant()}@maison.local"
                    : request.email.Trim(),
                PhoneNumber = request.phone?.Trim(),
                ThirdPartyEmployeeId = workerId,
                StoreId = string.IsNullOrWhiteSpace(storeId.storeId) ? null : storeId.storeId,
                IsActive = true,
                IsVerified = hasPassword,
                CreatedAt = DateTime.UtcNow,
                Position = "Rider",
                Department = "Delivery",
                PasswordEncrypted = hasPassword ? _passwordCrypto.Encrypt(request.password) : null
            };

            await _unitOfWork.UserRepository.AddAsync(user);
            await _unitOfWork.UserRoleRepository.AddAsync(new UserRole
            {
                UserId = user.UserId,
                RoleId = riderRole.RoleId,
                AssignedAt = DateTime.UtcNow
            });
            await _unitOfWork.SaveChangesAsync();

            var created = await _unitOfWork.UserRepository.GetByUserIdAsync(user.UserId);
            var stores = await StoreLookupAsync();
            return Ok(MapRider(created, stores), hasPassword
                ? "Rider created"
                : "Rider created. They can set a password via register / OTP.");
        }

        public async Task<ApiResponse<AdminRiderDto>> UpdateRiderAsync(AdminActor actor, Guid riderId, UpdateRiderRequest request)
        {
            var rider = await _unitOfWork.UserRepository.GetByUserIdAsync(riderId);
            if (rider == null || !IsRider(rider))
                return Fail<AdminRiderDto>("Rider not found");

            if (!CanSeeStore(actor, rider.StoreId))
                return Fail<AdminRiderDto>("Rider not found");

            if (!string.IsNullOrWhiteSpace(request?.name))
                rider.UserName = request.name.Trim();
            if (request?.phone != null)
                rider.PhoneNumber = request.phone.Trim();
            if (request?.email != null)
                rider.Email = request.email.Trim();

            if (request?.storeId != null)
            {
                var scoped = ScopeStore(actor, request.storeId);
                if (scoped.denied)
                    return Fail<AdminRiderDto>(scoped.message);

                if (!actor.IsHeadOffice && !string.Equals(scoped.storeId, actor.StoreId, StringComparison.OrdinalIgnoreCase))
                    return Fail<AdminRiderDto>("Cannot assign a rider to another store");

                rider.StoreId = string.IsNullOrWhiteSpace(scoped.storeId) ? null : scoped.storeId;
                if (!string.IsNullOrWhiteSpace(rider.StoreId))
                    await _unitOfWork.StoreRepository.EnsureExistsAsync(rider.StoreId, rider.StoreId);
            }

            if (request?.isActive.HasValue == true)
                rider.IsActive = request.isActive.Value;

            await _unitOfWork.UserRepository.UpdateAsync(rider);
            await _unitOfWork.SaveChangesAsync();

            var stores = await StoreLookupAsync();
            return Ok(MapRider(rider, stores), "Rider updated");
        }

        public async Task<ApiResponse<string>> ResetRiderPasswordAsync(AdminActor actor, Guid riderId, ResetRiderPasswordRequest request)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.password) || request.password.Length < 6)
                return Fail<string>("Password must be at least 6 characters");

            var rider = await _unitOfWork.UserRepository.GetByUserIdAsync(riderId);
            if (rider == null || !IsRider(rider))
                return Fail<string>("Rider not found");

            if (!CanSeeStore(actor, rider.StoreId))
                return Fail<string>("Rider not found");

            rider.PasswordEncrypted = _passwordCrypto.Encrypt(request.password);
            rider.IsVerified = true;
            await _unitOfWork.UserRepository.UpdateAsync(rider);
            await _unitOfWork.SaveChangesAsync();
            return Ok("", "Password reset");
        }

        public async Task<ApiResponse<string>> SetRiderActiveAsync(AdminActor actor, Guid riderId, bool isActive)
        {
            if (riderId == actor.UserId)
                return Fail<string>("You cannot change your own active status here");

            var rider = await _unitOfWork.UserRepository.GetByUserIdAsync(riderId);
            if (rider == null || !IsRider(rider))
                return Fail<string>("Rider not found");

            if (!CanSeeStore(actor, rider.StoreId))
                return Fail<string>("Rider not found");

            rider.IsActive = isActive;
            await _unitOfWork.UserRepository.UpdateAsync(rider);
            await _unitOfWork.SaveChangesAsync();
            return Ok("", isActive ? "Rider activated" : "Rider deactivated");
        }

        public async Task<ApiResponse<LiveBoardSummaryDto>> GetLiveSummaryAsync(AdminActor actor, string storeId)
        {
            var scoped = ScopeStore(actor, storeId);
            if (scoped.denied)
                return Fail<LiveBoardSummaryDto>(scoped.message);

            var today = DateTime.UtcNow.Date;
            var orders = await _unitOfWork.AssignedOrderRepository
                .QueryForAdminAsync(scoped.storeId, null, null, null, null);

            var riders = await _unitOfWork.UserRepository.ListRidersAsync(scoped.storeId);
            var onlineCutoff = DateTime.UtcNow - OnlineWindow;

            var dto = new LiveBoardSummaryDto
            {
                available = orders.Count(o => o.Status == "Available"),
                accepted = orders.Count(o => o.Status == "Accepted"),
                inProgress = orders.Count(o => o.Status == "InProgress"),
                completedToday = orders.Count(o => o.Status == "Completed" && (o.CompletedAt ?? o.UpdatedAt ?? o.CreatedAt) >= today),
                cancelledToday = orders.Count(o => o.Status == "Cancelled" && (o.UpdatedAt ?? o.CreatedAt) >= today),
                onlineRiders = riders.Count(r => r.IsActive && r.LastSeenAt.HasValue && r.LastSeenAt.Value >= onlineCutoff),
                cashToCollectToday = orders
                    .Where(o => (o.CreatedAt >= today) && IsCash(o.PaymentMethod))
                    .Sum(o => (o.Cash ?? o.OrderTotal) - (o.CashCollected ?? 0))
            };

            return Ok(dto, "Live summary");
        }

        public async Task<ApiResponse<List<AdminOrderListDto>>> ListOrdersAsync(AdminActor actor, AdminOrderQuery query)
        {
            query ??= new AdminOrderQuery();
            var scoped = ScopeStore(actor, query.storeId);
            if (scoped.denied)
                return Fail<List<AdminOrderListDto>>(scoped.message);

            var (fromUtc, toUtc) = NormalizeRange(query.from, query.to);
            var orders = await _unitOfWork.AssignedOrderRepository
                .QueryForAdminAsync(scoped.storeId, query.status, query.riderId, fromUtc, toUtc);

            return Ok(orders.Select(MapOrderList).ToList(), "Orders");
        }

        public async Task<ApiResponse<AdminOrderDetailDto>> GetOrderAsync(AdminActor actor, long id)
        {
            var order = await _unitOfWork.AssignedOrderRepository.GetByIdWithItemsAsync(id);
            if (order == null || !CanSeeStore(actor, order.Batch?.StoreId))
                return Fail<AdminOrderDetailDto>("Order not found");

            return Ok(MapOrderDetail(order), "Success");
        }

        public async Task<ApiResponse<AdminOrderDetailDto>> CancelOrderAsync(AdminActor actor, long id)
        {
            var order = await _unitOfWork.AssignedOrderRepository.GetByIdForUpdateAsync(id);
            if (order == null || !CanSeeStore(actor, order.Batch?.StoreId))
                return Fail<AdminOrderDetailDto>("Order not found");

            if (order.Status is "Completed")
                return Fail<AdminOrderDetailDto>("Completed orders cannot be cancelled");

            order.Status = "Cancelled";
            order.UpdatedAt = DateTime.UtcNow;
            await _unitOfWork.AssignedOrderRepository.UpdateAsync(order);
            await _unitOfWork.SaveChangesAsync();

            var fresh = await _unitOfWork.AssignedOrderRepository.GetByIdWithItemsAsync(id);
            return Ok(MapOrderDetail(fresh), "Order cancelled");
        }

        public async Task<ApiResponse<AdminOrderDetailDto>> RequeueOrderAsync(AdminActor actor, long id)
        {
            var order = await _unitOfWork.AssignedOrderRepository.GetByIdForUpdateAsync(id);
            if (order == null || !CanSeeStore(actor, order.Batch?.StoreId))
                return Fail<AdminOrderDetailDto>("Order not found");

            if (order.Status is "Completed" or "InProgress" or "Accepted")
                return Fail<AdminOrderDetailDto>("Only Available or Cancelled orders can be requeued");

            order.Status = "Available";
            order.AcceptedByUserId = null;
            order.AcceptedAt = null;
            order.PickedUpAt = null;
            order.CompletedAt = null;
            order.UpdatedAt = DateTime.UtcNow;
            await _unitOfWork.AssignedOrderRepository.UpdateAsync(order);
            await _unitOfWork.SaveChangesAsync();

            var fresh = await _unitOfWork.AssignedOrderRepository.GetByIdWithItemsAsync(id);
            return Ok(MapOrderDetail(fresh), "Order requeued as Available");
        }

        public async Task<ApiResponse<AdminOrderDetailDto>> SetCashCollectedAsync(AdminActor actor, long id, decimal? cashCollected)
        {
            var order = await _unitOfWork.AssignedOrderRepository.GetByIdForUpdateAsync(id);
            if (order == null || !CanSeeStore(actor, order.Batch?.StoreId))
                return Fail<AdminOrderDetailDto>("Order not found");

            order.CashCollected = cashCollected;
            order.UpdatedAt = DateTime.UtcNow;
            await _unitOfWork.AssignedOrderRepository.UpdateAsync(order);
            await _unitOfWork.SaveChangesAsync();

            var fresh = await _unitOfWork.AssignedOrderRepository.GetByIdWithItemsAsync(id);
            return Ok(MapOrderDetail(fresh), "Cash collected updated");
        }

        public async Task<ApiResponse<PaymentsDashboardDto>> GetPaymentsAsync(
            AdminActor actor, DateTime? from, DateTime? to, string storeId, Guid? riderId)
        {
            var scoped = ScopeStore(actor, storeId);
            if (scoped.denied)
                return Fail<PaymentsDashboardDto>(scoped.message);

            var (fromUtc, toUtc) = NormalizeRange(from, to, defaultDays: 7);
            var payout = await LoadPayoutAsync();
            var orders = await _unitOfWork.AssignedOrderRepository
                .QueryForAdminAsync(scoped.storeId, null, riderId, fromUtc, toUtc);

            return Ok(BuildPayments(orders, fromUtc.Value, toUtc.Value, scoped.storeId, payout), "Payments");
        }

        public async Task<ApiResponse<byte[]>> ExportPaymentsAsync(
            AdminActor actor, DateTime? from, DateTime? to, string storeId, Guid? riderId, string format)
        {
            var result = await GetPaymentsAsync(actor, from, to, storeId, riderId);
            if (!result.status || result.Data == null)
                return Fail<byte[]>(result.message ?? "Nothing to export");

            var dash = result.Data;
            var rows = new List<string[]>
            {
                new[] { "WorkerId", "Name", "Store", "Deliveries", "Cancelled", "Sales", "CashHeld", "PayoutDue" }
            };
            foreach (var r in dash.byRider)
            {
                rows.Add(new[]
                {
                    r.workerId,
                    r.name,
                    r.storeId,
                    r.deliveryCount.ToString(CultureInfo.InvariantCulture),
                    r.cancelledCount.ToString(CultureInfo.InvariantCulture),
                    r.salesTotal.ToString("0.00", CultureInfo.InvariantCulture),
                    r.cashHeld.ToString("0.00", CultureInfo.InvariantCulture),
                    r.payoutDue.ToString("0.00", CultureInfo.InvariantCulture)
                });
            }

            var excel = string.Equals(format, "xlsx", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(format, "xls", StringComparison.OrdinalIgnoreCase);
            var bytes = excel ? ToSpreadsheetMl(rows) : ToCsv(rows);
            return Ok(bytes, "Export");
        }

        public async Task<ApiResponse<ReportsDto>> GetReportsAsync(
            AdminActor actor, DateTime? from, DateTime? to, string storeId, Guid? riderId)
        {
            var scoped = ScopeStore(actor, storeId);
            if (scoped.denied)
                return Fail<ReportsDto>(scoped.message);

            var (fromUtc, toUtc) = NormalizeRange(from, to, defaultDays: 7);
            var orders = await _unitOfWork.AssignedOrderRepository
                .QueryForAdminAsync(scoped.storeId, null, riderId, fromUtc, toUtc);

            var timed = orders
                .Where(o => o.AcceptedAt.HasValue && o.CompletedAt.HasValue && o.CompletedAt >= o.AcceptedAt)
                .ToList();

            var perRider = orders
                .Where(o => o.AcceptedByUserId.HasValue)
                .GroupBy(o => new
                {
                    Date = o.CreatedAt.Date.ToString("yyyy-MM-dd"),
                    RiderId = o.AcceptedByUserId.Value,
                    WorkerId = o.AcceptedByUser?.ThirdPartyEmployeeId ?? "",
                    Name = o.AcceptedByUser?.UserName ?? ""
                })
                .Select(g => new OrdersPerRiderDayDto
                {
                    date = g.Key.Date,
                    riderId = g.Key.RiderId,
                    workerId = g.Key.WorkerId,
                    name = g.Key.Name,
                    completed = g.Count(x => x.Status == "Completed"),
                    cancelled = g.Count(x => x.Status == "Cancelled"),
                    accepted = g.Count(x => x.Status == "Accepted"),
                    inProgress = g.Count(x => x.Status == "InProgress")
                })
                .OrderByDescending(x => x.date)
                .ThenBy(x => x.workerId)
                .ToList();

            var dto = new ReportsDto
            {
                status = new StatusSummaryDto
                {
                    available = orders.Count(o => o.Status == "Available"),
                    accepted = orders.Count(o => o.Status == "Accepted"),
                    inProgress = orders.Count(o => o.Status == "InProgress"),
                    completed = orders.Count(o => o.Status == "Completed"),
                    cancelled = orders.Count(o => o.Status == "Cancelled"),
                    total = orders.Count
                },
                avgDeliveryTime = new AvgDeliveryTimeDto
                {
                    sampleCount = timed.Count,
                    avgMinutes = timed.Count == 0
                        ? null
                        : timed.Average(o => (o.CompletedAt.Value - o.AcceptedAt.Value).TotalMinutes)
                },
                perRiderPerDay = perRider
            };

            return Ok(dto, "Reports");
        }

        public async Task<ApiResponse<List<StoreDto>>> ListStoresAsync(AdminActor actor)
        {
            var stores = await _unitOfWork.StoreRepository.ListActiveAsync();
            if (!actor.IsHeadOffice)
            {
                stores = stores
                    .Where(s => string.Equals(s.StoreId, actor.StoreId, StringComparison.OrdinalIgnoreCase))
                    .ToList();
            }

            return Ok(stores.Select(s => new StoreDto
            {
                storeId = s.StoreId,
                name = string.IsNullOrWhiteSpace(s.Name) ? s.StoreId : s.Name,
                isActive = s.IsActive
            }).ToList(), "Stores");
        }

        public async Task<ApiResponse<PayoutSettingsDto>> GetPayoutSettingsAsync(AdminActor actor)
            => Ok(await LoadPayoutAsync(), "Payout settings");

        public async Task<ApiResponse<PayoutSettingsDto>> UpdatePayoutSettingsAsync(AdminActor actor, PayoutSettingsDto request)
        {
            if (!actor.IsHeadOffice)
                return Fail<PayoutSettingsDto>("Only head office can change payout settings");

            request ??= new PayoutSettingsDto();
            var mode = string.Equals(request.mode, "percent", StringComparison.OrdinalIgnoreCase) ? "percent" : "fixed";
            if (request.fixedFee < 0 || request.percent < 0)
                return Fail<PayoutSettingsDto>("Payout values cannot be negative");

            await _unitOfWork.AppSettingRepository.SetValueAsync("PayoutMode", mode);
            await _unitOfWork.AppSettingRepository.SetValueAsync(
                "PayoutFixedFee", request.fixedFee.ToString(CultureInfo.InvariantCulture));
            await _unitOfWork.AppSettingRepository.SetValueAsync(
                "PayoutPercent", request.percent.ToString(CultureInfo.InvariantCulture));
            await _unitOfWork.SaveChangesAsync();

            return Ok(await LoadPayoutAsync(), "Payout settings saved");
        }

        private async Task<PayoutSettingsDto> LoadPayoutAsync()
        {
            var mode = await _unitOfWork.AppSettingRepository.GetValueAsync("PayoutMode", "fixed");
            var feeRaw = await _unitOfWork.AppSettingRepository.GetValueAsync("PayoutFixedFee", "50");
            var pctRaw = await _unitOfWork.AppSettingRepository.GetValueAsync("PayoutPercent", "10");
            decimal.TryParse(feeRaw, NumberStyles.Any, CultureInfo.InvariantCulture, out var fee);
            decimal.TryParse(pctRaw, NumberStyles.Any, CultureInfo.InvariantCulture, out var pct);
            return new PayoutSettingsDto
            {
                mode = string.Equals(mode, "percent", StringComparison.OrdinalIgnoreCase) ? "percent" : "fixed",
                fixedFee = fee,
                percent = pct
            };
        }

        private PaymentsDashboardDto BuildPayments(
            List<AssignedOrder> orders, DateTime fromUtc, DateTime toUtc, string storeId, PayoutSettingsDto payout)
        {
            var completed = orders.Where(o => o.Status == "Completed").ToList();

            decimal Bucket(AssignedOrder o) => IsCash(o.PaymentMethod) ? (o.Cash ?? o.OrderTotal) : o.OrderTotal;

            var cash = completed.Where(o => IsCash(o.PaymentMethod)).Sum(Bucket);
            var card = completed.Where(o => IsCard(o.PaymentMethod)).Sum(o => o.OrderTotal);
            var other = completed.Where(o => !IsCash(o.PaymentMethod) && !IsCard(o.PaymentMethod)).Sum(o => o.OrderTotal);

            var cashToCollect = orders.Where(o => IsCash(o.PaymentMethod) && o.Status != "Cancelled")
                .Sum(o => o.Cash ?? o.OrderTotal);
            var cashCollected = orders.Sum(o => o.CashCollected ?? 0);

            var byDay = completed
                .GroupBy(o => (o.CompletedAt ?? o.CreatedAt).Date.ToString("yyyy-MM-dd"))
                .Select(g => new PaymentByDayDto
                {
                    date = g.Key,
                    orderCount = g.Count(),
                    total = g.Sum(x => x.OrderTotal),
                    cash = g.Where(x => IsCash(x.PaymentMethod)).Sum(Bucket),
                    card = g.Where(x => IsCard(x.PaymentMethod)).Sum(x => x.OrderTotal),
                    other = g.Where(x => !IsCash(x.PaymentMethod) && !IsCard(x.PaymentMethod)).Sum(x => x.OrderTotal)
                })
                .OrderBy(x => x.date)
                .ToList();

            var byStore = completed
                .GroupBy(o => o.Batch?.StoreId ?? "")
                .Select(g => new PaymentByStoreDto
                {
                    storeId = g.Key,
                    orderCount = g.Count(),
                    total = g.Sum(x => x.OrderTotal),
                    cash = g.Where(x => IsCash(x.PaymentMethod)).Sum(Bucket),
                    card = g.Where(x => IsCard(x.PaymentMethod)).Sum(x => x.OrderTotal),
                    other = g.Where(x => !IsCash(x.PaymentMethod) && !IsCard(x.PaymentMethod)).Sum(x => x.OrderTotal)
                })
                .OrderBy(x => x.storeId)
                .ToList();

            var byRider = orders
                .Where(o => o.AcceptedByUserId.HasValue)
                .GroupBy(o => new
                {
                    Id = o.AcceptedByUserId.Value,
                    WorkerId = o.AcceptedByUser?.ThirdPartyEmployeeId ?? "",
                    Name = o.AcceptedByUser?.UserName ?? "",
                    Store = o.AcceptedByUser?.StoreId ?? o.Batch?.StoreId ?? ""
                })
                .Select(g =>
                {
                    var done = g.Where(x => x.Status == "Completed").ToList();
                    var sales = done.Sum(x => x.OrderTotal);
                    var payoutDue = payout.mode == "percent"
                        ? Math.Round(sales * payout.percent / 100m, 2)
                        : done.Count * payout.fixedFee;

                    var cashHeld = g.Where(x => IsCash(x.PaymentMethod) && x.Status != "Cancelled")
                        .Sum(x => (x.Cash ?? x.OrderTotal) - (x.CashCollected ?? 0));

                    return new RiderSettlementDto
                    {
                        riderId = g.Key.Id,
                        workerId = g.Key.WorkerId,
                        name = g.Key.Name,
                        storeId = g.Key.Store,
                        deliveryCount = done.Count,
                        cancelledCount = g.Count(x => x.Status == "Cancelled"),
                        cashHeld = cashHeld,
                        payoutDue = payoutDue,
                        salesTotal = sales
                    };
                })
                .OrderBy(x => x.workerId)
                .ToList();

            return new PaymentsDashboardDto
            {
                from = fromUtc,
                to = toUtc,
                storeId = storeId,
                orderCount = completed.Count,
                totalSales = completed.Sum(o => o.OrderTotal),
                cashTotal = cash,
                cardTotal = card,
                otherTotal = other,
                cashToCollect = cashToCollect,
                cashCollected = cashCollected,
                byDay = byDay,
                byStore = byStore,
                byRider = byRider
            };
        }

        private async Task<Dictionary<string, string>> StoreLookupAsync()
        {
            var stores = await _unitOfWork.StoreRepository.ListActiveAsync();
            return stores.ToDictionary(
                s => s.StoreId,
                s => string.IsNullOrWhiteSpace(s.Name) ? s.StoreId : s.Name,
                StringComparer.OrdinalIgnoreCase);
        }

        private static AdminRiderDto MapRider(AppUser u, Dictionary<string, string> stores)
        {
            string storeName = null;
            if (!string.IsNullOrWhiteSpace(u.StoreId))
                stores.TryGetValue(u.StoreId, out storeName);

            return new AdminRiderDto
            {
                userId = u.UserId,
                workerId = u.ThirdPartyEmployeeId,
                name = u.UserName,
                email = u.Email,
                phone = u.PhoneNumber,
                storeId = u.StoreId,
                storeName = storeName ?? u.StoreId,
                isActive = u.IsActive,
                isVerified = u.IsVerified,
                isOnline = u.LastSeenAt.HasValue && u.LastSeenAt.Value >= DateTime.UtcNow - OnlineWindow,
                lastSeenAt = u.LastSeenAt,
                createdAt = u.CreatedAt,
                roles = RolesOf(u)
            };
        }

        private static AdminOrderListDto MapOrderList(AssignedOrder o) => new()
        {
            id = o.Id,
            orderId = o.OrderId,
            orderNo = o.OrderNo,
            storeId = o.Batch?.StoreId,
            status = o.Status,
            firstName = o.FirstName,
            lastName = o.LastName,
            phone = o.Phone,
            city = o.City,
            street = o.Street,
            addressNo = o.AddressNo,
            orderTotal = o.OrderTotal,
            paymentMethod = o.PaymentMethod,
            cash = o.Cash,
            cashCollected = o.CashCollected,
            acceptedByUserId = o.AcceptedByUserId,
            acceptedByName = o.AcceptedByUser?.UserName,
            acceptedByWorkerId = o.AcceptedByUser?.ThirdPartyEmployeeId,
            createdAt = o.CreatedAt,
            acceptedAt = o.AcceptedAt,
            pickedUpAt = o.PickedUpAt,
            completedAt = o.CompletedAt,
            updatedAt = o.UpdatedAt
        };

        private static AdminOrderDetailDto MapOrderDetail(AssignedOrder o)
        {
            var dto = new AdminOrderDetailDto();
            var list = MapOrderList(o);
            dto.id = list.id;
            dto.orderId = list.orderId;
            dto.orderNo = list.orderNo;
            dto.storeId = list.storeId;
            dto.status = list.status;
            dto.firstName = list.firstName;
            dto.lastName = list.lastName;
            dto.phone = list.phone;
            dto.city = list.city;
            dto.street = list.street;
            dto.addressNo = list.addressNo;
            dto.orderTotal = list.orderTotal;
            dto.paymentMethod = list.paymentMethod;
            dto.cash = list.cash;
            dto.cashCollected = list.cashCollected;
            dto.acceptedByUserId = list.acceptedByUserId;
            dto.acceptedByName = list.acceptedByName;
            dto.acceptedByWorkerId = list.acceptedByWorkerId;
            dto.createdAt = list.createdAt;
            dto.acceptedAt = list.acceptedAt;
            dto.pickedUpAt = list.pickedUpAt;
            dto.completedAt = list.completedAt;
            dto.updatedAt = list.updatedAt;
            dto.orderTypeId = o.OrderTypeId;
            dto.orderState = o.OrderState;
            dto.comment = o.Comment;
            dto.postCode = o.PostCode;
            dto.secondaryAddress = o.SecondaryAddress;
            dto.lat = o.Lat;
            dto.lng = o.Lng;
            dto.orderTime = o.OrderTime;
            dto.batchTime = o.Batch?.Time;
            dto.items = (o.Items ?? Enumerable.Empty<AssignedOrderItem>())
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
                .ToList();
            return dto;
        }

        private static List<string> RolesOf(AppUser user) =>
            user.UserRoles?
                .Where(ur => ur.Role != null && ur.Role.IsActive)
                .Select(ur => ur.Role.RoleName)
                .Distinct()
                .ToList() ?? new List<string>();

        private static bool IsRider(AppUser user) =>
            RolesOf(user).Contains(RoleNames.Rider);

        private static bool CanSeeStore(AdminActor actor, string storeId)
        {
            if (actor.IsHeadOffice)
                return true;
            if (string.IsNullOrWhiteSpace(actor.StoreId))
                return false;
            return string.Equals(actor.StoreId, storeId, StringComparison.OrdinalIgnoreCase);
        }

        private static (bool denied, string storeId, string message) ScopeStore(AdminActor actor, string requested)
        {
            if (actor.IsHeadOffice)
                return (false, string.IsNullOrWhiteSpace(requested) ? null : requested.Trim(), null);

            if (string.IsNullOrWhiteSpace(actor.StoreId))
                return (true, null, "Store manager has no store assigned");

            if (!string.IsNullOrWhiteSpace(requested)
                && !string.Equals(requested.Trim(), actor.StoreId, StringComparison.OrdinalIgnoreCase))
                return (true, null, "You can only view your assigned store");

            return (false, actor.StoreId, null);
        }

        private static (DateTime? fromUtc, DateTime? toUtc) NormalizeRange(DateTime? from, DateTime? to, int? defaultDays = null)
        {
            DateTime? fromUtc = from.HasValue ? ToUtc(from.Value) : null;
            DateTime? toUtc = to.HasValue ? ToUtc(to.Value) : null;

            if (fromUtc == null && toUtc == null && defaultDays.HasValue)
            {
                var end = DateTime.UtcNow.Date.AddDays(1);
                return (end.AddDays(-defaultDays.Value), end);
            }

            if (toUtc.HasValue && toUtc.Value.TimeOfDay == TimeSpan.Zero)
                toUtc = toUtc.Value.AddDays(1);

            return (fromUtc, toUtc);
        }

        private static DateTime ToUtc(DateTime value)
            => value.Kind == DateTimeKind.Unspecified
                ? DateTime.SpecifyKind(value, DateTimeKind.Utc)
                : value.ToUniversalTime();

        private static bool IsCash(string method)
        {
            if (string.IsNullOrWhiteSpace(method))
                return false;
            var m = method.Trim().ToLowerInvariant();
            return m is "cash" or "cod" or "c";
        }

        private static bool IsCard(string method)
        {
            if (string.IsNullOrWhiteSpace(method))
                return false;
            var m = method.Trim().ToLowerInvariant();
            return m is "card" or "credit" or "debit" or "visa" or "mastercard";
        }

        private static byte[] ToCsv(List<string[]> rows)
        {
            var sb = new StringBuilder();
            sb.Append('\uFEFF');
            foreach (var row in rows)
            {
                sb.AppendLine(string.Join(",", row.Select(CsvEscape)));
            }
            return Encoding.UTF8.GetBytes(sb.ToString());
        }

        private static string CsvEscape(string value)
        {
            value ??= "";
            if (value.Contains('"') || value.Contains(',') || value.Contains('\n') || value.Contains('\r'))
                return "\"" + value.Replace("\"", "\"\"") + "\"";
            return value;
        }

        private static byte[] ToSpreadsheetMl(List<string[]> rows)
        {
            var sb = new StringBuilder();
            sb.AppendLine(@"<?xml version=""1.0""?>");
            sb.AppendLine(@"<?mso-application progid=""Excel.Sheet""?>");
            sb.AppendLine(@"<Workbook xmlns=""urn:schemas-microsoft-com:office:spreadsheet"" xmlns:ss=""urn:schemas-microsoft-com:office:spreadsheet"">");
            sb.AppendLine(@"<Worksheet ss:Name=""Settlements""><Table>");
            foreach (var row in rows)
            {
                sb.Append("<Row>");
                foreach (var cell in row)
                {
                    var escaped = System.Security.SecurityElement.Escape(cell ?? "") ?? "";
                    sb.Append($@"<Cell><Data ss:Type=""String"">{escaped}</Data></Cell>");
                }
                sb.AppendLine("</Row>");
            }
            sb.AppendLine("</Table></Worksheet></Workbook>");
            return Encoding.UTF8.GetBytes(sb.ToString());
        }

        private static ApiResponse<T> Ok<T>(T data, string message) => new(true, message, data);
        private static ApiResponse<T> Fail<T>(string message) => new(false, message, default);
    }
}
