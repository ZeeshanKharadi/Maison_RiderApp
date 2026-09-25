using System.Security.Claims;
using Rider.Domain.Common;

namespace Rider.Application.Authorization
{
    /// <summary>Pure authorization helpers for the admin operations SignalR hub.</summary>
    public static class AdminOpsHubAccess
    {
        public static bool IsHeadOffice(ClaimsPrincipal? user)
            => user?.IsInRole(RoleNames.Administrator) == true;

        public static bool IsManager(ClaimsPrincipal? user)
            => user?.IsInRole(RoleNames.Manager) == true;

        public static bool CanConnect(ClaimsPrincipal? user)
            => IsHeadOffice(user) || IsManager(user);

        public static string? GetClaimStoreId(ClaimsPrincipal? user)
        {
            if (user == null) return null;
            var storeId = user.FindFirst("storeId")?.Value
                ?? user.FindFirst("StoreId")?.Value;
            return string.IsNullOrWhiteSpace(storeId) ? null : storeId.Trim();
        }

        /// <summary>
        /// Administrators may join any store group.
        /// Managers may join only their JWT storeId.
        /// </summary>
        public static bool CanJoinStore(ClaimsPrincipal? user, string storeId)
        {
            if (user == null || string.IsNullOrWhiteSpace(storeId))
                return false;

            if (IsHeadOffice(user))
                return true;

            if (!IsManager(user))
                return false;

            var claimStore = GetClaimStoreId(user);
            return !string.IsNullOrWhiteSpace(claimStore)
                && string.Equals(claimStore, storeId.Trim(), StringComparison.OrdinalIgnoreCase);
        }
    }
}
