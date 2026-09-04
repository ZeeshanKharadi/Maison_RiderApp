using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Rider.Application.DTOs.Notifications;
using Rider.Application.Interfaces;
using Rider.Domain.Common;

namespace Rider.WebAPI.Controllers
{
    /// <summary>
    /// Admin/Swagger test endpoints to push notifications to one rider or broadcast.
    /// </summary>
    [ApiController]
    [Route("api/Admin/Notifications")]
    [Authorize]
    public class AdminNotificationsController : ControllerBase
    {
        private readonly IAdminService _admin;
        private readonly IRiderNotificationService _notifications;

        public AdminNotificationsController(
            IAdminService admin,
            IRiderNotificationService notifications)
        {
            _admin = admin;
            _notifications = notifications;
        }

        /// <summary>Send inbox + FCM push to a single user (by userId GUID).</summary>
        [HttpPost("send")]
        public async Task<IActionResult> SendToUser([FromBody] SendNotificationRequest request)
        {
            var (error, _) = await this.ResolveAdminActorAsync(_admin);
            if (error != null)
                return error;

            var result = await _notifications.SendTestToUserAsync(request);
            if (!result.status)
                return BadRequest(result);
            return Ok(result);
        }

        /// <summary>
        /// Broadcast inbox + FCM to active riders.
        /// Optional storeId filters by store; omit/empty = all active riders.
        /// </summary>
        [HttpPost("broadcast")]
        public async Task<IActionResult> Broadcast([FromBody] BroadcastNotificationRequest request)
        {
            //var (error, _) = await this.ResolveAdminActorAsync(_admin);
            //if (error != null)
            //    return error;

            var result = await _notifications.BroadcastTestAsync(request ?? new BroadcastNotificationRequest());
            if (!result.status)
                return BadRequest(result);
            return Ok(result);
        }
    }
}
