-- Rider change float ledger (issue → acknowledge → return).
-- Safe to re-run (idempotent).
USE RiderManagement;
GO

IF OBJECT_ID(N'dbo.RiderFloatLedger', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RiderFloatLedger
    (
        Id                    BIGINT           NOT NULL IDENTITY(1,1)
            CONSTRAINT PK_RiderFloatLedger PRIMARY KEY,
        RiderUserId           UNIQUEIDENTIFIER NOT NULL,
        StoreId               NVARCHAR(50)     NOT NULL,
        Amount                DECIMAL(18,2)    NOT NULL,
        EntryType             NVARCHAR(20)     NOT NULL, -- Issue | Return
        -- Issue: PendingAck until rider acknowledges; Return: NULL
        Status                NVARCHAR(20)     NULL,
        AcknowledgedAt        DATETIME2        NULL,
        AcknowledgedByUserId  UNIQUEIDENTIFIER NULL,
        AckRequestId          NVARCHAR(100)    NULL,
        ActorUserId           UNIQUEIDENTIFIER NOT NULL,
        Reason                NVARCHAR(500)    NULL,
        RequestId             NVARCHAR(100)    NOT NULL,
        CreatedAt             DATETIME2        NOT NULL
            CONSTRAINT DF_RiderFloatLedger_CreatedAt DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_RiderFloatLedger_EntryType CHECK (EntryType IN (N'Issue', N'Return')),
        CONSTRAINT CK_RiderFloatLedger_Amount CHECK (Amount > 0),
        CONSTRAINT CK_RiderFloatLedger_IssueStatus CHECK (
            (EntryType = N'Issue' AND Status IN (N'PendingAck', N'Acknowledged'))
            OR (EntryType = N'Return' AND Status IS NULL)
        )
    );

    CREATE UNIQUE INDEX UX_RiderFloatLedger_RequestId
        ON dbo.RiderFloatLedger (RequestId);

    CREATE UNIQUE INDEX UX_RiderFloatLedger_AckRequestId
        ON dbo.RiderFloatLedger (AckRequestId)
        WHERE AckRequestId IS NOT NULL;

    CREATE NONCLUSTERED INDEX IX_RiderFloatLedger_Rider_Created
        ON dbo.RiderFloatLedger (RiderUserId, CreatedAt DESC);

    CREATE NONCLUSTERED INDEX IX_RiderFloatLedger_Store_Pending
        ON dbo.RiderFloatLedger (StoreId, Status)
        WHERE EntryType = N'Issue' AND Status = N'PendingAck';
END
GO
