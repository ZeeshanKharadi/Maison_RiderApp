using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Rider.Application.Authorization;
using Rider.Domain.Common;

namespace Rider.WebAPI.Hubs
{
    /// <summary>
    /// Admin/Manager operations hub. Riders must not connect.
    /// HO (Administrator) joins <see cref="HofficeGroup"/> for all-store events.
    /// Managers join only their authorized store group(s).
    /// </summary>
    [Authorize(Roles = RoleNames.AdminOrManager)]
    public class AdminOpsHub : Hub
    {
        public const string HofficeGroup = "hoffice";

        public static string StoreGroup(string storeId) => $"store:{storeId}";

        public override async Task OnConnectedAsync()
        {
            if (AdminOpsHubAccess.IsHeadOffice(Context.User))
                await Groups.AddToGroupAsync(Context.ConnectionId, HofficeGroup);

            // Managers (and HO users with a store claim) join their own store group.
            var storeId = AdminOpsHubAccess.GetClaimStoreId(Context.User);
            if (!string.IsNullOrWhiteSpace(storeId)
                && AdminOpsHubAccess.CanJoinStore(Context.User, storeId))
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, StoreGroup(storeId));
            }

            await base.OnConnectedAsync();
        }

        public async Task JoinStore(string storeId)
        {
            if (string.IsNullOrWhiteSpace(storeId))
                return;

            storeId = storeId.Trim();
            if (!AdminOpsHubAccess.CanJoinStore(Context.User, storeId))
                throw new HubException("Not authorized for this store");

            await Groups.AddToGroupAsync(Context.ConnectionId, StoreGroup(storeId));
        }

        public async Task LeaveStore(string storeId)
        {
            if (string.IsNullOrWhiteSpace(storeId))
                return;

            storeId = storeId.Trim();
            if (!AdminOpsHubAccess.CanJoinStore(Context.User, storeId))
                throw new HubException("Not authorized for this store");

            await Groups.RemoveFromGroupAsync(Context.ConnectionId, StoreGroup(storeId));
        }
    }
}
