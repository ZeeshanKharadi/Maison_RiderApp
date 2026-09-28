-- =============================================================================
-- RiderManagement — Controlled failed-delivery / return-to-store fields
-- Safe to re-run. Does not alter COD cash columns or zero collected amounts.
-- =============================================================================
USE RiderManagement;
GO

IF COL_LENGTH('dbo.AssignedOrders', 'FailureRequestStatus') IS NULL
    ALTER TABLE dbo.AssignedOrders ADD FailureRequestStatus NVARCHAR(30) NULL;
GO
IF COL_LENGTH('dbo.AssignedOrders', 'FailureReasonCode') IS NULL
    ALTER TABLE dbo.AssignedOrders ADD FailureReasonCode NVARCHAR(40) NULL;
GO
IF COL_LENGTH('dbo.AssignedOrders', 'FailureNote') IS NULL
    ALTER TABLE dbo.AssignedOrders ADD FailureNote NVARCHAR(500) NULL;
GO
IF COL_LENGTH('dbo.AssignedOrders', 'FailureRequestId') IS NULL
    ALTER TABLE dbo.AssignedOrders ADD FailureRequestId NVARCHAR(100) NULL;
GO
IF COL_LENGTH('dbo.AssignedOrders', 'FailureIssueReportId') IS NULL
    ALTER TABLE dbo.AssignedOrders ADD FailureIssueReportId BIGINT NULL;
GO
IF COL_LENGTH('dbo.AssignedOrders', 'FailureRequestedAt') IS NULL
    ALTER TABLE dbo.AssignedOrders ADD FailureRequestedAt DATETIME2 NULL;
GO
IF COL_LENGTH('dbo.AssignedOrders', 'FailureDecidedAt') IS NULL
    ALTER TABLE dbo.AssignedOrders ADD FailureDecidedAt DATETIME2 NULL;
GO
IF COL_LENGTH('dbo.AssignedOrders', 'FailureDecidedByUserId') IS NULL
    ALTER TABLE dbo.AssignedOrders ADD FailureDecidedByUserId UNIQUEIDENTIFIER NULL;
GO
IF COL_LENGTH('dbo.AssignedOrders', 'FailureDecisionNote') IS NULL
    ALTER TABLE dbo.AssignedOrders ADD FailureDecisionNote NVARCHAR(500) NULL;
GO
IF COL_LENGTH('dbo.AssignedOrders', 'StatusBeforeReturn') IS NULL
    ALTER TABLE dbo.AssignedOrders ADD StatusBeforeReturn NVARCHAR(30) NULL;
GO
IF COL_LENGTH('dbo.AssignedOrders', 'RiderReturnedAt') IS NULL
    ALTER TABLE dbo.AssignedOrders ADD RiderReturnedAt DATETIME2 NULL;
GO
IF COL_LENGTH('dbo.AssignedOrders', 'StoreReceivedAt') IS NULL
    ALTER TABLE dbo.AssignedOrders ADD StoreReceivedAt DATETIME2 NULL;
GO
IF COL_LENGTH('dbo.AssignedOrders', 'StoreReceivedByUserId') IS NULL
    ALTER TABLE dbo.AssignedOrders ADD StoreReceivedByUserId UNIQUEIDENTIFIER NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_AssignedOrders_FailureRequestId'
      AND object_id = OBJECT_ID(N'dbo.AssignedOrders'))
BEGIN
    CREATE UNIQUE INDEX UX_AssignedOrders_FailureRequestId
        ON dbo.AssignedOrders(FailureRequestId)
        WHERE FailureRequestId IS NOT NULL;
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_AssignedOrders_FailureIssueReport'
      AND parent_object_id = OBJECT_ID(N'dbo.AssignedOrders'))
   AND OBJECT_ID(N'dbo.DeliveryIssueReports', N'U') IS NOT NULL
BEGIN
    ALTER TABLE dbo.AssignedOrders
        ADD CONSTRAINT FK_AssignedOrders_FailureIssueReport
        FOREIGN KEY (FailureIssueReportId) REFERENCES dbo.DeliveryIssueReports(Id);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_AssignedOrders_FailureDecidedBy'
      AND parent_object_id = OBJECT_ID(N'dbo.AssignedOrders'))
BEGIN
    ALTER TABLE dbo.AssignedOrders
        ADD CONSTRAINT FK_AssignedOrders_FailureDecidedBy
        FOREIGN KEY (FailureDecidedByUserId) REFERENCES dbo.Users(UserId);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_AssignedOrders_StoreReceivedBy'
      AND parent_object_id = OBJECT_ID(N'dbo.AssignedOrders'))
BEGIN
    ALTER TABLE dbo.AssignedOrders
        ADD CONSTRAINT FK_AssignedOrders_StoreReceivedBy
        FOREIGN KEY (StoreReceivedByUserId) REFERENCES dbo.Users(UserId);
END
GO

PRINT N'011_FailedDeliveryReturn applied.';
GO
