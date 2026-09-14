using Microsoft.EntityFrameworkCore;
using Rider.Domain.Common;
using Rider.Domain.Entities;
using Rider.Persistence.Contexts;

namespace Rider.Tests;

/// <summary>
/// Applies 006/007 against an isolated SQL Server database twice.
/// Never targets production (uses RIDER_TEST_SQL / LocalDB Phase1 test DB).
/// </summary>
public class MigrationIdempotencyTests
{
    // Dedicated isolated DB — never production. Overrides RIDER_TEST_SQL so concurrency tests stay separate.
    private static readonly string ConnectionString =
        "Server=(localdb)\\MSSQLLocalDB;Database=RiderManagement_MigrationVerify;Trusted_Connection=True;TrustServerCertificate=True;Connect Timeout=15;MultipleActiveResultSets=true";

    private static bool? _available;
    private static string? _skipReason;

    private static bool IsAvailable()
    {
        if (_available.HasValue) return _available.Value;
        try
        {
            using var db = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseSqlServer(ConnectionString).Options);
            // Create empty DB if missing
            db.Database.EnsureCreated();
            _available = true;
            return true;
        }
        catch (Exception ex)
        {
            _available = false;
            _skipReason = ex.Message;
            return false;
        }
    }

    [SkippableFact]
    public async Task Scripts_006_and_007_are_idempotent_and_preserve_legacy_cash()
    {
        Skip.If(!IsAvailable(), _skipReason);

        await using var db = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlServer(ConnectionString).Options);

        try
        {
            await db.Database.EnsureDeletedAsync();
        }
        catch (Exception)
        {
            // LocalDB may report missing DB on first delete — continue to create.
        }
        await db.Database.EnsureCreatedAsync();

        // Representative legacy ambiguous cash row already shaped by EnsureCreated model.
        var store = new Store { StoreId = "S1", Name = "S1", IsActive = true };
        db.Stores.Add(store);
        var batch = new AssignedOrderBatch { StoreId = "S1", Time = "t", CreatedAt = DateTime.UtcNow };
        db.AssignedOrderBatches.Add(batch);
        await db.SaveChangesAsync();

        var legacy = new AssignedOrder
        {
            BatchId = batch.Id,
            OrderId = "LEGACY-1",
            OrderNo = "LEGACY-1",
            OrderTypeId = "D",
            OrderState = "Done",
            Comment = "",
            LastName = "L",
            FirstName = "F",
            City = "C",
            Street = "S",
            AddressNo = "1",
            PostCode = "0",
            SecondaryAddress = "",
            Phone = "0",
            OrderTime = "now",
            Status = OrderStatuses.Completed,
            PaymentMethod = "cash",
            Cash = 250,
            ExpectedCash = 250,
            CashCollected = 250,
            CashSemanticsNote = CashSemantics.LegacyAmbiguous,
            OrderTotal = 250,
            CreatedAt = DateTime.UtcNow,
            Items = new List<AssignedOrderItem>()
        };
        db.AssignedOrders.Add(legacy);
        await db.SaveChangesAsync();
        var legacyId = legacy.Id;

        var scriptsDir = Path.Combine(AppContext.BaseDirectory, "scripts");
        var script006 = await File.ReadAllTextAsync(Path.Combine(scriptsDir, "006_ProductionLifecycle.sql"));
        var script007 = await File.ReadAllTextAsync(Path.Combine(scriptsDir, "007_Phase1Corrections.sql"));

        await ExecuteSqlBatchesAsync(db, script006);
        await ExecuteSqlBatchesAsync(db, script007);
        await ExecuteSqlBatchesAsync(db, script006); // second pass
        await ExecuteSqlBatchesAsync(db, script007); // second pass

        var row = await db.AssignedOrders.AsNoTracking().FirstAsync(o => o.Id == legacyId);
        Assert.Equal(250m, row.CashCollected);
        Assert.Equal(CashSemantics.LegacyAmbiguous, row.CashSemanticsNote);
        Assert.Equal(250m, row.ExpectedCash);

        var hasToken = await db.Database
            .SqlQueryRaw<int>("SELECT CASE WHEN COL_LENGTH('dbo.Users', 'TokenVersion') IS NULL THEN 0 ELSE 1 END AS [Value]")
            .SingleAsync();
        Assert.Equal(1, hasToken);

        var hasHandoverReq = await db.Database
            .SqlQueryRaw<int>("SELECT CASE WHEN COL_LENGTH('dbo.AssignedOrders', 'HandoverRequestId') IS NULL THEN 0 ELSE 1 END AS [Value]")
            .SingleAsync();
        Assert.Equal(1, hasHandoverReq);

        var hasRowVersion = await db.Database
            .SqlQueryRaw<int>("SELECT CASE WHEN COL_LENGTH('dbo.AssignedOrders', 'RowVersion') IS NULL THEN 0 ELSE 1 END AS [Value]")
            .SingleAsync();
        Assert.Equal(1, hasRowVersion);
    }

    private static async Task ExecuteSqlBatchesAsync(ApplicationDbContext db, string script)
    {
        var batches = System.Text.RegularExpressions.Regex.Split(
            script,
            @"^\s*GO\s*$",
            System.Text.RegularExpressions.RegexOptions.Multiline | System.Text.RegularExpressions.RegexOptions.IgnoreCase);

        foreach (var batch in batches)
        {
            var sql = batch.Trim();
            if (string.IsNullOrWhiteSpace(sql)) continue;
            await db.Database.ExecuteSqlRawAsync(sql);
        }
    }
}
