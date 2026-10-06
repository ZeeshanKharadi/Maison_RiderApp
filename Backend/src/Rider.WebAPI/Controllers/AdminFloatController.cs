using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Rider.Application.DTOs.Float;
using Rider.Application.Interfaces;
using Rider.Domain.Common;

namespace Rider.WebAPI.Controllers
{
    [ApiController]
    [Route("api/Admin/Float")]
    [Authorize(Roles = RoleNames.AdminOrManager)]
    public class AdminFloatController : ControllerBase
    {
        private readonly IAdminService _admin;
        private readonly IRiderFloatService _float;

        public AdminFloatController(IAdminService admin, IRiderFloatService floatService)
        {
            _admin = admin;
            _float = floatService;
        }

        [HttpGet("pending")]
        public async Task<IActionResult> Pending([FromQuery] string? storeId = null)
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null) return error;
            return Ok(await _float.GetPendingAcknowledgmentsAsync(actor, storeId));
        }

        [HttpGet("history")]
        public async Task<IActionResult> History(
            [FromQuery] string? storeId = null,
            [FromQuery] Guid? riderId = null,
            [FromQuery] int take = 50)
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null) return error;
            return Ok(await _float.GetHistoryAsync(actor, storeId, riderId, take));
        }

        [HttpGet("{riderId:guid}/summary")]
        public async Task<IActionResult> Summary(Guid riderId)
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null) return error;
            return Ok(await _float.GetSummaryAsync(actor, riderId));
        }

        [HttpPost("issue")]
        public async Task<IActionResult> Issue([FromBody] FloatMutationRequest request)
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null) return error;
            return Ok(await _float.IssueAsync(actor, request));
        }

        [HttpPost("return")]
        public async Task<IActionResult> Return([FromBody] FloatMutationRequest request)
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null) return error;
            return Ok(await _float.RecordReturnAsync(actor, request));
        }
    }
}
