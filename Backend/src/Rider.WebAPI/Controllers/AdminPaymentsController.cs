using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Rider.Application.Interfaces;
using Rider.Domain.Common;

namespace Rider.WebAPI.Controllers
{
    [ApiController]
    [Route("api/Admin/Payments")]
    [Authorize(Roles = RoleNames.AdminOrManager)]
    public class AdminPaymentsController : ControllerBase
    {
        private readonly IAdminService _admin;

        public AdminPaymentsController(IAdminService admin)
        {
            _admin = admin;
        }

        [HttpGet]
        public async Task<IActionResult> Dashboard(
            [FromQuery] DateTime? from,
            [FromQuery] DateTime? to,
            [FromQuery] string storeId,
            [FromQuery] Guid? riderId)
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null)
                return error;

            return Ok(await _admin.GetPaymentsAsync(actor, from, to, storeId, riderId));
        }

        [HttpGet("export")]
        public async Task<IActionResult> Export(
            [FromQuery] DateTime? from,
            [FromQuery] DateTime? to,
            [FromQuery] string storeId,
            [FromQuery] Guid? riderId,
            [FromQuery] string format = "csv")
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null)
                return error;

            var result = await _admin.ExportPaymentsAsync(actor, from, to, storeId, riderId, format);
            if (!result.status || result.Data == null)
                return BadRequest(result);

            var excel = string.Equals(format, "xlsx", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(format, "xls", StringComparison.OrdinalIgnoreCase);
            var contentType = excel
                ? "application/vnd.ms-excel"
                : "text/csv";
            var fileName = excel
                ? $"rider-settlements-{DateTime.UtcNow:yyyyMMdd}.xls"
                : $"rider-settlements-{DateTime.UtcNow:yyyyMMdd}.csv";

            return File(result.Data, contentType, fileName);
        }
    }
}
