-- =============================================================================
-- 006_ProductionLifecycle.sql
-- Production-readiness: concurrency, COD separation, auth reset tokens,
-- availability intervals, audit, rejections, admin notifications.
-- Idempotent / additive. Does NOT drop data.
-- Deploy AFTER 001–005 scripts. Rollback: reverse column/table adds manually;
-- historical CashCollected values are preserved (see CashSemanticsNote).
-- =============================================================================
SET NOCOUNT ON;
GO

-- ----- AssignedOrders: concurrency + COD fields -----
IF COL_LENGTH('dbo.AssignedOrders', 'RowVersion') IS NULL
BEGIN
    ALTER TABLE dbo.AssignedOrders ADD RowVersion ROWVERSION NOT NULL;
END
GO

IF COL_LENGTH('dbo.AssignedOrders', 'ExpectedCash') IS NULL
    ALTER TABLE dbo.AssignedOrders ADD ExpectedCash DECIMAL(18,2) NULL;
GO
IF COL_LENGTH('dbo.AssignedOrders', 'CashCollectedReason') IS NULL
    ALTER TABLE dbo.AssignedOrders ADD CashCollectedReason NVARCHAR(500) NULL;
GO
IF COL_LENGTH('dbo.AssignedOrders', 'CashHandedOverAt') IS NULL
    ALTER TABLE dbo.AssignedOrders ADD CashHandedOverAt DATETIME2 NULL;
GO
IF COL_LENGTH('dbo.AssignedOrders', 'CashHandedOverByUserId') IS NULL
    ALTER TABLE dbo.AssignedOrders ADD CashHandedOverByUserId UNIQUEIDENTIFIER NULL;
GO
IF COL_LENGTH('dbo.AssignedOrders', 'CashHandedOverAmount') IS NULL
    ALTER TABLE dbo.AssignedOrders ADD CashHandedOverAmount DECIMAL(18,2) NULL;
GO
IF COL_LENGTH('dbo.AssignedOrders', 'CashSemanticsNote') IS NULL
    ALTER TABLE dbo.AssignedOrders ADD CashSemanticsNote NVARCHAR(100) NULL;
GO
IF COL_LENGTH('dbo.AssignedOrders', 'CancelReason') IS NULL
    ALTER TABLE dbo.AssignedOrders ADD CancelReason NVARCHAR(500) NULL;
GO
IF COL_LENGTH('dbo.AssignedOrders', 'IsDirectAssignment') IS NULL
    ALTER TABLE dbo.AssignedOrders ADD IsDirectAssignment BIT NOT NULL CONSTRAINT DF_AssignedOrders_IsDirectAssignment DEFAULT(0);
GO

-- Backfill ExpectedCash from Cash for cash/COD methods only; leave prepaid null.
UPDATE dbo.AssignedOrders
SET ExpectedCash = Cash,
    CashSemanticsNote = CASE
        WHEN CashCollected IS NOT NULL THEN N'LegacyCashCollected_Ambiguous'
        ELSE CashSemanticsNote
    END
WHERE ExpectedCash IS NULL
  AND Cash IS NOT NULL
  AND (
        LOWER(ISNULL(PaymentMethod, N'')) IN (N'cash', N'cod', N'c')
        OR Cash > 0
      );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AssignedOrders_Status_AcceptedBy' AND object_id = OBJECT_ID(N'dbo.AssignedOrders'))
    CREATE INDEX IX_AssignedOrders_Status_AcceptedBy ON dbo.AssignedOrders(Status, AcceptedByUserId) INCLUDE (AcceptedAt, CompletedAt);
GO

-- ----- Users: password hash + availability -----
IF COL_LENGTH('dbo.Users', 'PasswordHash') IS NULL
    ALTER TABLE dbo.Users ADD PasswordHash NVARCHAR(500) NULL;
GO
IF COL_LENGTH('dbo.Users', 'IsAvailableOnline') IS NULL
    ALTER TABLE dbo.Users ADD IsAvailableOnline BIT NOT NULL CONSTRAINT DF_Users_IsAvailableOnline DEFAULT(0);
GO
IF COL_LENGTH('dbo.Users', 'AvailabilityChangedAt') IS NULL
    ALTER TABLE dbo.Users ADD AvailabilityChangedAt DATETIME2 NULL;
GO

-- ----- OTP purpose + attempt tracking -----
IF COL_LENGTH('dbo.OTP', 'Purpose') IS NULL
    ALTER TABLE dbo.OTP ADD Purpose NVARCHAR(40) NOT NULL CONSTRAINT DF_OTP_Purpose DEFAULT(N'PasswordReset');
GO
IF COL_LENGTH('dbo.OTP', 'AttemptCount') IS NULL
    ALTER TABLE dbo.OTP ADD AttemptCount INT NOT NULL CONSTRAINT DF_OTP_AttemptCount DEFAULT(0);
GO

