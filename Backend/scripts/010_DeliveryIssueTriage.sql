-- =============================================================================
-- RiderManagement — Delivery issue triage (status + history)
-- Safe to re-run. Does not alter AssignedOrders status / COD columns.
-- =============================================================================
USE RiderManagement;
GO

IF COL_LENGTH('dbo.DeliveryIssueReports', 'Status') IS NULL
    ALTER TABLE dbo.DeliveryIssueReports ADD Status NVARCHAR(20) NOT NULL
        CONSTRAINT DF_DeliveryIssueReports_Status DEFAULT (N'New');
GO

IF COL_LENGTH('dbo.DeliveryIssueReports', 'InternalNote') IS NULL
    ALTER TABLE dbo.DeliveryIssueReports ADD InternalNote NVARCHAR(1000) NULL;
GO

IF COL_LENGTH('dbo.DeliveryIssueReports', 'AcknowledgedByUserId') IS NULL
    ALTER TABLE dbo.DeliveryIssueReports ADD AcknowledgedByUserId UNIQUEIDENTIFIER NULL;
GO

IF COL_LENGTH('dbo.DeliveryIssueReports', 'AcknowledgedAt') IS NULL
    ALTER TABLE dbo.DeliveryIssueReports ADD AcknowledgedAt DATETIME2 NULL;
GO

IF COL_LENGTH('dbo.DeliveryIssueReports', 'ClosedByUserId') IS NULL
    ALTER TABLE dbo.DeliveryIssueReports ADD ClosedByUserId UNIQUEIDENTIFIER NULL;
GO

IF COL_LENGTH('dbo.DeliveryIssueReports', 'ClosedAt') IS NULL
    ALTER TABLE dbo.DeliveryIssueReports ADD ClosedAt DATETIME2 NULL;
GO

IF COL_LENGTH('dbo.DeliveryIssueReports', 'UpdatedAt') IS NULL
    ALTER TABLE dbo.DeliveryIssueReports ADD UpdatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_DeliveryIssueReports_UpdatedAt DEFAULT (SYSUTCDATETIME());
GO

IF COL_LENGTH('dbo.DeliveryIssueReports', 'RowVersion') IS NULL
    ALTER TABLE dbo.DeliveryIssueReports ADD RowVersion ROWVERSION NOT NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_DeliveryIssueReports_AcknowledgedBy'
      AND parent_object_id = OBJECT_ID(N'dbo.DeliveryIssueReports'))
BEGIN
    ALTER TABLE dbo.DeliveryIssueReports
        ADD CONSTRAINT FK_DeliveryIssueReports_AcknowledgedBy
        FOREIGN KEY (AcknowledgedByUserId) REFERENCES dbo.Users(UserId);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_DeliveryIssueReports_ClosedBy'
      AND parent_object_id = OBJECT_ID(N'dbo.DeliveryIssueReports'))
BEGIN
    ALTER TABLE dbo.DeliveryIssueReports
        ADD CONSTRAINT FK_DeliveryIssueReports_ClosedBy
        FOREIGN KEY (ClosedByUserId) REFERENCES dbo.Users(UserId);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_DeliveryIssueReports_Status_CreatedAt'
      AND object_id = OBJECT_ID(N'dbo.DeliveryIssueReports'))
BEGIN
    CREATE INDEX IX_DeliveryIssueReports_Status_CreatedAt
        ON dbo.DeliveryIssueReports(Status, CreatedAt DESC);
END
GO

IF OBJECT_ID(N'dbo.DeliveryIssueTriageEvents', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.DeliveryIssueTriageEvents
    (
        Id                     BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_DeliveryIssueTriageEvents PRIMARY KEY,
        DeliveryIssueReportId  BIGINT NOT NULL,
        ActorUserId            UNIQUEIDENTIFIER NULL,
        ActorType              NVARCHAR(30) NOT NULL CONSTRAINT DF_DeliveryIssueTriageEvents_ActorType DEFAULT (N'Admin'),
        Action                 NVARCHAR(30) NOT NULL,
        PreviousStatus         NVARCHAR(20) NULL,
        NewStatus              NVARCHAR(20) NULL,
        InternalNote           NVARCHAR(1000) NULL,
        CreatedAt              DATETIME2 NOT NULL CONSTRAINT DF_DeliveryIssueTriageEvents_CreatedAt DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_DeliveryIssueTriageEvents_Reports
            FOREIGN KEY (DeliveryIssueReportId) REFERENCES dbo.DeliveryIssueReports(Id) ON DELETE CASCADE,
        CONSTRAINT FK_DeliveryIssueTriageEvents_Users
            FOREIGN KEY (ActorUserId) REFERENCES dbo.Users(UserId)
    );
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_DeliveryIssueTriageEvents_ReportId'
      AND object_id = OBJECT_ID(N'dbo.DeliveryIssueTriageEvents'))
BEGIN
    CREATE INDEX IX_DeliveryIssueTriageEvents_ReportId
        ON dbo.DeliveryIssueTriageEvents(DeliveryIssueReportId, CreatedAt, Id);
END
GO

-- Backfill history for existing reports that predate triage.
IF OBJECT_ID(N'dbo.DeliveryIssueTriageEvents', N'U') IS NOT NULL
   AND OBJECT_ID(N'dbo.DeliveryIssueReports', N'U') IS NOT NULL
BEGIN
    INSERT INTO dbo.DeliveryIssueTriageEvents
        (DeliveryIssueReportId, ActorUserId, ActorType, Action, PreviousStatus, NewStatus, InternalNote, CreatedAt)
    SELECT r.Id, r.RiderUserId, N'Rider', N'Reported', NULL, ISNULL(r.Status, N'New'), NULL, r.CreatedAt
    FROM dbo.DeliveryIssueReports r
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.DeliveryIssueTriageEvents e
        WHERE e.DeliveryIssueReportId = r.Id AND e.Action = N'Reported');
END
GO

PRINT N'010_DeliveryIssueTriage applied.';
GO
