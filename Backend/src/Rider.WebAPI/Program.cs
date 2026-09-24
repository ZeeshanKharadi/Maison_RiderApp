using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.OpenApi.Models;
using Rider.Application.Extensions;
using Rider.Application.Interfaces;
using Rider.Infrastructure.Extensions;
using Rider.Infrastructure.Helpers;
using Rider.Persistence.Extensions;
using Rider.WebAPI.Hubs;
using Rider.WebAPI.Middleware;
using Rider.WebAPI.Realtime;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateLogger();
builder.Host.UseSerilog();

builder.Services.AddControllers(options =>
{
    options.SuppressImplicitRequiredAttributeForNonNullableReferenceTypes = true;
});
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "Maison Delivery API", Version = "v1" });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description =
            "Paste the JWT from login (data.token only). Swagger adds the Bearer prefix automatically.",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT"
    });
    c.AddSecurityDefinition("PosApiKey", new OpenApiSecurityScheme
    {
        Description =
            "POS integration key. Value must match PosIntegration:ApiKey in appsettings. Header name: X-POS-Api-Key",
        Name = "X-POS-Api-Key",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.ApiKey
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
            },
            Array.Empty<string>()
        },
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "PosApiKey" }
            },
            Array.Empty<string>()
        }
    });
});

builder.Services.AddApplicationLayer();
builder.Services.AddInfrastructureLayer();
builder.Services.AddPersistenceLayer(builder.Configuration);
builder.Services.AddAuthorization();
builder.Services.AddSignalR();
builder.Services.AddScoped<IOpsEventPublisher, OpsEventPublisher>();

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("auth", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 20,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));
    options.AddPolicy("location", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
                ?? httpContext.Connection.RemoteIpAddress?.ToString()
                ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 60,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));
});

// Allow any browser origin (portal on IIS, localhost, LAN IPs, etc.).
// SetIsOriginAllowed + AllowCredentials is required for SignalR; AllowAnyOrigin cannot combine with credentials.
builder.Services.AddCors(options =>
{
    options.AddPolicy("Portal", policy =>
        policy.SetIsOriginAllowed(_ => true)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials());
});
builder.Services.AddHttpContextAccessor();

var app = builder.Build();

app.UseMiddleware<GlobalExceptionHandler>();

if (!app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
app.UseSwagger();
app.UseSwaggerUI();

app.UseCors("Portal");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHub<AdminOpsHub>("/hubs/admin");

using (var scope = app.Services.CreateScope())
{
    try
    {
        var unitOfWork = scope.ServiceProvider.GetRequiredService<Rider.Application.Interfaces.Repositories.IUnitOfWork>();
        var verifier = scope.ServiceProvider.GetRequiredService<PasswordVerifier>();

        async Task SeedPassword(string workerId, string password, string label)
        {
            var user = await unitOfWork.UserRepository.GetByEmployeeIdAsync(workerId);
            if (user != null
                && (string.IsNullOrEmpty(user.PasswordHash))
                && (user.PasswordEncrypted == null || user.PasswordEncrypted.Length == 0))
            {
                verifier.SetPassword(user, password);
                user.IsActive = true;
                user.IsVerified = true;
                await unitOfWork.UserRepository.UpdateAsync(user);
                await unitOfWork.SaveChangesAsync();
                Log.Information("Seeded password for {Label} {WorkerId}", label, workerId);
            }
        }

        await SeedPassword("RD-9921", "RD-9921", "demo rider");
        await SeedPassword("HO-ADMIN", "Admin@Maison1", "head-office admin");

        var fcm = scope.ServiceProvider.GetService<IFcmPushService>();
        Log.Information("Firebase FCM push enabled: {Enabled}", fcm?.IsConfigured == true);
    }
    catch (Exception ex)
    {
        Log.Warning(ex, "Demo password seed skipped");
    }
}

app.Run();

public partial class Program { }
