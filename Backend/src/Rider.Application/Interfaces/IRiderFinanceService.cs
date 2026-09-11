using Rider.Application.DTOs.Finance;
using Rider.Domain.Common;

namespace Rider.Application.Interfaces
{
    public interface IRiderFinanceService
    {
        Task<ApiResponse<RiderFinanceSummaryDto>> GetSummaryAsync(
            Guid riderUserId, DateTime? fromUtc, DateTime? toUtc);

        Task<ApiResponse<RiderFinancePageDto>> GetPageAsync(
            Guid riderUserId, DateTime? fromUtc, DateTime? toUtc, int page, int pageSize);
    }
}
