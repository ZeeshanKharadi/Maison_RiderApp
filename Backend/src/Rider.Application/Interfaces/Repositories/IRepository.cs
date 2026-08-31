using System.Linq.Expressions;

namespace Rider.Application.Interfaces.Repositories
{
    public interface IRepository<T> where T : class
    {
        IQueryable<T> GetAll(Expression<Func<T, bool>> filters = null);
        Task<T> GetSingleAsync(Expression<Func<T, bool>> filters);
        Task<T> AddAsync(T entity);
        Task UpdateAsync(T entity);
        Task DeleteAsync(T entity);
        Task<bool> ExistsAsync(Expression<Func<T, bool>> filters);
    }
}
