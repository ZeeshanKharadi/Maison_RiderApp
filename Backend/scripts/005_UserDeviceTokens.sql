-- FCM device tokens for rider push notifications.
USE RiderManagement;
GO

IF OBJECT_ID(N'dbo.UserDeviceTokens', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.UserDeviceTokens
    (
        Id          BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_UserDeviceTokens PRIMARY KEY,
        UserId      UNIQUEIDENTIFIER     NOT NULL,
        Token       NVARCHAR(500)        NOT NULL,
        Platform    NVARCHAR(20)         NOT NULL CONSTRAINT DF_UserDeviceTokens_Platform DEFAULT (N'android'),
        UpdatedAt   DATETIME2            NOT NULL CONSTRAINT DF_UserDeviceTokens_UpdatedAt DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_UserDeviceTokens_User FOREIGN KEY (UserId) REFERENCES dbo.Users (UserId)
    );

    CREATE UNIQUE NONCLUSTERED INDEX UX_UserDeviceTokens_Token
        ON dbo.UserDeviceTokens (Token);

    CREATE NONCLUSTERED INDEX IX_UserDeviceTokens_User
        ON dbo.UserDeviceTokens (UserId);
END
GO

PRINT 'UserDeviceTokens table ready.';
GO
