using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Rider.Application.Interfaces;
using Rider.Domain.Common;

namespace Rider.WebAPI.Controllers
{
    [ApiController]
    [Route("api/Admin/Reports")]
    [Authorize(Roles = RoleNames.AdminOrManager)]
    public class AdminReportsController : ControllerBase
    {
        private readonly IAdminService _admin;

        public AdminReportsController(IAdminService admin)
        {
            _admin = admin;
        }

        [HttpGet]
        public async Task<IActionResult> Get(
            [FromQuery] DateTime? from,
            [FromQuery] DateTime? to,
            [FromQuery] string storeId,
            [FromQuery] Guid? riderId)
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null)
                return error;

            return Ok(await _admin.GetReportsAsync(actor, from, to, storeId, riderId));
        }
    }
}
