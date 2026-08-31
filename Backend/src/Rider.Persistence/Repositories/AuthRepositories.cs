using Microsoft.EntityFrameworkCore;
using Rider.Application.Interfaces.Repositories;
using Rider.Domain.Entities;
using Rider.Persistence.Contexts;

namespace Rider.Persistence.Repositories
{
    public class UserRepository : Repository<AppUser>, IUserRepository
    {
        public UserRepository(ApplicationDbContext context) : base(context)
        {
        }

        public async Task<AppUser> GetByEmployeeIdAsync(string employeeId)
            => await _entities.FirstOrDefaultAsync(u => u.ThirdPartyEmployeeId == employeeId && u.DeletedAt == null);

        public async Task<AppUser> GetByUserIdAsync(Guid userId)
            => await _entities.FirstOrDefaultAsync(u => u.UserId == userId && u.DeletedAt == null);
    }

    public class OtpRepository : Repository<OtpCode>, IOtpRepository
    {
        public OtpRepository(ApplicationDbContext context) : base(context)
        {
        }

        public async Task<OtpCode> GetLatestValidAsync(Guid userId, string otpCode)
            => await _entities
                .Where(o => o.UserId == userId && o.OtpCodeValue == otpCode)
                .OrderByDescending(o => o.CreatedAt)
                .FirstOrDefaultAsync();
    }

    public class UserRefreshTokenRepository : Repository<UserRefreshToken>, IUserRefreshTokenRepository
    {
        public UserRefreshTokenRepository(ApplicationDbContext context) : base(context)
        {
        }

        public async Task<UserRefreshToken> GetByTokenAsync(string refreshToken)
            => await _entities.FirstOrDefaultAsync(t => t.RefreshToken == refreshToken && !t.IsRevoked);
    }
}
