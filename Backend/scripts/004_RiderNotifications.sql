-- Rider in-app / push notification queue (created when orders are assigned).
USE RiderManagement;
GO

IF OBJECT_ID(N'dbo.RiderNotifications', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RiderNotifications
    (
        Id              BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_RiderNotifications PRIMARY KEY,
        UserId          UNIQUEIDENTIFIER     NOT NULL,
        Category        NVARCHAR(30)         NOT NULL CONSTRAINT DF_RiderNotifications_Category DEFAULT (N'orders'),
        Title           NVARCHAR(200)        NOT NULL,
        Description     NVARCHAR(500)        NOT NULL,
        OrderId         NVARCHAR(50)         NULL,
        AssignedOrderId BIGINT               NULL,
        Priority        NVARCHAR(20)         NOT NULL CONSTRAINT DF_RiderNotifications_Priority DEFAULT (N'high'),
        IsRead          BIT                  NOT NULL CONSTRAINT DF_RiderNotifications_IsRead DEFAULT (0),
        CreatedAt       DATETIME2            NOT NULL CONSTRAINT DF_RiderNotifications_CreatedAt DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_RiderNotifications_User FOREIGN KEY (UserId) REFERENCES dbo.Users (UserId)
    );

    CREATE NONCLUSTERED INDEX IX_RiderNotifications_User_Created
        ON dbo.RiderNotifications (UserId, CreatedAt DESC);

    CREATE NONCLUSTERED INDEX IX_RiderNotifications_User_Unread
        ON dbo.RiderNotifications (UserId, IsRead)
        WHERE IsRead = 0;
END
GO

PRINT 'RiderNotifications table ready.';
GO
