using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Rider.Application.DTOs.Admin;
using Rider.Application.Interfaces;
using Rider.Domain.Common;

namespace Rider.WebAPI.Controllers
{
    [ApiController]
    [Route("api/Admin/Riders")]
    [Authorize(Roles = RoleNames.AdminOrManager)]
    public class AdminRidersController : ControllerBase
    {
        private readonly IAdminService _admin;
        private readonly ILogger<AdminRidersController> _logger;

        public AdminRidersController(IAdminService admin, ILogger<AdminRidersController> logger)
        {
            _admin = admin;
            _logger = logger;
        }

        [HttpGet]
        public async Task<IActionResult> List([FromQuery] string storeId)
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null)
                return error;

            var result = await _admin.ListRidersAsync(actor, storeId);
            return Ok(result);
        }

        [HttpGet("{id:guid}")]
        public async Task<IActionResult> Get(Guid id)
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null)
                return error;

            var result = await _admin.GetRiderAsync(actor, id);
            if (!result.status)
                return NotFound(result);
            return Ok(result);
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CreateRiderRequest request)
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null)
                return error;

            try
            {
                var result = await _admin.CreateRiderAsync(actor, request);
                if (!result.status)
                    return BadRequest(result);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Create rider failed");
                return BadRequest(new ApiResponse<string>(false, ex.Message, null));
            }
        }

        [HttpPut("{id:guid}")]
        public async Task<IActionResult> Update(Guid id, [FromBody] UpdateRiderRequest request)
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null)
                return error;

            var result = await _admin.UpdateRiderAsync(actor, id, request);
            if (!result.status)
                return BadRequest(result);
            return Ok(result);
        }

        [HttpPost("{id:guid}/reset-password")]
        public async Task<IActionResult> ResetPassword(Guid id, [FromBody] ResetRiderPasswordRequest request)
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null)
                return error;

            var result = await _admin.ResetRiderPasswordAsync(actor, id, request);
            if (!result.status)
                return BadRequest(result);
            return Ok(result);
        }

        [HttpPost("{id:guid}/activate")]
        public async Task<IActionResult> Activate(Guid id)
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null)
                return error;

            var result = await _admin.SetRiderActiveAsync(actor, id, true);
            if (!result.status)
                return BadRequest(result);
            return Ok(result);
        }

        [HttpPost("{id:guid}/deactivate")]
        public async Task<IActionResult> Deactivate(Guid id)
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null)
                return error;

            var result = await _admin.SetRiderActiveAsync(actor, id, false);
            if (!result.status)
                return BadRequest(result);
            return Ok(result);
        }
    }
}
