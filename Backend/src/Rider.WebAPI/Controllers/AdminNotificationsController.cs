using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Rider.Application.DTOs.Notifications;
using Rider.Application.Interfaces;
using Rider.Domain.Common;

namespace Rider.WebAPI.Controllers
{
    /// <summary>
    /// Admin inbox (AdminNotification entity) plus FCM test helpers.
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

        [HttpGet]
        [Authorize(Roles = RoleNames.AdminOrManager)]
        public async Task<IActionResult> List([FromQuery] string storeId, [FromQuery] int take = 50)
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null)
                return error;

            return Ok(await _admin.ListAdminNotificationsAsync(actor, storeId, take));
        }

        [HttpPost("{id:long}/read")]
        [Authorize(Roles = RoleNames.AdminOrManager)]
        public async Task<IActionResult> MarkRead(long id)
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null)
                return error;

            var result = await _admin.MarkAdminNotificationReadAsync(actor, id);
            if (!result.status)
                return NotFound(result);
            return Ok(result);
        }

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

        [HttpPost("broadcast")]
        public async Task<IActionResult> Broadcast([FromBody] BroadcastNotificationRequest request)
        {
            var result = await _notifications.BroadcastTestAsync(request ?? new BroadcastNotificationRequest());
            if (!result.status)
                return BadRequest(result);
            return Ok(result);
        }
    }
}
