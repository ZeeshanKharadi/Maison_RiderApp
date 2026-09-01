using Microsoft.EntityFrameworkCore;
using Rider.Application.Interfaces.Repositories;
using Rider.Domain.Entities;
using Rider.Persistence.Contexts;

namespace Rider.Persistence.Repositories
{
    public class UserDeviceTokenRepository : Repository<UserDeviceToken>, IUserDeviceTokenRepository
    {
        public UserDeviceTokenRepository(ApplicationDbContext context) : base(context)
        {
        }

        public async Task<UserDeviceToken?> GetByTokenAsync(string token)
            => await _entities.FirstOrDefaultAsync(t => t.Token == token);

        public async Task<List<string>> ListTokensForUserAsync(Guid userId)
            => await _entities
                .AsNoTracking()
                .Where(t => t.UserId == userId)
                .Select(t => t.Token)
                .ToListAsync();

        public async Task UpsertAsync(Guid userId, string token, string platform)
        {
            var existing = await GetByTokenAsync(token);
            if (existing != null)
            {
                existing.UserId = userId;
                existing.Platform = platform;
                existing.UpdatedAt = DateTime.UtcNow;
                await UpdateAsync(existing);
                return;
            }

            await AddAsync(new UserDeviceToken
            {
                UserId = userId,
                Token = token,
                Platform = platform,
                UpdatedAt = DateTime.UtcNow
            });
        }

        public async Task RemoveAsync(Guid userId, string token)
        {
            var row = await _entities.FirstOrDefaultAsync(t => t.UserId == userId && t.Token == token);
            if (row != null)
                await DeleteAsync(row);
        }
    }
}
