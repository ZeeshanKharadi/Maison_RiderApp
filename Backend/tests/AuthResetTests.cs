using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Rider.Application.Authentication;
using Rider.Application.DTOs.Auth;
using Rider.Application.Helpers;
using Rider.Domain.Entities;
using Rider.Infrastructure.Helpers;
using Rider.Infrastructure.Services;
using Rider.Persistence.Contexts;
using Rider.Persistence.Repositories;

namespace Rider.Tests;

public class TestOtpNotifier : IOtpNotifier
{
    public bool ShouldSucceed { get; set; } = true;
    public bool IsConfigured { get; set; } = true;
    public int SendCount { get; private set; }
    public string? LastOtp { get; private set; }

    public Task<bool> SendOtpAsync(string email, string phoneNumber, string userName, string otpCode)
    {
        SendCount++;
        LastOtp = otpCode;
        return Task.FromResult(ShouldSucceed);
    }
}

public class AuthResetTests : IDisposable
{
    private readonly ApplicationDbContext _db;
    private readonly UserService _users;
    private readonly TestOtpNotifier _otp;
    private readonly Guid _userId = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");

    public AuthResetTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase("auth-" + Guid.NewGuid())
            .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
            .Options;
        _db = new ApplicationDbContext(options);
        _db.Database.EnsureCreated();

        var crypto = new FakeCrypto();
        var verifier = new PasswordVerifier(crypto);
        _otp = new TestOtpNotifier { ShouldSucceed = true };

        var user = new AppUser
        {
            UserId = _userId,
            ThirdPartyEmployeeId = "RD-TEST",
            UserName = "Test",
            Email = "test@example.com",
            IsActive = true,
            IsVerified = true
        };
        verifier.SetPassword(user, "OldPass1");
        _db.Users.Add(user);
        _db.SaveChanges();

        var uow = new UnitOfWork(_db);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["PasswordReset:TokenMinutes"] = "15",
            ["PasswordReset:OtpMinutes"] = "5",
            ["PasswordReset:MaxOtpAttempts"] = "5",
            ["PasswordReset:ResendCooldownSeconds"] = "0",
            ["Jwt:RefreshExpiryDays"] = "7"
        }).Build();

        _users = new UserService(
            uow,
            verifier,
            new FakeJwt(),
            _otp,
            config,
            NullLogger<UserService>.Instance);
    }

    public void Dispose() => _db.Dispose();

    [Fact]
    public async Task Reset_token_required_and_reuse_fails()
    {
        var forgot = await _users.ForgetPassword(new VerifyAndGetUserDetailsRequest { workerId = "RD-TEST" });
        Assert.True(forgot.status, forgot.message);
        Assert.NotNull(_otp.LastOtp);

        var verify = await _users.VerifyOtpAsync(_userId.ToString(), _otp.LastOtp!);
        Assert.True(verify.status, verify.message);
        Assert.False(string.IsNullOrWhiteSpace(verify.Data));

        var token = verify.Data!;
        var update = await _users.UpdatePasswordWithTokenAsync(new UpdatePassword
        {
            resetToken = token,
            password = "NewPass1"
        });
        Assert.True(update.status, update.message);

        var reuse = await _users.UpdatePasswordWithTokenAsync(new UpdatePassword
        {
            resetToken = token,
            password = "NewPass2"
        });
        Assert.False(reuse.status);

        var missing = await _users.UpdatePasswordWithTokenAsync(new UpdatePassword
        {
            password = "NewPass3"
        });
        Assert.False(missing.status);
        Assert.Contains("resetToken", missing.message);

        var user = await _db.Users.AsNoTracking().FirstAsync(u => u.UserId == _userId);
        Assert.Equal(1, user.TokenVersion);
    }

    [Fact]
    public async Task Smtp_fail_no_false_success()
    {
        _otp.ShouldSucceed = false;
        var forgot = await _users.ForgetPassword(new VerifyAndGetUserDetailsRequest { workerId = "RD-TEST" });
        Assert.False(forgot.status);
        Assert.Equal(1, _otp.SendCount);
    }

    private sealed class FakeCrypto : IPasswordCrypto
    {
        public byte[]? Encrypt(string plainText) => System.Text.Encoding.UTF8.GetBytes(plainText);
        public string? Decrypt(byte[]? cipherText) => cipherText == null ? null : System.Text.Encoding.UTF8.GetString(cipherText);
    }

    private sealed class FakeJwt : IJwtTokenHandler
    {
        public string GenerateAccessToken(GetUserResponse user) => "access";
        public string GenerateRefreshToken() => Guid.NewGuid().ToString("N");
        public Guid? GetUserIdFromExpiredToken(string accessToken) => null;
    }
}
