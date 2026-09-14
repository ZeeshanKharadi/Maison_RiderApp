-- =============================================================================
-- 007_Phase1Corrections.sql
-- TokenVersion (JWT invalidation), handover request idempotency support.
-- Idempotent / additive.
-- =============================================================================
SET NOCOUNT ON;
GO

IF COL_LENGTH('dbo.Users', 'TokenVersion') IS NULL
BEGIN
    ALTER TABLE dbo.Users ADD TokenVersion INT NOT NULL
        CONSTRAINT DF_Users_TokenVersion DEFAULT(0);
END
GO

IF COL_LENGTH('dbo.AssignedOrders', 'HandoverRequestId') IS NULL
BEGIN
    ALTER TABLE dbo.AssignedOrders ADD HandoverRequestId NVARCHAR(100) NULL;
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_AssignedOrders_HandoverRequestId'
      AND object_id = OBJECT_ID(N'dbo.AssignedOrders'))
BEGIN
    CREATE UNIQUE INDEX UX_AssignedOrders_HandoverRequestId
        ON dbo.AssignedOrders(HandoverRequestId)
        WHERE HandoverRequestId IS NOT NULL;
END
GO

PRINT N'007_Phase1Corrections applied.';
GO
