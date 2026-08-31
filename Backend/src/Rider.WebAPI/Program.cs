using System.Text;
using Microsoft.OpenApi.Models;
using Rider.Application.Extensions;
using Rider.Infrastructure.Extensions;
using Rider.Persistence.Extensions;
using Rider.WebAPI.Middleware;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateLogger();
builder.Host.UseSerilog();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "Rider Management API", Version = "v1" });
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
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
            },
            Array.Empty<string>()
        }
    });
});

builder.Services.AddApplicationLayer();
builder.Services.AddInfrastructureLayer();
builder.Services.AddPersistenceLayer(builder.Configuration);
builder.Services.AddAuthorization();
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});
builder.Services.AddHttpContextAccessor();

var app = builder.Build();

app.UseMiddleware<GlobalExceptionHandler>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AllowAll");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

// Ensure demo rider has an AES password (seed script leaves passwordencrypted NULL).
using (var scope = app.Services.CreateScope())
{
    try
    {
        var unitOfWork = scope.ServiceProvider.GetRequiredService<Rider.Application.Interfaces.Repositories.IUnitOfWork>();
        var crypto = scope.ServiceProvider.GetRequiredService<Rider.Application.Helpers.IPasswordCrypto>();
        var demo = await unitOfWork.UserRepository.GetByEmployeeIdAsync("RD-9921");
        if (demo != null && (demo.PasswordEncrypted == null || demo.PasswordEncrypted.Length == 0))
        {
            demo.PasswordEncrypted = crypto.Encrypt("RD-9921");
            demo.IsActive = true;
            demo.IsVerified = true;
            await unitOfWork.UserRepository.UpdateAsync(demo);
            await unitOfWork.SaveChangesAsync();
            Log.Information("Seeded AES password for demo rider RD-9921");
        }
    }
    catch (Exception ex)
    {
        Log.Warning(ex, "Demo password seed skipped");
    }
}

app.Run();
