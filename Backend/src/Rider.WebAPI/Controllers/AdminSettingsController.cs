using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Rider.Application.DTOs.Admin;
using Rider.Application.Interfaces;
using Rider.Domain.Common;

namespace Rider.WebAPI.Controllers
{
    [ApiController]
    [Route("api/Admin")]
    [Authorize(Roles = RoleNames.AdminOrManager)]
    public class AdminSettingsController : ControllerBase
    {
        private readonly IAdminService _admin;

        public AdminSettingsController(IAdminService admin)
        {
            _admin = admin;
        }

        [HttpGet("Stores")]
        public async Task<IActionResult> Stores()
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null)
                return error;

            return Ok(await _admin.ListStoresAsync(actor));
        }

        [HttpGet("Settings/payout")]
        public async Task<IActionResult> GetPayout()
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null)
                return error;

            return Ok(await _admin.GetPayoutSettingsAsync(actor));
        }

        [HttpPut("Settings/payout")]
        [Authorize(Roles = RoleNames.Administrator)]
        public async Task<IActionResult> UpdatePayout([FromBody] PayoutSettingsDto request)
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null)
                return error;

            var result = await _admin.UpdatePayoutSettingsAsync(actor, request);
            if (!result.status)
                return BadRequest(result);
            return Ok(result);
        }
    }
}
