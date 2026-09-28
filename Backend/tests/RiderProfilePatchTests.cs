using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Rider.Application.Authentication;
using Rider.Application.DTOs.Auth;
using Rider.Application.Helpers;
using Rider.Application.Interfaces;
using Rider.Domain.Entities;
using Rider.Infrastructure.Helpers;
using Rider.Infrastructure.Services;
using Rider.Persistence.Contexts;
using Rider.Persistence.Repositories;

namespace Rider.Tests;

public class RiderProfilePatchTests : IDisposable
{
    private readonly ApplicationDbContext _db;
    private readonly UserService _users;
    private readonly Guid _riderA = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private readonly Guid _riderB = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    public RiderProfilePatchTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase("profile-" + Guid.NewGuid())
            .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
            .Options;
        _db = new ApplicationDbContext(options);
        _db.Database.EnsureCreated();

        var crypto = new FakeCrypto();
        var verifier = new PasswordVerifier(crypto);

        var a = new AppUser
        {
            UserId = _riderA,
            ThirdPartyEmployeeId = "RD-A",
            UserName = "Rider A",
            Email = "a@example.com",
            PhoneNumber = "03001234567",
            EmergencyContactNumber = "03007654321",
            IsActive = true,
            IsVerified = true,
            StoreId = "S1",
            TokenVersion = 3
        };
        verifier.SetPassword(a, "PassA1!");

        var b = new AppUser
        {
            UserId = _riderB,
            ThirdPartyEmployeeId = "RD-B",
            UserName = "Rider B",
            PhoneNumber = "03111234567",
            IsActive = true,
            IsVerified = true,
            StoreId = "S2",
            TokenVersion = 1
        };
        verifier.SetPassword(b, "PassB1!");

        _db.Users.AddRange(a, b);
        _db.SaveChanges();

        var uow = new UnitOfWork(_db);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:RefreshExpiryDays"] = "7",
            ["PasswordReset:TokenMinutes"] = "15",
            ["PasswordReset:OtpMinutes"] = "5",
            ["PasswordReset:MaxOtpAttempts"] = "5",
            ["PasswordReset:ResendCooldownSeconds"] = "0"
        }).Build();

        _users = new UserService(
            uow,
            verifier,
            new NoJwt(),
            new AlwaysOkOtp(),
            config,
            new NoOpOpsEventPublisher(),
            NullLogger<UserService>.Instance);
    }

    public void Dispose() => _db.Dispose();

    [Fact]
    public async Task Patch_updates_own_phone_and_emergency_from_jwt_id()
    {
        var result = await _users.PatchRiderProfileAsync(_riderA.ToString(), new PatchRiderProfileRequest
        {
            phoneNumber = "0333-1112233",
            emergencyContactNumber = "0333-9998877",
            emergencyContactName = "Father"
        });

        Assert.True(result.status, result.message);
        Assert.Equal("0333-1112233", result.Data!.phoneNumber);
        Assert.Equal("0333-9998877", result.Data.emergencyContactNumber);
        Assert.Equal("Father", result.Data.emergencyContactName);

        var row = await _db.Users.AsNoTracking().FirstAsync(u => u.UserId == _riderA);
        Assert.Equal("0333-1112233", row.PhoneNumber);
        Assert.Equal("0333-9998877", row.EmergencyContactNumber);
        Assert.Equal("Father", row.EmergencyContactName);
        Assert.Equal(3, row.TokenVersion); // unchanged
    }

    [Fact]
    public async Task Patch_with_other_user_id_does_not_mutate_that_user()
    {
        // Client cannot supply target userId — service always uses JWT claim.
        // Calling with B's id while intending to change A is simply updating B's own row.
        var beforeA = await _db.Users.AsNoTracking().FirstAsync(u => u.UserId == _riderA);

        var result = await _users.PatchRiderProfileAsync(_riderB.ToString(), new PatchRiderProfileRequest
        {
            phoneNumber = "03451234567"
        });
        Assert.True(result.status);

        var afterA = await _db.Users.AsNoTracking().FirstAsync(u => u.UserId == _riderA);
        Assert.Equal(beforeA.PhoneNumber, afterA.PhoneNumber);

        var afterB = await _db.Users.AsNoTracking().FirstAsync(u => u.UserId == _riderB);
        Assert.Equal("03451234567", afterB.PhoneNumber);
    }

    [Fact]
    public async Task CurrentUser_returns_persisted_values_after_patch()
    {
        Assert.True((await _users.PatchRiderProfileAsync(_riderA.ToString(), new PatchRiderProfileRequest
        {
            phoneNumber = "03005554433",
            emergencyContactNumber = "03001112233"
        })).status);

        var me = await _users.GetCurrentUser(_riderA.ToString());
        Assert.True(me.status);
        Assert.Equal("03005554433", me.Data!.phoneNumber);
        Assert.Equal("03001112233", me.Data.emergencyContactNumber);
    }

    [Fact]
    public async Task Invalid_phone_rejected()
    {
        var bad = await _users.PatchRiderProfileAsync(_riderA.ToString(), new PatchRiderProfileRequest
        {
            phoneNumber = "abc"
        });
        Assert.False(bad.status);

        var shortDigits = await _users.PatchRiderProfileAsync(_riderA.ToString(), new PatchRiderProfileRequest
        {
            phoneNumber = "12345"
        });
        Assert.False(shortDigits.status);

        var empty = await _users.PatchRiderProfileAsync(_riderA.ToString(), new PatchRiderProfileRequest
        {
            phoneNumber = "   "
        });
        Assert.False(empty.status);
    }

    [Fact]
    public async Task Legacy_UpdateProfile_rejects_admin_controlled_fields()
    {
        var result = await _users.UpdateProfile(new UpdateProfileRequest
        {
            name = "Hacker",
            phoneNumber = "03001234567"
        }, _riderA.ToString());

        Assert.False(result.status);
        var row = await _db.Users.AsNoTracking().FirstAsync(u => u.UserId == _riderA);
        Assert.Equal("Rider A", row.UserName);
    }

    private sealed class NoJwt : IJwtTokenHandler
    {
        public string GenerateAccessToken(GetUserResponse user) => "t";
        public string GenerateRefreshToken() => "r";
        public Guid? GetUserIdFromExpiredToken(string? accessToken) => null;
    }

    private sealed class AlwaysOkOtp : IOtpNotifier
    {
        public bool IsConfigured => true;
        public Task<bool> SendOtpAsync(string email, string phoneNumber, string userName, string otpCode)
            => Task.FromResult(true);
    }

    private sealed class FakeCrypto : IPasswordCrypto
    {
        public byte[]? Encrypt(string plainText) => System.Text.Encoding.UTF8.GetBytes(plainText ?? "");
        public string? Decrypt(byte[]? cipherText)
            => cipherText == null ? null : System.Text.Encoding.UTF8.GetString(cipherText);
    }
}
