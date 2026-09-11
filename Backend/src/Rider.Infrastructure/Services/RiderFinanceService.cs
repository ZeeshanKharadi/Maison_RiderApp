using Microsoft.EntityFrameworkCore;
using Rider.Application.DTOs.Finance;
using Rider.Application.Interfaces;
using Rider.Application.Interfaces.Repositories;
using Rider.Domain.Common;
using Rider.Domain.Entities;

namespace Rider.Infrastructure.Services
{
    public class RiderFinanceService : IRiderFinanceService
    {
        private readonly IUnitOfWork _unitOfWork;

        public RiderFinanceService(IUnitOfWork unitOfWork)
        {
            _unitOfWork = unitOfWork;
        }

        public async Task<ApiResponse<RiderFinanceSummaryDto>> GetSummaryAsync(
            Guid riderUserId, DateTime? fromUtc, DateTime? toUtc)
        {
            var summary = await BuildSummaryAsync(riderUserId, fromUtc, toUtc);
            return new ApiResponse<RiderFinanceSummaryDto>(true, "Finance summary", summary);
        }

        public async Task<ApiResponse<RiderFinancePageDto>> GetPageAsync(
            Guid riderUserId, DateTime? fromUtc, DateTime? toUtc, int page, int pageSize)
        {
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 100) pageSize = 20;

            var summary = await BuildSummaryAsync(riderUserId, fromUtc, toUtc);
            var txs = await BuildTransactionsAsync(riderUserId, fromUtc, toUtc);
            var total = txs.Count;
            var slice = txs.Skip((page - 1) * pageSize).Take(pageSize).ToList();

            return new ApiResponse<RiderFinancePageDto>(true, "Finance page", new RiderFinancePageDto
            {
                summary = summary,
                transactions = slice,
                page = page,
                pageSize = pageSize,
                totalTransactions = total
            });
        }

        private async Task<RiderFinanceSummaryDto> BuildSummaryAsync(
            Guid riderUserId, DateTime? fromUtc, DateTime? toUtc)
        {
            var orders = await QueryRiderOrdersAsync(riderUserId, fromUtc, toUtc);
            var definitive = orders
                .Where(o => o.Status == OrderStatuses.Completed)
                .Where(o => !IsLegacyAmbiguous(o))
                .ToList();
            var cashOrders = definitive.Where(IsCashOrder).ToList();

            var collected = cashOrders.Where(o => o.CashCollected.HasValue).Sum(o => o.CashCollected!.Value);
            var handed = cashOrders.Sum(o => o.CashHandedOverAmount ?? 0);
            var held = cashOrders
                .Where(o => o.CashCollected.HasValue)
                .Sum(o => Math.Max(0, o.CashCollected!.Value - (o.CashHandedOverAmount ?? 0)));
            var shortage = cashOrders
                .Where(o => o.CashCollected.HasValue && o.ExpectedCash.HasValue)
                .Sum(o => Math.Max(0, o.ExpectedCash!.Value - o.CashCollected!.Value));

            var legacyCount = orders.Count(IsLegacyAmbiguous);
            var (comp, available, note, mode) = await LoadCompensationAsync(definitive);

            return new RiderFinanceSummaryDto
            {
                cashCollectedTotal = collected,
                cashHandedOverTotal = handed,
                cashHeld = held,
                codShortageTotal = shortage,
                completedCashOrders = cashOrders.Count,
                legacyAmbiguousCount = legacyCount,
                calculatedCompensation = available ? comp : null,
                compensationAvailable = available,
                compensationNote = note,
                payoutMode = mode,
                from = fromUtc,
                to = toUtc,
                isPeriodFilter = fromUtc.HasValue || toUtc.HasValue,
                asOfUtc = DateTime.UtcNow
            };
        }

