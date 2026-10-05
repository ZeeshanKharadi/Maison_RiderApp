using Microsoft.EntityFrameworkCore;
using Rider.Application.Interfaces;
using Rider.Domain.Common;
using Rider.Domain.Entities;
using Rider.Infrastructure.Services;
using Rider.Persistence.Contexts;
using Rider.Persistence.Repositories;

namespace Rider.Tests;

/// <summary>
/// Soft-delete keeps audit rows but hides them from list / cancel catch-up;
/// scoped to the JWT rider (userId passed from controller).
/// </summary>
public class RiderNotificationSoftDeleteTests : IDisposable
{
    private readonly ApplicationDbContext _db;
    private readonly RiderNotificationService _svc;
    private readonly Guid _riderA = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private readonly Guid _riderB = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    public RiderNotificationSoftDeleteTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase("notif-soft-" + Guid.NewGuid())
            .ConfigureWarnings(w => w.Ignore(
                Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
            .Options;
        _db = new ApplicationDbContext(options);
        _db.Database.EnsureCreated();

        _db.Users.AddRange(
            new AppUser
            {
                UserId = _riderA,
                ThirdPartyEmployeeId = "RD-A",
                UserName = "A",
                IsActive = true,
                IsVerified = true,
                StoreId = "S1"
            },
            new AppUser
            {
                UserId = _riderB,
                ThirdPartyEmployeeId = "RD-B",
                UserName = "B",
                IsActive = true,
                IsVerified = true,
                StoreId = "S1"
            });
        _db.SaveChanges();

        _svc = new RiderNotificationService(new UnitOfWork(_db), new NoOpFcm());
    }

    [Fact]
    public async Task SoftDelete_hides_from_list_and_retains_row()
    {
        var keep = await SeedAsync(_riderA, "Keep me", assignedOrderId: null);
        var hide = await SeedAsync(_riderA, "Hide me", assignedOrderId: null);

        var del = await _svc.SoftDeleteAsync(_riderA, hide.Id);
        Assert.True(del.status);

        var list = await _svc.ListForUserAsync(_riderA);
        Assert.True(list.status);
        Assert.Single(list.Data!);
        Assert.Equal(keep.Id, list.Data![0].id);

        var row = await _db.RiderNotifications.AsNoTracking().SingleAsync(n => n.Id == hide.Id);
        Assert.True(row.IsDeleted);
        Assert.NotNull(row.DeletedAt);
        Assert.True(row.IsRead);
    }

    [Fact]
    public async Task SoftDelete_is_scoped_to_owning_rider()
    {
        var bRow = await SeedAsync(_riderB, "B only", assignedOrderId: 99);

        var del = await _svc.SoftDeleteAsync(_riderA, bRow.Id);
        Assert.False(del.status);

        var still = await _db.RiderNotifications.AsNoTracking().SingleAsync(n => n.Id == bRow.Id);
        Assert.False(still.IsDeleted);

        var listB = await _svc.ListForUserAsync(_riderB);
        Assert.Single(listB.Data!);
    }

    [Fact]
    public async Task SoftDelete_excludes_cancel_from_unread_catchup_others_remain()
    {
        var repo = new RiderNotificationRepository(_db);
        var deletedCancel = await SeedAsync(_riderA, RiderNotificationTitles.OrderCancelled, 10);
        var liveCancel = await SeedAsync(_riderA, RiderNotificationTitles.OrderCancelled, 11);

        Assert.True((await _svc.SoftDeleteAsync(_riderA, deletedCancel.Id)).status);

        var unread = await repo.ListUnreadOrderCancellationsAsync(_riderA);
        Assert.Single(unread);
        Assert.Equal(liveCancel.Id, unread[0].Id);
        Assert.Equal(11, unread[0].AssignedOrderId);
    }

    [Fact]
    public async Task SoftDeleteAll_hides_all_for_rider_only()
    {
        await SeedAsync(_riderA, "A1", null);
        await SeedAsync(_riderA, "A2", null);
        await SeedAsync(_riderB, "B1", null);

        Assert.True((await _svc.SoftDeleteAllAsync(_riderA)).status);

        Assert.Empty((await _svc.ListForUserAsync(_riderA)).Data!);
        Assert.Single((await _svc.ListForUserAsync(_riderB)).Data!);

        var aRows = await _db.RiderNotifications.AsNoTracking()
            .Where(n => n.UserId == _riderA)
            .ToListAsync();
        Assert.Equal(2, aRows.Count);
        Assert.All(aRows, r => Assert.True(r.IsDeleted));
    }

    private async Task<RiderNotification> SeedAsync(Guid userId, string title, long? assignedOrderId)
    {
        var row = new RiderNotification
        {
            UserId = userId,
            Category = "orders",
            Title = title,
            Description = "test",
            OrderId = assignedOrderId?.ToString() ?? "x",
            AssignedOrderId = assignedOrderId,
            Priority = "high",
            IsRead = false,
            IsDeleted = false,
            CreatedAt = DateTime.UtcNow
        };
        _db.RiderNotifications.Add(row);
        await _db.SaveChangesAsync();
        return row;
    }

    public void Dispose() => _db.Dispose();

    private sealed class NoOpFcm : IFcmPushService
    {
        public bool IsConfigured => false;

        public Task SendToUserAsync(
            Guid userId, string title, string body, IReadOnlyDictionary<string, string>? data = null)
            => Task.CompletedTask;
    }
}
