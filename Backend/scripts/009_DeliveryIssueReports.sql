-- =============================================================================
-- RiderManagement — Delivery issue reports (rider → store ops)
-- Safe to re-run. Does not alter AssignedOrders status / COD columns.
-- =============================================================================
USE RiderManagement;
GO

IF OBJECT_ID(N'dbo.DeliveryIssueReports', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.DeliveryIssueReports
    (
        Id               BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_DeliveryIssueReports PRIMARY KEY,
        AssignedOrderId  BIGINT NOT NULL,
        RiderUserId      UNIQUEIDENTIFIER NOT NULL,
        ReasonCode       NVARCHAR(40) NOT NULL,
        Note             NVARCHAR(500) NULL,
        RequestId        NVARCHAR(100) NULL,
        CreatedAt        DATETIME2 NOT NULL CONSTRAINT DF_DeliveryIssueReports_CreatedAt DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_DeliveryIssueReports_AssignedOrders
            FOREIGN KEY (AssignedOrderId) REFERENCES dbo.AssignedOrders(Id) ON DELETE CASCADE,
        CONSTRAINT FK_DeliveryIssueReports_Users
            FOREIGN KEY (RiderUserId) REFERENCES dbo.Users(UserId)
    );
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_DeliveryIssueReports_AssignedOrderId'
      AND object_id = OBJECT_ID(N'dbo.DeliveryIssueReports'))
BEGIN
    CREATE INDEX IX_DeliveryIssueReports_AssignedOrderId
        ON dbo.DeliveryIssueReports(AssignedOrderId);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_DeliveryIssueReports_CreatedAt'
      AND object_id = OBJECT_ID(N'dbo.DeliveryIssueReports'))
BEGIN
    CREATE INDEX IX_DeliveryIssueReports_CreatedAt
        ON dbo.DeliveryIssueReports(CreatedAt DESC);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_DeliveryIssueReports_RequestId'
      AND object_id = OBJECT_ID(N'dbo.DeliveryIssueReports'))
BEGIN
    CREATE UNIQUE INDEX UX_DeliveryIssueReports_RequestId
        ON dbo.DeliveryIssueReports(RequestId)
        WHERE RequestId IS NOT NULL;
END
GO

PRINT N'009_DeliveryIssueReports applied.';
GO
