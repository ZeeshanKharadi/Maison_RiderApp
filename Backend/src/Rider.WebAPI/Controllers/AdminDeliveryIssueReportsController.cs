using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Rider.Application.DTOs.Admin;
using Rider.Application.Interfaces;
using Rider.Domain.Common;

namespace Rider.WebAPI.Controllers
{
    [ApiController]
    [Route("api/Admin/DeliveryIssueReports")]
    [Authorize(Roles = RoleNames.AdminOrManager)]
    public class AdminDeliveryIssueReportsController : ControllerBase
    {
        private readonly IAdminService _admin;

        public AdminDeliveryIssueReportsController(IAdminService admin)
        {
            _admin = admin;
        }

        [HttpGet]
        public async Task<IActionResult> List(
            [FromQuery] string storeId,
            [FromQuery] DateTime? from,
            [FromQuery] DateTime? to,
            [FromQuery] string status,
            [FromQuery] string q,
            [FromQuery] bool includeClosed = false)
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null)
                return error;

            return Ok(await _admin.ListDeliveryIssueReportsAsync(
                actor, storeId, from, to, status, q, includeClosed));
        }

        [HttpGet("{id:long}")]
        public async Task<IActionResult> Get(long id)
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null)
                return error;

            var result = await _admin.GetDeliveryIssueReportAsync(actor, id);
            if (!result.status)
                return BadRequest(result);
            return Ok(result);
        }

        [HttpPost("{id:long}/acknowledge")]
        public async Task<IActionResult> Acknowledge(long id, [FromBody] DeliveryIssueTriageRequest request)
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null)
                return error;

            var result = await _admin.AcknowledgeDeliveryIssueAsync(actor, id, request ?? new DeliveryIssueTriageRequest());
            if (!result.status)
                return BadRequest(result);
            return Ok(result);
        }

        [HttpPost("{id:long}/note")]
        public async Task<IActionResult> UpdateNote(long id, [FromBody] DeliveryIssueTriageRequest request)
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null)
                return error;

            var result = await _admin.UpdateDeliveryIssueNoteAsync(actor, id, request ?? new DeliveryIssueTriageRequest());
            if (!result.status)
                return BadRequest(result);
            return Ok(result);
        }

        [HttpPost("{id:long}/close")]
        public async Task<IActionResult> Close(long id, [FromBody] DeliveryIssueTriageRequest request)
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null)
                return error;

            var result = await _admin.CloseDeliveryIssueAsync(actor, id, request ?? new DeliveryIssueTriageRequest());
            if (!result.status)
                return BadRequest(result);
            return Ok(result);
        }
    }
}
