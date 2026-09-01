using Microsoft.EntityFrameworkCore;
using Rider.Application.Interfaces.Repositories;
using Rider.Domain.Entities;
using Rider.Persistence.Contexts;

namespace Rider.Persistence.Repositories
{
    public class RiderNotificationRepository : Repository<RiderNotification>, IRiderNotificationRepository
    {
        public RiderNotificationRepository(ApplicationDbContext context) : base(context)
        {
        }

        public async Task<List<RiderNotification>> ListForUserAsync(Guid userId, int take)
            => await _entities
                .AsNoTracking()
                .Where(n => n.UserId == userId)
                .OrderByDescending(n => n.CreatedAt)
                .Take(take)
                .ToListAsync();

        public async Task<RiderNotification> GetForUserAsync(Guid userId, long id)
            => await _entities.FirstOrDefaultAsync(n => n.Id == id && n.UserId == userId);
    }
}
