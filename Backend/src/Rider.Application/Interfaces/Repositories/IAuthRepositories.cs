using Rider.Domain.Entities;

namespace Rider.Application.Interfaces.Repositories
{
    public interface IUserRepository : IRepository<AppUser>
    {
        Task<AppUser> GetByEmployeeIdAsync(string employeeId);
        Task<AppUser> GetByUserIdAsync(Guid userId);
        Task<List<AppUser>> ListRidersAsync(string storeId);
        Task<List<AppUser>> ListActiveRidersForStoreAsync(string storeId);
    }

    public interface IRoleRepository : IRepository<Role>
    {
        Task<Role> GetByNameAsync(string roleName);
    }

    public interface IUserRoleRepository : IRepository<UserRole>
    {
        Task<bool> UserHasRoleAsync(Guid userId, string roleName);
    }

    public interface IStoreRepository : IRepository<Store>
    {
        Task<List<Store>> ListActiveAsync();
        Task EnsureExistsAsync(string storeId, string name);
    }

    public interface IAppSettingRepository : IRepository<AppSetting>
    {
        Task<string> GetValueAsync(string key, string fallback);
        Task SetValueAsync(string key, string value);
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
