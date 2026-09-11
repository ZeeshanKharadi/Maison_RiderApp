using Rider.Domain.Common;

namespace Rider.Application.DTOs.Finance
{
    public class RiderFinanceSummaryDto
    {
        public decimal cashCollectedTotal { get; set; }
        public decimal cashHandedOverTotal { get; set; }
        /// <summary>Actual collections minus confirmed handovers. Excludes expected-but-uncollected and legacy-ambiguous rows.</summary>
        public decimal cashHeld { get; set; }
        public decimal codShortageTotal { get; set; }
        public int completedCashOrders { get; set; }
        public int legacyAmbiguousCount { get; set; }
        /// <summary>Calculated compensation from payout settings — not paid/withdrawable.</summary>
        public decimal? calculatedCompensation { get; set; }
        public bool compensationAvailable { get; set; }
        public string? compensationNote { get; set; }
        public string payoutMode { get; set; }
        public DateTime? from { get; set; }
        public DateTime? to { get; set; }
        public bool isPeriodFilter { get; set; }
        public DateTime asOfUtc { get; set; }
    }

    public class RiderFinanceTransactionDto
    {
        public long assignedOrderId { get; set; }
        public string orderId { get; set; }
        public string orderNo { get; set; }
        public string type { get; set; }
        public decimal amount { get; set; }
        public string? note { get; set; }
        public DateTime at { get; set; }
        public string status { get; set; }
    }

    public class RiderFinancePageDto
    {
        public RiderFinanceSummaryDto summary { get; set; }
        public List<RiderFinanceTransactionDto> transactions { get; set; } = new();
        public int page { get; set; }
        public int pageSize { get; set; }
        public int totalTransactions { get; set; }
    }
}
