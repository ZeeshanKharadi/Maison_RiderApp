using Rider.Application.DTOs.Admin;
using Rider.Domain.Common;

namespace Rider.Application.Interfaces
{
    public interface IAdminService
    {
        Task<AdminActor> ResolveActorAsync(string userId);

        Task<ApiResponse<List<AdminRiderDto>>> ListRidersAsync(AdminActor actor, string storeId);
        Task<ApiResponse<List<AdminLiveRiderDto>>> ListLiveMapRidersAsync(AdminActor actor, string storeId);
        Task<ApiResponse<AdminRiderDto>> GetRiderAsync(AdminActor actor, Guid riderId);
        Task<ApiResponse<AdminRiderDto>> CreateRiderAsync(AdminActor actor, CreateRiderRequest request);
        Task<ApiResponse<AdminRiderDto>> UpdateRiderAsync(AdminActor actor, Guid riderId, UpdateRiderRequest request);
        Task<ApiResponse<string>> ResetRiderPasswordAsync(AdminActor actor, Guid riderId, ResetRiderPasswordRequest request);
        Task<ApiResponse<string>> SetRiderActiveAsync(AdminActor actor, Guid riderId, bool isActive);

        Task<ApiResponse<LiveBoardSummaryDto>> GetLiveSummaryAsync(AdminActor actor, string storeId);
        Task<ApiResponse<List<AdminOrderListDto>>> ListOrdersAsync(AdminActor actor, AdminOrderQuery query);
        Task<ApiResponse<List<AdminOrderRejectionDto>>> ListOrderRejectionsAsync(AdminActor actor, string storeId, DateTime? from, DateTime? to);
        Task<ApiResponse<List<AdminDeliveryIssueReportDto>>> ListDeliveryIssueReportsAsync(
            AdminActor actor, string storeId, DateTime? from, DateTime? to,
            string status = null, string q = null, bool includeClosed = false);
        Task<ApiResponse<AdminDeliveryIssueReportDto>> GetDeliveryIssueReportAsync(AdminActor actor, long id);
        Task<ApiResponse<AdminDeliveryIssueReportDto>> AcknowledgeDeliveryIssueAsync(
            AdminActor actor, long id, DeliveryIssueTriageRequest request);
        Task<ApiResponse<AdminDeliveryIssueReportDto>> UpdateDeliveryIssueNoteAsync(
            AdminActor actor, long id, DeliveryIssueTriageRequest request);
        Task<ApiResponse<AdminDeliveryIssueReportDto>> CloseDeliveryIssueAsync(
            AdminActor actor, long id, DeliveryIssueTriageRequest request);
        Task<ApiResponse<AdminOrderDetailDto>> GetOrderAsync(AdminActor actor, long id);
        Task<ApiResponse<AdminOrderDetailDto>> CancelOrderAsync(AdminActor actor, long id, string reason);
        Task<ApiResponse<AdminOrderDetailDto>> RequeueOrderAsync(AdminActor actor, long id);
        Task<ApiResponse<AdminOrderDetailDto>> RejectFailureRequestAsync(
            AdminActor actor, long id, FailureDecisionRequest request);
        Task<ApiResponse<AdminOrderDetailDto>> ApproveFailureReturnAsync(
            AdminActor actor, long id, FailureDecisionRequest request);
        Task<ApiResponse<AdminOrderDetailDto>> ConfirmStoreReceiptAsync(
            AdminActor actor, long id, FailureDecisionRequest request);
        Task<ApiResponse<AdminOrderDetailDto>> SetCashCollectedAsync(AdminActor actor, long id, decimal? cashCollected);
        Task<ApiResponse<AdminOrderDetailDto>> ConfirmCashHandoverAsync(AdminActor actor, long id, CashHandoverRequest request);
        Task<ApiResponse<List<AdminNotificationDto>>> ListAdminNotificationsAsync(AdminActor actor, string storeId, int take);
        Task<ApiResponse<bool>> MarkAdminNotificationReadAsync(AdminActor actor, long id);

        Task<ApiResponse<PaymentsDashboardDto>> GetPaymentsAsync(AdminActor actor, DateTime? from, DateTime? to, string storeId, Guid? riderId);
        Task<ApiResponse<byte[]>> ExportPaymentsAsync(AdminActor actor, DateTime? from, DateTime? to, string storeId, Guid? riderId, string format);

        Task<ApiResponse<ReportsDto>> GetReportsAsync(AdminActor actor, DateTime? from, DateTime? to, string storeId, Guid? riderId);

        Task<ApiResponse<List<StoreDto>>> ListStoresAsync(AdminActor actor);
        Task<ApiResponse<PayoutSettingsDto>> GetPayoutSettingsAsync(AdminActor actor);
        Task<ApiResponse<PayoutSettingsDto>> UpdatePayoutSettingsAsync(AdminActor actor, PayoutSettingsDto request);
    }
}
