using Microsoft.EntityFrameworkCore;

namespace Rider.Application.Interfaces.Repositories
{
    public interface IUnitOfWork : IDisposable
    {
        DbContext Context { get; }
        IUserRepository UserRepository { get; }
        IOtpRepository OtpRepository { get; }
        IUserRefreshTokenRepository UserRefreshTokenRepository { get; }
        IAssignedOrderBatchRepository AssignedOrderBatchRepository { get; }
        IAssignedOrderRepository AssignedOrderRepository { get; }
        IAssignedOrderItemRepository AssignedOrderItemRepository { get; }
        Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
    }
}
