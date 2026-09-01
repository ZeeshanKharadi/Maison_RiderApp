using Rider.Domain.Entities;

namespace Rider.Application.Interfaces.Repositories
{
    public interface IUserDeviceTokenRepository : IRepository<UserDeviceToken>
    {
        Task<UserDeviceToken?> GetByTokenAsync(string token);
        Task<List<string>> ListTokensForUserAsync(Guid userId);
        Task UpsertAsync(Guid userId, string token, string platform);
        Task RemoveAsync(Guid userId, string token);
    }
}
