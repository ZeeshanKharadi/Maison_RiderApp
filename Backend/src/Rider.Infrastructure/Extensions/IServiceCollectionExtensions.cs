using Microsoft.Extensions.DependencyInjection;
using Rider.Application.Authentication;
using Rider.Application.Helpers;
using Rider.Application.Interfaces;
using Rider.Infrastructure.Authentication;
using Rider.Infrastructure.Helpers;
using Rider.Infrastructure.Services;

namespace Rider.Infrastructure.Extensions
{
    public static class IServiceCollectionExtensions
    {
        public static void AddInfrastructureLayer(this IServiceCollection services)
        {
            services.AddScoped<IJwtTokenHandler, JwtTokenHandler>();
            services.AddScoped<IPasswordCrypto, PasswordCrypto>();
            services.AddScoped<IOtpNotifier, OtpNotifier>();
            services.AddScoped<IUserService, UserService>();
            services.AddScoped<IOrderService, OrderService>();
        }
    }
}
