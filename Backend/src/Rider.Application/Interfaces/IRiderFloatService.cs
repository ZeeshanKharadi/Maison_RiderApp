using Rider.Application.DTOs.Admin;
using Rider.Application.DTOs.Float;
using Rider.Domain.Common;

namespace Rider.Application.Interfaces
{
    public interface IRiderFloatService
    {
        Task<ApiResponse<FloatSummaryDto>> GetSummaryForRiderAsync(Guid riderUserId);
        Task<ApiResponse<FloatLedgerEntryDto>> AcknowledgeAsync(Guid riderUserId, FloatAcknowledgeRequest request);

        Task<ApiResponse<FloatSummaryDto>> GetSummaryAsync(AdminActor actor, Guid riderUserId);
        Task<ApiResponse<List<FloatLedgerEntryDto>>> GetPendingAcknowledgmentsAsync(AdminActor actor, string? storeId);
        Task<ApiResponse<FloatLedgerEntryDto>> IssueAsync(AdminActor actor, FloatMutationRequest request);
        Task<ApiResponse<FloatLedgerEntryDto>> RecordReturnAsync(AdminActor actor, FloatMutationRequest request);

        Task<decimal> GetOutstandingFloatAsync(Guid riderUserId);
    }
}