        private async Task<List<RiderFinanceTransactionDto>> BuildTransactionsAsync(
            Guid riderUserId, DateTime? fromUtc, DateTime? toUtc)
        {
            var orders = await QueryRiderOrdersAsync(riderUserId, fromUtc, toUtc);
            var list = new List<RiderFinanceTransactionDto>();

            foreach (var o in orders.Where(o => o.Status == OrderStatuses.Completed).OrderByDescending(o => o.CompletedAt ?? o.UpdatedAt))
            {
                if (IsLegacyAmbiguous(o))
                {
                    list.Add(new RiderFinanceTransactionDto
                    {
                        assignedOrderId = o.Id,
                        orderId = o.OrderId,
                        orderNo = o.OrderNo ?? o.OrderId,
                        type = "legacy_ambiguous",
                        amount = o.CashCollected ?? 0,
                        note = "Excluded from definitive cash-held until reconciled",
                        at = o.CompletedAt ?? o.UpdatedAt ?? o.CreatedAt,
                        status = o.Status
                    });
                    continue;
                }

                if (o.CashCollected.HasValue)
                {
                    list.Add(new RiderFinanceTransactionDto
                    {
                        assignedOrderId = o.Id,
                        orderId = o.OrderId,
                        orderNo = o.OrderNo ?? o.OrderId,
                        type = "cash_collected",
                        amount = o.CashCollected.Value,
                        note = o.CashCollectedReason,
                        at = o.CompletedAt ?? o.UpdatedAt ?? o.CreatedAt,
                        status = o.Status
                    });
                }

                if (o.CashHandedOverAmount is > 0)
                {
                    list.Add(new RiderFinanceTransactionDto
                    {
                        assignedOrderId = o.Id,
                        orderId = o.OrderId,
                        orderNo = o.OrderNo ?? o.OrderId,
                        type = "cash_handover",
                        amount = o.CashHandedOverAmount.Value,
                        note = "Confirmed store handover",
                        at = o.CashHandedOverAt ?? o.UpdatedAt ?? o.CreatedAt,
                        status = o.Status
                    });
                }
            }

            return list.OrderByDescending(t => t.at).ToList();
        }

        private async Task<List<AssignedOrder>> QueryRiderOrdersAsync(
            Guid riderUserId, DateTime? fromUtc, DateTime? toUtc)
        {
            var q = _unitOfWork.Context.Set<AssignedOrder>()
                .AsNoTracking()
                .Where(o => o.AcceptedByUserId == riderUserId);

            if (fromUtc.HasValue)
                q = q.Where(o => (o.CompletedAt ?? o.CreatedAt) >= fromUtc.Value);
            if (toUtc.HasValue)
                q = q.Where(o => (o.CompletedAt ?? o.CreatedAt) < toUtc.Value);

            return await q.ToListAsync();
        }

        private async Task<(decimal amount, bool available, string note, string mode)> LoadCompensationAsync(
            List<AssignedOrder> completed)
        {
            var mode = await _unitOfWork.AppSettingRepository.GetValueAsync("PayoutMode", "");
            var feeRaw = await _unitOfWork.AppSettingRepository.GetValueAsync("PayoutFixedFee", "");
            var pctRaw = await _unitOfWork.AppSettingRepository.GetValueAsync("PayoutPercent", "");

            if (string.IsNullOrWhiteSpace(mode))
                return (0, false, "Compensation settings are unresolved.", mode ?? "");

            if (!decimal.TryParse(feeRaw, out var fee) || !decimal.TryParse(pctRaw, out var pct))
            {
                return (0, false, "Compensation settings are unresolved.", mode);
            }

            if (mode.Equals("percent", StringComparison.OrdinalIgnoreCase))
            {
                var sales = completed.Sum(o => o.OrderTotal);
                var amount = Math.Round(sales * pct / 100m, 2, MidpointRounding.AwayFromZero);
                return (amount, true,
                    "Calculated estimate from payout percent × completed sales. Not paid and not withdrawable.",
                    "percent");
            }

            if (mode.Equals("fixed", StringComparison.OrdinalIgnoreCase))
            {
                var amount = completed.Count * fee;
                return (amount, true,
                    "Calculated estimate from fixed fee × completed deliveries. Not paid and not withdrawable.",
                    "fixed");
            }

            return (0, false, "Compensation mode is unresolved.", mode);
        }

        private static bool IsCashOrder(AssignedOrder o)
        {
            if (o.ExpectedCash > 0) return true;
            if (string.IsNullOrWhiteSpace(o.PaymentMethod)) return false;
            var m = o.PaymentMethod.Trim().ToLowerInvariant();
            return m is "cash" or "cod" or "c";
        }

        private static bool IsLegacyAmbiguous(AssignedOrder o)
            => string.Equals(o.CashSemanticsNote, CashSemantics.LegacyAmbiguous, StringComparison.OrdinalIgnoreCase);
    }
}
