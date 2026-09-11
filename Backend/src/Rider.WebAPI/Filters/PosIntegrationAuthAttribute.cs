using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Rider.Domain.Common;

namespace Rider.WebAPI.Filters
{
    /// <summary>
    /// Requires header X-POS-Api-Key to match configuration PosIntegration:ApiKey.
    /// No anonymous fallback.
    /// </summary>
    [AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
    public sealed class PosIntegrationAuthAttribute : Attribute, IAsyncActionFilter
    {
        public const string HeaderName = "X-POS-Api-Key";

        public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
        {
            var config = context.HttpContext.RequestServices.GetRequiredService<IConfiguration>();
            var expected = config["PosIntegration:ApiKey"];

            if (string.IsNullOrWhiteSpace(expected) || expected == "CHANGE_ME_POS_KEY")
            {
                context.Result = new UnauthorizedObjectResult(
                    new ApiResponse<string>(false, "POS integration is not configured", null));
                return;
            }

            if (!context.HttpContext.Request.Headers.TryGetValue(HeaderName, out var provided)
                || string.IsNullOrWhiteSpace(provided)
                || !FixedTimeEquals(provided.ToString(), expected))
            {
                context.Result = new UnauthorizedObjectResult(
                    new ApiResponse<string>(false, "Invalid or missing POS API key", null));
                return;
            }

            await next();
        }

        private static bool FixedTimeEquals(string a, string b)
        {
            var ba = System.Text.Encoding.UTF8.GetBytes(a);
            var bb = System.Text.Encoding.UTF8.GetBytes(b);
            return System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(
                System.Security.Cryptography.SHA256.HashData(ba),
                System.Security.Cryptography.SHA256.HashData(bb));
        }
    }
}
