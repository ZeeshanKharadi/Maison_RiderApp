using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Rider.Application.Interfaces;
using Rider.Domain.Common;

namespace Rider.WebAPI.Controllers
{
    [ApiController]
    [Route("api/Admin/OrderRejections")]
    [Authorize(Roles = RoleNames.AdminOrManager)]
    public class AdminOrderRejectionsController : ControllerBase
    {
        private readonly IAdminService _admin;

        public AdminOrderRejectionsController(IAdminService admin)
        {
            _admin = admin;
        }

        [HttpGet]
        public async Task<IActionResult> List(
            [FromQuery] string storeId,
            [FromQuery] DateTime? from,
            [FromQuery] DateTime? to)
        {
            var (error, actor) = await this.ResolveAdminActorAsync(_admin);
            if (error != null)
                return error;

            return Ok(await _admin.ListOrderRejectionsAsync(actor, storeId, from, to));
        }
    }
}
