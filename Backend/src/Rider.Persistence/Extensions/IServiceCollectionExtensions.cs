using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using Rider.Application.Interfaces.Repositories;
using Rider.Persistence.Contexts;
using Rider.Persistence.Repositories;

namespace Rider.Persistence.Extensions
{
    public static class IServiceCollectionExtensions
    {
        public static void AddPersistenceLayer(this IServiceCollection services, IConfiguration configuration)
        {
            services.AddDbContext(configuration);
            services.AddJwtAuthentication(configuration);
            services.AddRepositories();
        }

        private static void AddDbContext(this IServiceCollection services, IConfiguration configuration)
        {
            var connectionString = configuration.GetConnectionString("DefaultConnection");
            services.AddDbContext<ApplicationDbContext>(options =>
                options.UseSqlServer(connectionString,
                    builder => builder.MigrationsAssembly(typeof(ApplicationDbContext).Assembly.FullName)));
        }

        /// <summary>
        /// ESS-compatible JWT validation (Issuer + Audience + lifetime).
        /// </summary>
        private static void AddJwtAuthentication(this IServiceCollection services, IConfiguration configuration)
        {
            var key = configuration["Jwt:Key"];
            if (string.IsNullOrWhiteSpace(key))
                throw new InvalidOperationException(
                    "Jwt:Key is not configured. Set via environment variable Jwt__Key or appsettings.Local.json.");

            services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
                options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
            })
            .AddJwtBearer(options =>
            {
                options.RequireHttpsMetadata = false;
                options.SaveToken = true;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),
                    ValidateIssuer = true,
                    ValidIssuer = configuration["Jwt:Issuer"],
                    ValidateAudience = true,
                    ValidAudience = configuration["Jwt:Audience"],
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromMinutes(2),
                    RoleClaimType = System.Security.Claims.ClaimTypes.Role
                };
                options.Events = new JwtBearerEvents
                {
                    OnMessageReceived = context =>
                    {
                        var accessToken = context.Request.Query["access_token"];
                        var path = context.HttpContext.Request.Path;
                        if (!string.IsNullOrEmpty(accessToken)
                            && path.StartsWithSegments("/hubs"))
                        {
                            context.Token = accessToken;
                        }
                        return Task.CompletedTask;
                    },
                    OnTokenValidated = async context =>
                    {
                        var uidRaw = context.Principal?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
                        if (!Guid.TryParse(uidRaw, out var uid))
                        {
                            context.Fail("Invalid user");
                            return;
                        }

                        var claimVersionRaw = context.Principal?.FindFirst("token_version")?.Value;
                        if (!int.TryParse(claimVersionRaw, out var claimVersion))
                            claimVersion = 0;

                        var db = context.HttpContext.RequestServices
                            .GetRequiredService<Rider.Persistence.Contexts.ApplicationDbContext>();
                        var current = await db.Users.AsNoTracking()
                            .Where(u => u.UserId == uid)
                            .Select(u => new { u.TokenVersion, u.IsActive })
                            .FirstOrDefaultAsync();

                        if (current == null || !current.IsActive || current.TokenVersion != claimVersion)
                        {
                            context.Fail("Token revoked");
                        }
                    },
                    OnAuthenticationFailed = ctx =>
                    {
                        Console.WriteLine($"JWT auth failed: {ctx.Exception.Message}");
                        return Task.CompletedTask;
                    },
                    OnChallenge = ctx => Task.CompletedTask
                };
            });
        }

        private static void AddRepositories(this IServiceCollection services)
        {
            services.AddScoped(typeof(IRepository<>), typeof(Repository<>));
            services.AddScoped<IUserRepository, UserRepository>();
            services.AddScoped<IOtpRepository, OtpRepository>();
            services.AddScoped<IUserRefreshTokenRepository, UserRefreshTokenRepository>();
            services.AddScoped<IAssignedOrderBatchRepository, AssignedOrderBatchRepository>();
            services.AddScoped<IAssignedOrderRepository, AssignedOrderRepository>();
            services.AddScoped<IAssignedOrderItemRepository, AssignedOrderItemRepository>();
            services.AddScoped<IRoleRepository, RoleRepository>();
            services.AddScoped<IUserRoleRepository, UserRoleRepository>();
            services.AddScoped<IStoreRepository, StoreRepository>();
            services.AddScoped<IAppSettingRepository, AppSettingRepository>();
            services.AddScoped<IRiderNotificationRepository, RiderNotificationRepository>();
            services.AddScoped<IUserDeviceTokenRepository, UserDeviceTokenRepository>();
            services.AddScoped<IUnitOfWork, UnitOfWork>();
        }
    }
}
