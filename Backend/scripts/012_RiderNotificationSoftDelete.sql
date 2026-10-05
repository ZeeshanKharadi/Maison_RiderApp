-- Soft-delete for rider inbox rows (audit retained; hidden from list / catch-up).
USE RiderManagement;
GO

IF COL_LENGTH(N'dbo.RiderNotifications', N'IsDeleted') IS NULL
BEGIN
    ALTER TABLE dbo.RiderNotifications
        ADD IsDeleted BIT NOT NULL
            CONSTRAINT DF_RiderNotifications_IsDeleted DEFAULT (0);
END
GO

IF COL_LENGTH(N'dbo.RiderNotifications', N'DeletedAt') IS NULL
BEGIN
    ALTER TABLE dbo.RiderNotifications
        ADD DeletedAt DATETIME2 NULL;
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_RiderNotifications_User_Active_Created'
      AND object_id = OBJECT_ID(N'dbo.RiderNotifications')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_RiderNotifications_User_Active_Created
        ON dbo.RiderNotifications (UserId, CreatedAt DESC)
        WHERE IsDeleted = 0;
END
GO

PRINT 'RiderNotifications soft-delete columns ready.';
GO
