using Microsoft.EntityFrameworkCore;
using Rider.Application.Interfaces.Repositories;
using Rider.Persistence.Contexts;

namespace Rider.Persistence.Repositories
{
    public class UnitOfWork : IUnitOfWork
    {
        private readonly ApplicationDbContext _dbContext;
        private IUserRepository _userRepository;
        private IOtpRepository _otpRepository;
        private IUserRefreshTokenRepository _userRefreshTokenRepository;
        private IAssignedOrderBatchRepository _assignedOrderBatchRepository;
        private IAssignedOrderRepository _assignedOrderRepository;
        private IAssignedOrderItemRepository _assignedOrderItemRepository;

        public UnitOfWork(ApplicationDbContext context)
        {
            _dbContext = context;
        }

        public DbContext Context => _dbContext;

        public IUserRepository UserRepository
            => _userRepository ??= new UserRepository(_dbContext);

        public IOtpRepository OtpRepository
            => _otpRepository ??= new OtpRepository(_dbContext);

        public IUserRefreshTokenRepository UserRefreshTokenRepository
            => _userRefreshTokenRepository ??= new UserRefreshTokenRepository(_dbContext);

        public IAssignedOrderBatchRepository AssignedOrderBatchRepository
            => _assignedOrderBatchRepository ??= new AssignedOrderBatchRepository(_dbContext);

        public IAssignedOrderRepository AssignedOrderRepository
            => _assignedOrderRepository ??= new AssignedOrderRepository(_dbContext);

        public IAssignedOrderItemRepository AssignedOrderItemRepository
            => _assignedOrderItemRepository ??= new AssignedOrderItemRepository(_dbContext);

        public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
            => _dbContext.SaveChangesAsync(cancellationToken);

        public void Dispose()
        {
            _dbContext.Dispose();
            GC.SuppressFinalize(this);
        }
    }
}