-- ----- Password reset authorization (single-use, purpose-bound) -----
IF OBJECT_ID(N'dbo.PasswordResetTokens', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PasswordResetTokens
    (
        Id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_PasswordResetTokens PRIMARY KEY,
        UserId UNIQUEIDENTIFIER NOT NULL,
        TokenHash NVARCHAR(128) NOT NULL,
        Purpose NVARCHAR(40) NOT NULL,
        ExpiresAt DATETIME2 NOT NULL,
        UsedAt DATETIME2 NULL,
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_PasswordResetTokens_CreatedAt DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_PasswordResetTokens_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId)
    );
    CREATE INDEX IX_PasswordResetTokens_UserId ON dbo.PasswordResetTokens(UserId);
END
GO

-- ----- Order lifecycle audit -----
IF OBJECT_ID(N'dbo.OrderLifecycleAudits', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.OrderLifecycleAudits
    (
        Id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_OrderLifecycleAudits PRIMARY KEY,
        AssignedOrderId BIGINT NOT NULL,
        ActorUserId UNIQUEIDENTIFIER NULL,
        ActorType NVARCHAR(30) NOT NULL,
        PreviousStatus NVARCHAR(30) NULL,
        NewStatus NVARCHAR(30) NOT NULL,
        Reason NVARCHAR(500) NULL,
        RequestId NVARCHAR(100) NULL,
        CashCollected DECIMAL(18,2) NULL,
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_OrderLifecycleAudits_CreatedAt DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_OrderLifecycleAudits_Orders FOREIGN KEY (AssignedOrderId) REFERENCES dbo.AssignedOrders(Id)
    );
    CREATE UNIQUE INDEX UX_OrderLifecycleAudits_RequestId
        ON dbo.OrderLifecycleAudits(RequestId)
        WHERE RequestId IS NOT NULL;
    CREATE INDEX IX_OrderLifecycleAudits_Order ON dbo.OrderLifecycleAudits(AssignedOrderId, CreatedAt);
END
GO

-- ----- Pool / direct rejections -----
IF OBJECT_ID(N'dbo.OrderRejections', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.OrderRejections
    (
        Id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_OrderRejections PRIMARY KEY,
        AssignedOrderId BIGINT NOT NULL,
        RiderUserId UNIQUEIDENTIFIER NOT NULL,
        Reason NVARCHAR(500) NULL,
        IsDirectAssignment BIT NOT NULL CONSTRAINT DF_OrderRejections_IsDirect DEFAULT(0),
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_OrderRejections_CreatedAt DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_OrderRejections_Orders FOREIGN KEY (AssignedOrderId) REFERENCES dbo.AssignedOrders(Id),
        CONSTRAINT FK_OrderRejections_Users FOREIGN KEY (RiderUserId) REFERENCES dbo.Users(UserId),
        CONSTRAINT UX_OrderRejections_Order_Rider UNIQUE (AssignedOrderId, RiderUserId)
    );
END
GO

-- ----- Availability intervals (explicit Online/Offline) -----
IF OBJECT_ID(N'dbo.RiderAvailabilityIntervals', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RiderAvailabilityIntervals
    (
        Id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_RiderAvailabilityIntervals PRIMARY KEY,
        UserId UNIQUEIDENTIFIER NOT NULL,
        StartedAt DATETIME2 NOT NULL,
        EndedAt DATETIME2 NULL,
        EndReason NVARCHAR(40) NULL, -- ToggleOff | HeartbeatExpired | Admin | CrashClose
        CONSTRAINT FK_RiderAvailabilityIntervals_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId)
    );
    CREATE INDEX IX_RiderAvailability_Open ON dbo.RiderAvailabilityIntervals(UserId) WHERE EndedAt IS NULL;
END
GO

-- ----- Admin notifications -----
IF OBJECT_ID(N'dbo.AdminNotifications', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AdminNotifications
    (
        Id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AdminNotifications PRIMARY KEY,
        StoreId NVARCHAR(50) NULL,
        Category NVARCHAR(40) NOT NULL,
        Title NVARCHAR(200) NOT NULL,
        Body NVARCHAR(500) NOT NULL,
        OrderId NVARCHAR(50) NULL,
        AssignedOrderId BIGINT NULL,
        IsRead BIT NOT NULL CONSTRAINT DF_AdminNotifications_IsRead DEFAULT(0),
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_AdminNotifications_CreatedAt DEFAULT (SYSUTCDATETIME())
    );
    CREATE INDEX IX_AdminNotifications_Store_Created ON dbo.AdminNotifications(StoreId, CreatedAt DESC);
END
GO

-- ----- POS integration key setting placeholder (value set in appsettings / ops) -----
IF NOT EXISTS (SELECT 1 FROM dbo.AppSettings WHERE SettingKey = N'PosIntegrationApiKeyConfigured')
    INSERT INTO dbo.AppSettings(SettingKey, SettingValue) VALUES (N'PosIntegrationApiKeyConfigured', N'1');
GO

PRINT N'006_ProductionLifecycle applied.';
GO
