using Rider.Domain.Entities;

namespace Rider.Application.Interfaces.Repositories
{
    public interface IRiderNotificationRepository : IRepository<RiderNotification>
    {
        Task<List<RiderNotification>> ListForUserAsync(Guid userId, int take);
        Task<RiderNotification> GetForUserAsync(Guid userId, long id);
    }
}
