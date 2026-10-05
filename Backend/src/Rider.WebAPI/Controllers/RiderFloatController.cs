using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Rider.Application.DTOs.Float;
using Rider.Application.Interfaces;
using Rider.Domain.Common;
using System.Security.Claims;

namespace Rider.WebAPI.Controllers
{
    [ApiController]
    [Route("api/Order/float")]
    [Authorize(Roles = RoleNames.Rider)]
    public class RiderFloatController : ControllerBase
    {
        private readonly IRiderFloatService _float;

        public RiderFloatController(IRiderFloatService floatService)
        {
            _float = floatService;
        }

        [HttpGet("summary")]
        public async Task<IActionResult> Summary()
        {
            if (!TryGetUserId(out var userId)) return Unauthorized();
            return Ok(await _float.GetSummaryForRiderAsync(userId));
        }

        [HttpPost("acknowledge")]
        public async Task<IActionResult> Acknowledge([FromBody] FloatAcknowledgeRequest request)
        {
            if (!TryGetUserId(out var userId)) return Unauthorized();
            return Ok(await _float.AcknowledgeAsync(userId, request));
        }

        private bool TryGetUserId(out Guid userId)
        {
            userId = Guid.Empty;
            var raw = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
            return Guid.TryParse(raw, out userId);
        }
    }
}
