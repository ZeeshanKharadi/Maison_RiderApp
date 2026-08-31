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
            => await _entities
                .Include(u => u.UserRoles)
                    .ThenInclude(ur => ur.Role)
                .FirstOrDefaultAsync(u => u.ThirdPartyEmployeeId == employeeId && u.DeletedAt == null);

        public async Task<AppUser> GetByUserIdAsync(Guid userId)
            => await _entities
                .Include(u => u.UserRoles)
                    .ThenInclude(ur => ur.Role)
                .FirstOrDefaultAsync(u => u.UserId == userId && u.DeletedAt == null);

        public async Task<List<AppUser>> ListRidersAsync(string storeId)
        {
            var q = _entities
                .AsNoTracking()
                .Include(u => u.UserRoles)
                    .ThenInclude(ur => ur.Role)
                .Where(u => u.DeletedAt == null
                    && u.UserRoles.Any(ur => ur.Role != null && ur.Role.RoleName == "Rider"));

            if (!string.IsNullOrWhiteSpace(storeId))
                q = q.Where(u => u.StoreId == storeId);

            return await q.OrderBy(u => u.UserName).ToListAsync();
        }
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

    public class RoleRepository : Repository<Role>, IRoleRepository
    {
        public RoleRepository(ApplicationDbContext context) : base(context)
        {
        }

        public async Task<Role> GetByNameAsync(string roleName)
            => await _entities.FirstOrDefaultAsync(r => r.RoleName == roleName);
    }

    public class UserRoleRepository : Repository<UserRole>, IUserRoleRepository
    {
        public UserRoleRepository(ApplicationDbContext context) : base(context)
        {
        }

        public async Task<bool> UserHasRoleAsync(Guid userId, string roleName)
            => await _entities
                .Include(ur => ur.Role)
                .AnyAsync(ur => ur.UserId == userId && ur.Role.RoleName == roleName);
    }

    public class StoreRepository : Repository<Store>, IStoreRepository
    {
        public StoreRepository(ApplicationDbContext context) : base(context)
        {
        }

        public async Task<List<Store>> ListActiveAsync()
            => await _entities.AsNoTracking()
                .Where(s => s.IsActive)
                .OrderBy(s => s.StoreId)
                .ToListAsync();

        public async Task EnsureExistsAsync(string storeId, string name)
        {
            if (string.IsNullOrWhiteSpace(storeId))
                return;

            var id = storeId.Trim();
            var existing = await _entities.FirstOrDefaultAsync(s => s.StoreId == id);
            if (existing != null)
                return;

            await _entities.AddAsync(new Store
            {
                StoreId = id,
                Name = string.IsNullOrWhiteSpace(name) ? id : name.Trim(),
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            });
        }
    }

    public class AppSettingRepository : Repository<AppSetting>, IAppSettingRepository
    {
        public AppSettingRepository(ApplicationDbContext context) : base(context)
        {
        }

        public async Task<string> GetValueAsync(string key, string fallback)
        {
            var row = await _entities.AsNoTracking().FirstOrDefaultAsync(s => s.SettingKey == key);
            return row == null || string.IsNullOrWhiteSpace(row.SettingValue) ? fallback : row.SettingValue;
        }

        public async Task SetValueAsync(string key, string value)
        {
            var row = await _entities.FirstOrDefaultAsync(s => s.SettingKey == key);
            if (row == null)
            {
                await _entities.AddAsync(new AppSetting
                {
                    SettingKey = key,
                    SettingValue = value ?? "",
                    UpdatedAt = DateTime.UtcNow
                });
                return;
            }

            row.SettingValue = value ?? "";
            row.UpdatedAt = DateTime.UtcNow;
        }
    }
}
