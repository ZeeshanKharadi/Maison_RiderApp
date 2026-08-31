using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Rider.Application.DTOs.Admin;
using Rider.Application.Interfaces;
using Rider.Domain.Common;

namespace Rider.WebAPI.Controllers
{
    [ApiController]
    [Route("api/Admin/Orders")]
    [Authorize(Roles = RoleNames.AdminOrManager)]
    public class AdminOrdersController : ControllerBase
    {
        private readonly IAdminService _admin;

        public AdminOrdersController(IAdminService admin)
        {
            _admin = admin;
        }

        [HttpGet("summary")]
        public async Task<IActionResult> Summary([FromQuery] string storeId)
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null)
                return error;

            return Ok(await _admin.GetLiveSummaryAsync(actor, storeId));
        }

        [HttpGet]
        public async Task<IActionResult> List(
            [FromQuery] string storeId,
            [FromQuery] string status,
            [FromQuery] Guid? riderId,
            [FromQuery] DateTime? from,
            [FromQuery] DateTime? to)
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null)
                return error;

            var result = await _admin.ListOrdersAsync(actor, new AdminOrderQuery
            {
                storeId = storeId,
                status = status,
                riderId = riderId,
                from = from,
                to = to
            });
            return Ok(result);
        }

        [HttpGet("{id:long}")]
        public async Task<IActionResult> Get(long id)
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null)
                return error;

            var result = await _admin.GetOrderAsync(actor, id);
            if (!result.status)
                return NotFound(result);
            return Ok(result);
        }

        [HttpPost("{id:long}/cancel")]
        public async Task<IActionResult> Cancel(long id)
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null)
                return error;

            var result = await _admin.CancelOrderAsync(actor, id);
            if (!result.status)
                return BadRequest(result);
            return Ok(result);
        }

        [HttpPost("{id:long}/requeue")]
        public async Task<IActionResult> Requeue(long id)
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null)
                return error;

            var result = await _admin.RequeueOrderAsync(actor, id);
            if (!result.status)
                return BadRequest(result);
            return Ok(result);
        }

        [HttpPut("{id:long}/cash-collected")]
        public async Task<IActionResult> CashCollected(long id, [FromBody] CashCollectedRequest request)
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null)
                return error;

            var result = await _admin.SetCashCollectedAsync(actor, id, request?.cashCollected);
            if (!result.status)
                return BadRequest(result);
            return Ok(result);
        }
    }
}
