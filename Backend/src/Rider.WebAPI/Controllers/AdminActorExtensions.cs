using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Rider.Application.DTOs.Admin;
using Rider.Application.Interfaces;

namespace Rider.WebAPI.Controllers
{
    internal static class AdminActorExtensions
    {
        public static async Task<(IActionResult error, AdminActor actor)> ResolveAdminActorAsync(
            this ControllerBase controller, IAdminService adminService)
        {
            var userId = controller.User.FindFirstValue(ClaimTypes.NameIdentifier);
            var actor = await adminService.ResolveActorAsync(userId);
            if (actor == null)
                return (controller.Unauthorized(), null);

            if (!actor.IsHeadOffice && !actor.IsManager)
                return (controller.Forbid(), null);

            return (null, actor);
        }
    }
}
