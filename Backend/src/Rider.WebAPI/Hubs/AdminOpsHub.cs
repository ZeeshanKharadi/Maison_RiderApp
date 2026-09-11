using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Rider.WebAPI.Hubs
{
    [Authorize]
    public class AdminOpsHub : Hub
    {
        public const string HofficeGroup = "hoffice";

        public static string StoreGroup(string storeId) => $"store:{storeId}";

        public override async Task OnConnectedAsync()
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, HofficeGroup);

            var storeId = Context.User?.FindFirst("storeId")?.Value
                ?? Context.User?.FindFirst("StoreId")?.Value;
            if (!string.IsNullOrWhiteSpace(storeId))
                await Groups.AddToGroupAsync(Context.ConnectionId, StoreGroup(storeId));

            await base.OnConnectedAsync();
        }

        public Task JoinStore(string storeId)
        {
            if (string.IsNullOrWhiteSpace(storeId))
                return Task.CompletedTask;
            return Groups.AddToGroupAsync(Context.ConnectionId, StoreGroup(storeId.Trim()));
        }
    }
}
