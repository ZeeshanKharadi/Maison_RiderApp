using Microsoft.EntityFrameworkCore;
using Rider.Application.Interfaces.Repositories;
using System.Linq.Expressions;

namespace Rider.Persistence.Repositories
{
    public class Repository<T> : IRepository<T> where T : class
    {
        protected readonly DbContext _dbContext;
        protected readonly DbSet<T> _entities;

        public Repository(DbContext context)
        {
            _dbContext = context;
            _entities = context.Set<T>();
        }

        public IQueryable<T> GetAll(Expression<Func<T, bool>> filters = null)
        {
            IQueryable<T> data = _entities;
            if (filters != null)
                data = data.Where(filters);
            return data.AsNoTracking();
        }

        public async Task<T> GetSingleAsync(Expression<Func<T, bool>> filters)
            => await _entities.AsNoTracking().FirstOrDefaultAsync(filters);

        public async Task<T> AddAsync(T entity)
        {
            await _entities.AddAsync(entity);
            return entity;
        }

        public Task UpdateAsync(T entity)
        {
            _entities.Update(entity);
            return Task.CompletedTask;
        }

        public Task DeleteAsync(T entity)
        {
            _entities.Remove(entity);
            return Task.CompletedTask;
        }

        public async Task<bool> ExistsAsync(Expression<Func<T, bool>> filters)
            => await _entities.AnyAsync(filters);
    }
}
