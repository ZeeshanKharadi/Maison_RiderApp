using Rider.Domain.Entities;

namespace Rider.Application.Interfaces.Repositories
{
    public interface IUserRepository : IRepository<AppUser>
    {
        Task<AppUser> GetByEmployeeIdAsync(string employeeId);
        Task<AppUser> GetByUserIdAsync(Guid userId);
    }

    public interface IOtpRepository : IRepository<OtpCode>
    {
        Task<OtpCode> GetLatestValidAsync(Guid userId, string otpCode);
    }

    public interface IUserRefreshTokenRepository : IRepository<UserRefreshToken>
    {
        Task<UserRefreshToken> GetByTokenAsync(string refreshToken);
    }
}
