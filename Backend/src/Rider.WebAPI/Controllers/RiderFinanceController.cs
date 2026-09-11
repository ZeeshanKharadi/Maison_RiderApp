using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Rider.Application.Interfaces;
using Rider.Domain.Common;

namespace Rider.WebAPI.Controllers
{
    [ApiController]
    [Route("api/Order/Finance")]
    [Authorize]
    public class RiderFinanceController : ControllerBase
    {
        private readonly IRiderFinanceService _finance;

        public RiderFinanceController(IRiderFinanceService finance)
        {
            _finance = finance;
        }

        [HttpGet("summary")]
        public async Task<IActionResult> Summary([FromQuery] DateTime? from, [FromQuery] DateTime? to)
        {
            if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid))
                return Unauthorized();

            return Ok(await _finance.GetSummaryAsync(uid, Normalize(from), Normalize(to)));
        }

        [HttpGet]
        public async Task<IActionResult> Page(
            [FromQuery] DateTime? from,
            [FromQuery] DateTime? to,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20)
        {
            if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid))
                return Unauthorized();

            return Ok(await _finance.GetPageAsync(uid, Normalize(from), Normalize(to), page, pageSize));
        }

        private static DateTime? Normalize(DateTime? value)
        {
            if (!value.HasValue) return null;
            return value.Value.Kind == DateTimeKind.Unspecified
                ? DateTime.SpecifyKind(value.Value, DateTimeKind.Utc)
                : value.Value.ToUniversalTime();
        }
    }
}
