using Rider.Application.DTOs.Admin;
using Rider.Domain.Common;

namespace Rider.Application.Interfaces
{
    public interface IAdminService
    {
        Task<AdminActor> ResolveActorAsync(string userId);

        Task<ApiResponse<List<AdminRiderDto>>> ListRidersAsync(AdminActor actor, string storeId);
        Task<ApiResponse<AdminRiderDto>> GetRiderAsync(AdminActor actor, Guid riderId);
        Task<ApiResponse<AdminRiderDto>> CreateRiderAsync(AdminActor actor, CreateRiderRequest request);
        Task<ApiResponse<AdminRiderDto>> UpdateRiderAsync(AdminActor actor, Guid riderId, UpdateRiderRequest request);
        Task<ApiResponse<string>> ResetRiderPasswordAsync(AdminActor actor, Guid riderId, ResetRiderPasswordRequest request);
        Task<ApiResponse<string>> SetRiderActiveAsync(AdminActor actor, Guid riderId, bool isActive);

        Task<ApiResponse<LiveBoardSummaryDto>> GetLiveSummaryAsync(AdminActor actor, string storeId);
        Task<ApiResponse<List<AdminOrderListDto>>> ListOrdersAsync(AdminActor actor, AdminOrderQuery query);
        Task<ApiResponse<AdminOrderDetailDto>> GetOrderAsync(AdminActor actor, long id);
        Task<ApiResponse<AdminOrderDetailDto>> CancelOrderAsync(AdminActor actor, long id);
        Task<ApiResponse<AdminOrderDetailDto>> RequeueOrderAsync(AdminActor actor, long id);
        Task<ApiResponse<AdminOrderDetailDto>> SetCashCollectedAsync(AdminActor actor, long id, decimal? cashCollected);

        Task<ApiResponse<PaymentsDashboardDto>> GetPaymentsAsync(AdminActor actor, DateTime? from, DateTime? to, string storeId, Guid? riderId);
        Task<ApiResponse<byte[]>> ExportPaymentsAsync(AdminActor actor, DateTime? from, DateTime? to, string storeId, Guid? riderId, string format);

        Task<ApiResponse<ReportsDto>> GetReportsAsync(AdminActor actor, DateTime? from, DateTime? to, string storeId, Guid? riderId);

        Task<ApiResponse<List<StoreDto>>> ListStoresAsync(AdminActor actor);
        Task<ApiResponse<PayoutSettingsDto>> GetPayoutSettingsAsync(AdminActor actor);
        Task<ApiResponse<PayoutSettingsDto>> UpdatePayoutSettingsAsync(AdminActor actor, PayoutSettingsDto request);
    }
}
