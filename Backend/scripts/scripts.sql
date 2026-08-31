-- =============================================================================
-- RiderManagement auth scripts
-- Source: KFCMobileApp_ESS_Backend script/script.txt (adapted for AES passwordencrypted)
-- Run entire file in SSMS (Execute). Creates DB + auth tables + seeds.
-- =============================================================================

USE master;
GO

IF DB_ID(N'RiderManagement') IS NULL
BEGIN
    CREATE DATABASE RiderManagement;
END
GO

USE RiderManagement;
GO

-- -----------------------------------------------------------------------------
-- 1) USERS
-- -----------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Users
    (
        UserId                  UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_Users PRIMARY KEY
            CONSTRAINT DF_Users_UserId DEFAULT (NEWID()),
        Username                VARCHAR(100)     NULL,
        Email                   VARCHAR(255)     NULL,
        PhoneNumber             VARCHAR(50)      NULL,
        ThirdPartyEmployeeId    VARCHAR(200)     NULL,
        PasswordHash            VARCHAR(255)     NULL,
        passwordencrypted       VARBINARY(MAX)   NULL,
        FirstName               VARCHAR(100)     NULL,
        LastName                VARCHAR(100)     NULL,
        ProfileImageUrl         VARCHAR(500)     NULL,
        IsActive                BIT              NOT NULL CONSTRAINT DF_Users_IsActive DEFAULT (1),
        IsVerified              BIT              NOT NULL CONSTRAINT DF_Users_IsVerified DEFAULT (0),
        CreatedAt               DATETIME2        NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt               DATETIME2        NULL,
        DeletedAt               DATETIME2        NULL,
        FatherName              NVARCHAR(200)    NULL,
        DateOfBirth             DATE             NULL,
        CNIC                    NVARCHAR(20)     NULL,
        EmergencyContactNumber  NVARCHAR(50)     NULL,
        EmergencyContactName    NVARCHAR(200)    NULL,
        Position                NVARCHAR(200)    NULL,
        ReportTo                NVARCHAR(200)    NULL,
        Grade                   NVARCHAR(50)     NULL,
        DateOfJoining           DATE             NULL,
        BankAccountNumber       NVARCHAR(50)     NULL,
        BankName                NVARCHAR(100)    NULL,
        DependentName           NVARCHAR(100)    NULL,
        DependentRelationship   NVARCHAR(100)    NULL,
        DependentdateOfbirth    DATE             NULL,
        PayGroup                VARCHAR(100)     NULL,
        department              VARCHAR(100)     NULL,
        costCenter              VARCHAR(100)     NULL
    );

    CREATE UNIQUE NONCLUSTERED INDEX UX_Users_ThirdPartyEmployeeId
        ON dbo.Users (ThirdPartyEmployeeId)
        WHERE ThirdPartyEmployeeId IS NOT NULL;

    CREATE NONCLUSTERED INDEX IX_Users_Email
        ON dbo.Users (Email)
        WHERE Email IS NOT NULL;
END
GO

IF COL_LENGTH('dbo.Users', 'passwordencrypted') IS NULL
    ALTER TABLE dbo.Users ADD passwordencrypted VARBINARY(MAX) NULL;
GO
IF COL_LENGTH('dbo.Users', 'PasswordHash') IS NULL
    ALTER TABLE dbo.Users ADD PasswordHash VARCHAR(255) NULL;
GO
IF COL_LENGTH('dbo.Users', 'FatherName') IS NULL
    ALTER TABLE dbo.Users ADD FatherName NVARCHAR(200) NULL;
GO
IF COL_LENGTH('dbo.Users', 'DateOfBirth') IS NULL
    ALTER TABLE dbo.Users ADD DateOfBirth DATE NULL;
GO
IF COL_LENGTH('dbo.Users', 'CNIC') IS NULL
    ALTER TABLE dbo.Users ADD CNIC NVARCHAR(20) NULL;
GO
IF COL_LENGTH('dbo.Users', 'EmergencyContactNumber') IS NULL
    ALTER TABLE dbo.Users ADD EmergencyContactNumber NVARCHAR(50) NULL;
GO
IF COL_LENGTH('dbo.Users', 'EmergencyContactName') IS NULL
    ALTER TABLE dbo.Users ADD EmergencyContactName NVARCHAR(200) NULL;
GO
IF COL_LENGTH('dbo.Users', 'Position') IS NULL
    ALTER TABLE dbo.Users ADD Position NVARCHAR(200) NULL;
GO
IF COL_LENGTH('dbo.Users', 'ReportTo') IS NULL
    ALTER TABLE dbo.Users ADD ReportTo NVARCHAR(200) NULL;
GO
IF COL_LENGTH('dbo.Users', 'Grade') IS NULL
    ALTER TABLE dbo.Users ADD Grade NVARCHAR(50) NULL;
GO
IF COL_LENGTH('dbo.Users', 'DateOfJoining') IS NULL
    ALTER TABLE dbo.Users ADD DateOfJoining DATE NULL;
GO
IF COL_LENGTH('dbo.Users', 'BankAccountNumber') IS NULL
    ALTER TABLE dbo.Users ADD BankAccountNumber NVARCHAR(50) NULL;
GO
IF COL_LENGTH('dbo.Users', 'BankName') IS NULL
    ALTER TABLE dbo.Users ADD BankName NVARCHAR(100) NULL;
GO
IF COL_LENGTH('dbo.Users', 'DependentName') IS NULL
    ALTER TABLE dbo.Users ADD DependentName NVARCHAR(100) NULL;
GO
IF COL_LENGTH('dbo.Users', 'DependentRelationship') IS NULL
    ALTER TABLE dbo.Users ADD DependentRelationship NVARCHAR(100) NULL;
GO
IF COL_LENGTH('dbo.Users', 'DependentdateOfbirth') IS NULL
    ALTER TABLE dbo.Users ADD DependentdateOfbirth DATE NULL;
GO
IF COL_LENGTH('dbo.Users', 'PayGroup') IS NULL
    ALTER TABLE dbo.Users ADD PayGroup VARCHAR(100) NULL;
GO
IF COL_LENGTH('dbo.Users', 'department') IS NULL
    ALTER TABLE dbo.Users ADD department VARCHAR(100) NULL;
GO
IF COL_LENGTH('dbo.Users', 'costCenter') IS NULL
    ALTER TABLE dbo.Users ADD costCenter VARCHAR(100) NULL;
GO
IF COL_LENGTH('dbo.Users', 'FirstName') IS NULL
    ALTER TABLE dbo.Users ADD FirstName VARCHAR(100) NULL;
GO
IF COL_LENGTH('dbo.Users', 'LastName') IS NULL
    ALTER TABLE dbo.Users ADD LastName VARCHAR(100) NULL;
GO
IF COL_LENGTH('dbo.Users', 'UpdatedAt') IS NULL
    ALTER TABLE dbo.Users ADD UpdatedAt DATETIME2 NULL;
GO

-- -----------------------------------------------------------------------------
-- 2) ROLES
-- -----------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.Roles', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Roles
    (
        RoleId      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Roles PRIMARY KEY,
        RoleName    VARCHAR(100)      NOT NULL,
        Description VARCHAR(255)      NULL,
        IsActive    BIT               NOT NULL CONSTRAINT DF_Roles_IsActive DEFAULT (1),
        CreatedAt   DATETIME2         NOT NULL CONSTRAINT DF_Roles_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt   DATETIME2         NULL,
        CONSTRAINT UQ_Roles_RoleName UNIQUE (RoleName)
    );
END
GO

-- -----------------------------------------------------------------------------
-- 3) PERMISSIONS
-- -----------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.Permissions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Permissions
    (
        PermissionId   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Permissions PRIMARY KEY,
        PermissionName VARCHAR(150)      NOT NULL,
        Description    VARCHAR(255)      NULL,
        DisplayName    VARCHAR(200)      NULL,
        CreatedAt      DATETIME2         NOT NULL CONSTRAINT DF_Permissions_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt      DATETIME2         NULL,
        CONSTRAINT UQ_Permissions_PermissionName UNIQUE (PermissionName)
    );
END
GO

IF COL_LENGTH('dbo.Permissions', 'DisplayName') IS NULL
BEGIN
    ALTER TABLE dbo.Permissions ADD DisplayName VARCHAR(200) NULL;
END
GO

-- -----------------------------------------------------------------------------
-- 4) ROLEPERMISSION
-- -----------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.RolePermission', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RolePermission
    (
        RolePermissionId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_RolePermission PRIMARY KEY,
        RoleId           INT               NOT NULL,
        PermissionId     INT               NOT NULL,
        CreatedAt        DATETIME2         NOT NULL CONSTRAINT DF_RolePermission_CreatedAt DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_RolePermission_Role
            FOREIGN KEY (RoleId) REFERENCES dbo.Roles (RoleId),
        CONSTRAINT FK_RolePermission_Permission
            FOREIGN KEY (PermissionId) REFERENCES dbo.Permissions (PermissionId),
        CONSTRAINT UQ_RolePermission UNIQUE (RoleId, PermissionId)
    );
END
GO

-- -----------------------------------------------------------------------------
-- 5) USERROLES
-- -----------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.UserRoles', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.UserRoles
    (
        UserRoleId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_UserRoles PRIMARY KEY,
        UserId     UNIQUEIDENTIFIER  NOT NULL,
        RoleId     INT               NOT NULL,
        AssignedAt DATETIME2         NOT NULL CONSTRAINT DF_UserRoles_AssignedAt DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_UserRoles_User FOREIGN KEY (UserId) REFERENCES dbo.Users (UserId),
        CONSTRAINT FK_UserRoles_Role FOREIGN KEY (RoleId) REFERENCES dbo.Roles (RoleId),
        CONSTRAINT UQ_UserRoles UNIQUE (UserId, RoleId)
    );
END
GO

-- -----------------------------------------------------------------------------
-- 6) GRADEROLLES
-- -----------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.GradeRoles', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.GradeRoles
    (
        GradeRoleId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_GradeRoles PRIMARY KEY,
        Grade       VARCHAR(200)      NOT NULL,
        RoleId      INT               NOT NULL,
        AssignedAt  DATETIME2         NOT NULL CONSTRAINT DF_GradeRoles_AssignedAt DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_GradeRoles_Role FOREIGN KEY (RoleId) REFERENCES dbo.Roles (RoleId)
    );
END
GO

-- -----------------------------------------------------------------------------
-- 7) OTP
-- -----------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.OTP', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.OTP
    (
        OtpId     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_OTP PRIMARY KEY,
        UserId    UNIQUEIDENTIFIER  NULL,
        OtpCode   VARCHAR(10)       NOT NULL,
        Channel   VARCHAR(50)       NOT NULL,
        ExpiresAt DATETIME2         NOT NULL,
        IsUsed    BIT               NOT NULL CONSTRAINT DF_OTP_IsUsed DEFAULT (0),
        CreatedAt DATETIME2         NOT NULL CONSTRAINT DF_OTP_CreatedAt DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_OTP_User FOREIGN KEY (UserId) REFERENCES dbo.Users (UserId)
    );

    CREATE NONCLUSTERED INDEX IX_OTP_UserId_CreatedAt
        ON dbo.OTP (UserId, CreatedAt DESC)
        INCLUDE (OtpCode, IsUsed, ExpiresAt);
END
GO

-- -----------------------------------------------------------------------------
-- 8) USERTOKENS
-- -----------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.UserTokens', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.UserTokens
    (
        TokenId    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_UserTokens PRIMARY KEY,
        UserId     UNIQUEIDENTIFIER  NOT NULL,
        Token      VARCHAR(500)      NOT NULL,
        TokenType  VARCHAR(50)       NOT NULL,
        ExpiresAt  DATETIME2         NULL,
        RevokedAt  DATETIME2         NULL,
        CreatedAt  DATETIME2         NOT NULL CONSTRAINT DF_UserTokens_CreatedAt DEFAULT (SYSUTCDATETIME()),
        LastUsedAt DATETIME2         NULL,
        CONSTRAINT FK_UserTokens_User FOREIGN KEY (UserId) REFERENCES dbo.Users (UserId)
    );
END
GO

-- -----------------------------------------------------------------------------
-- 9) USERREFRESHTOKENS
-- -----------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.UserRefreshTokens', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.UserRefreshTokens
    (
        Id           BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_UserRefreshTokens PRIMARY KEY,
        UserId       UNIQUEIDENTIFIER     NOT NULL,
        RefreshToken NVARCHAR(500)        NOT NULL,
        ExpiresAt    DATETIME2            NOT NULL,
        CreatedAt    DATETIME2            NOT NULL CONSTRAINT DF_URT_CreatedAt DEFAULT (SYSUTCDATETIME()),
        IsRevoked    BIT                  NOT NULL CONSTRAINT DF_URT_IsRevoked DEFAULT (0),
        CONSTRAINT FK_URT_Users FOREIGN KEY (UserId) REFERENCES dbo.Users (UserId)
    );

    CREATE NONCLUSTERED INDEX IX_URT_RefreshToken
        ON dbo.UserRefreshTokens (RefreshToken)
        WHERE IsRevoked = 0;
END
GO

-- -----------------------------------------------------------------------------
-- 10) DOCUMENTACKNOWLEDGEMENTS
-- -----------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.DocumentAcknowledgements', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.DocumentAcknowledgements
    (
        Id             UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_DocumentAcknowledgements PRIMARY KEY
            CONSTRAINT DF_DocAck_Id DEFAULT (NEWID()),
        UserId         UNIQUEIDENTIFIER NOT NULL,
        DocumentName   NVARCHAR(255)    NOT NULL,
        AcknowledgedAt DATETIME2(3)     NOT NULL CONSTRAINT DF_DocAck_At DEFAULT (GETDATE()),
        CONSTRAINT FK_DocumentAcknowledgements_Users
            FOREIGN KEY (UserId) REFERENCES dbo.Users (UserId) ON DELETE CASCADE
    );
END
GO

-- -----------------------------------------------------------------------------
-- 11) SEED roles + permissions
-- -----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE RoleName = 'Rider')
BEGIN
    INSERT INTO dbo.Roles (RoleName, Description, IsActive, CreatedAt)
    VALUES ('Rider', 'Default delivery rider role', 1, SYSUTCDATETIME());
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE RoleName = 'Administrator')
BEGIN
    INSERT INTO dbo.Roles (RoleName, Description, IsActive, CreatedAt)
    VALUES ('Administrator', 'System administrator', 1, SYSUTCDATETIME());
END
GO

MERGE dbo.Permissions AS t
USING (VALUES
    ('orders.view',        'View available / active orders',       'Orders - View'),
    ('orders.accept',      'Accept and reject delivery offers',    'Orders - Accept / Reject'),
    ('orders.complete',    'Complete active delivery workflow',    'Orders - Complete'),
    ('wallet.view',        'View wallet balance and transactions', 'Wallet - View'),
    ('wallet.withdraw',    'Request withdrawals',                  'Wallet - Withdraw'),
    ('history.view',       'View delivery archive',                'History - View'),
    ('performance.view',   'View performance metrics',             'Performance - View'),
    ('profile.edit',       'Update rider profile',                 'Profile - Edit'),
    ('notifications.view', 'View notification center',             'Notifications - View'),
    ('user_management',    'Activate / deactivate users',          'User Management'),
    ('role_management',    'Create and assign roles',              'Role Management')
) AS s (PermissionName, Description, DisplayName)
ON t.PermissionName = s.PermissionName
WHEN NOT MATCHED THEN
    INSERT (PermissionName, Description, DisplayName, CreatedAt)
    VALUES (s.PermissionName, s.Description, s.DisplayName, SYSUTCDATETIME())
WHEN MATCHED THEN
    UPDATE SET
        t.Description = s.Description,
        t.DisplayName = s.DisplayName;
GO

DECLARE @RiderRoleId INT = (SELECT TOP 1 RoleId FROM dbo.Roles WHERE RoleName = N'Rider');

IF @RiderRoleId IS NOT NULL
BEGIN
    INSERT INTO dbo.RolePermission (RoleId, PermissionId, CreatedAt)
    SELECT @RiderRoleId, p.PermissionId, SYSUTCDATETIME()
    FROM dbo.Permissions p
    WHERE p.PermissionName IN (
        'orders.view', 'orders.accept', 'orders.complete',
        'wallet.view', 'wallet.withdraw',
        'history.view', 'performance.view',
        'profile.edit', 'notifications.view'
    )
      AND NOT EXISTS (
          SELECT 1 FROM dbo.RolePermission rp
          WHERE rp.RoleId = @RiderRoleId AND rp.PermissionId = p.PermissionId
      );
END
GO

-- Optional GradeRoles seed (edit Grade if needed):
-- DECLARE @RiderRoleId INT = (SELECT TOP 1 RoleId FROM dbo.Roles WHERE RoleName = N'Rider');
-- IF @RiderRoleId IS NOT NULL
--    AND NOT EXISTS (SELECT 1 FROM dbo.GradeRoles WHERE Grade = N'RIDER' AND RoleId = @RiderRoleId)
--     INSERT INTO dbo.GradeRoles (Grade, RoleId, AssignedAt)
--     VALUES (N'RIDER', @RiderRoleId, SYSUTCDATETIME());

-- -----------------------------------------------------------------------------
-- 12) SEED demo users (set password via API UpdatePassword)
--     Login userid = ThirdPartyEmployeeId
-- -----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE ThirdPartyEmployeeId = N'RD-9921')
BEGIN
    DECLARE @RiderUserId UNIQUEIDENTIFIER = NEWID();
    DECLARE @RiderRoleId2 INT = (SELECT TOP 1 RoleId FROM dbo.Roles WHERE RoleName = N'Rider');

    INSERT INTO dbo.Users
    (
        UserId, Username, Email, PhoneNumber, ThirdPartyEmployeeId,
        IsActive, IsVerified, CreatedAt,
        Position, Grade, department, PayGroup
    )
    VALUES
    (
        @RiderUserId,
        'Alex Rivera',
        'alex.rider@rapiddelivery.com',
        '+15552018841',
        N'RD-9921',
        1, 1, SYSUTCDATETIME(),
        N'Rider', N'RIDER', N'Delivery', N'Standard'
    );

    IF @RiderRoleId2 IS NOT NULL
    BEGIN
        INSERT INTO dbo.UserRoles (UserId, RoleId, AssignedAt)
        VALUES (@RiderUserId, @RiderRoleId2, SYSUTCDATETIME());
    END
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE ThirdPartyEmployeeId = N'000000')
BEGIN
    INSERT INTO dbo.Users
    (
        UserId, Username, Email, ThirdPartyEmployeeId,
        IsActive, IsVerified, CreatedAt, Position
    )
    VALUES
    (
        NEWID(),
        N'superadmin',
        N'admin123@admin.com',
        N'000000',
        1, 1, SYSUTCDATETIME(),
        N'System Administrator'
    );
END
GO

-- -----------------------------------------------------------------------------
-- 13) ASSIGNED ORDER TABLES (AssignOrder endpoint)
--     Only rows created via AssignOrder appear in rider available-order lists.
-- -----------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.AssignedOrderBatches', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AssignedOrderBatches
    (
        Id        BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AssignedOrderBatches PRIMARY KEY,
        [Time]    NVARCHAR(50)         NULL,
        StoreId   NVARCHAR(50)         NOT NULL,
        CreatedAt DATETIME2            NOT NULL CONSTRAINT DF_AOB_CreatedAt DEFAULT (SYSUTCDATETIME())
    );

    CREATE NONCLUSTERED INDEX IX_AssignedOrderBatches_StoreId
        ON dbo.AssignedOrderBatches (StoreId);
END
GO

IF OBJECT_ID(N'dbo.AssignedOrders', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AssignedOrders
    (
        Id                BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AssignedOrders PRIMARY KEY,
        BatchId           BIGINT               NOT NULL,
        OrderId           NVARCHAR(50)         NOT NULL,
        OrderNo           NVARCHAR(50)         NULL,
        OrderTypeId       NVARCHAR(20)         NULL,
        OrderState        NVARCHAR(50)         NULL,
        Comment           NVARCHAR(500)        NULL,
        LastName          NVARCHAR(100)        NULL,
        FirstName         NVARCHAR(100)        NULL,
        City              NVARCHAR(100)        NULL,
        Street            NVARCHAR(200)        NULL,
        AddressNo         NVARCHAR(50)         NULL,
        PostCode          NVARCHAR(50)         NULL,
        SecondaryAddress  NVARCHAR(200)        NULL,
        Lat               FLOAT                NULL,
        Lng               FLOAT                NULL,
        Phone             NVARCHAR(50)         NULL,
        OrderTotal        DECIMAL(18,2)        NOT NULL CONSTRAINT DF_AO_OrderTotal DEFAULT (0),
        PaymentMethod     NVARCHAR(20)         NULL,
        Cash              DECIMAL(18,2)        NULL,
        OrderTime         NVARCHAR(50)         NULL,
        Status            NVARCHAR(30)         NOT NULL CONSTRAINT DF_AO_Status DEFAULT (N'Available'),
        AcceptedByUserId  UNIQUEIDENTIFIER     NULL,
        CreatedAt         DATETIME2            NOT NULL CONSTRAINT DF_AO_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt         DATETIME2            NULL,
        CONSTRAINT FK_AssignedOrders_Batch
            FOREIGN KEY (BatchId) REFERENCES dbo.AssignedOrderBatches (Id),
        CONSTRAINT FK_AssignedOrders_AcceptedBy
            FOREIGN KEY (AcceptedByUserId) REFERENCES dbo.Users (UserId),
        CONSTRAINT UQ_AssignedOrders_OrderId UNIQUE (OrderId)
    );

    CREATE NONCLUSTERED INDEX IX_AssignedOrders_Status_CreatedAt
        ON dbo.AssignedOrders (Status, CreatedAt DESC);
END
GO

IF OBJECT_ID(N'dbo.AssignedOrderItems', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AssignedOrderItems
    (
        Id              BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AssignedOrderItems PRIMARY KEY,
        AssignedOrderId BIGINT               NOT NULL,
        ItemId          BIGINT               NOT NULL,
        Description     NVARCHAR(500)        NULL,
        Position        NVARCHAR(50)         NULL,
        Quantity        INT                  NOT NULL CONSTRAINT DF_AOI_Quantity DEFAULT (1),
        Comment         NVARCHAR(500)        NULL,
        LineNum         NVARCHAR(50)         NULL,
        Size            NVARCHAR(50)         NULL,
        CONSTRAINT FK_AssignedOrderItems_Order
            FOREIGN KEY (AssignedOrderId) REFERENCES dbo.AssignedOrders (Id) ON DELETE CASCADE
    );

    CREATE NONCLUSTERED INDEX IX_AssignedOrderItems_AssignedOrderId
        ON dbo.AssignedOrderItems (AssignedOrderId);

    CREATE NONCLUSTERED INDEX IX_AssignedOrderItems_ItemId
        ON dbo.AssignedOrderItems (ItemId);
END
GO

-- -----------------------------------------------------------------------------
-- 14) Soft-delete cleanup procedure
-- -----------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.DeleteUserDataIfOlderThan30Days
    @ThirdPartyEmployeeId NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @UserId UNIQUEIDENTIFIER;

    SELECT @UserId = UserId
    FROM dbo.Users
    WHERE ThirdPartyEmployeeId = @ThirdPartyEmployeeId;

    IF @UserId IS NULL
    BEGIN
        PRINT 'User not found.';
        RETURN;
    END

    IF EXISTS (
        SELECT 1
        FROM dbo.Users
        WHERE UserId = @UserId
          AND DeletedAt IS NOT NULL
          AND DeletedAt <= DATEADD(DAY, -30, GETDATE())
    )
    BEGIN
        DELETE FROM dbo.OTP WHERE UserId = @UserId;
        DELETE FROM dbo.UserRoles WHERE UserId = @UserId;
        DELETE FROM dbo.UserTokens WHERE UserId = @UserId;
        DELETE FROM dbo.UserRefreshTokens WHERE UserId = @UserId;
        DELETE FROM dbo.DocumentAcknowledgements WHERE UserId = @UserId;
        DELETE FROM dbo.Users WHERE UserId = @UserId;
        PRINT 'User and related data deleted successfully.';
    END
    ELSE
    BEGIN
        PRINT 'User not deleted. Either not soft-deleted yet or 30 days not passed.';
    END
END
GO

-- -----------------------------------------------------------------------------
-- 15) VERIFY
-- -----------------------------------------------------------------------------
SELECT 'Users' AS [Table], COUNT(*) AS [Rows] FROM dbo.Users
UNION ALL SELECT 'Roles', COUNT(*) FROM dbo.Roles
UNION ALL SELECT 'Permissions', COUNT(*) FROM dbo.Permissions
UNION ALL SELECT 'RolePermission', COUNT(*) FROM dbo.RolePermission
UNION ALL SELECT 'UserRoles', COUNT(*) FROM dbo.UserRoles
UNION ALL SELECT 'OTP', COUNT(*) FROM dbo.OTP
UNION ALL SELECT 'UserRefreshTokens', COUNT(*) FROM dbo.UserRefreshTokens
UNION ALL SELECT 'AssignedOrderBatches', COUNT(*) FROM dbo.AssignedOrderBatches
UNION ALL SELECT 'AssignedOrders', COUNT(*) FROM dbo.AssignedOrders
UNION ALL SELECT 'AssignedOrderItems', COUNT(*) FROM dbo.AssignedOrderItems;

SELECT UserId, Username, Email, ThirdPartyEmployeeId, IsActive, IsVerified,
       CASE WHEN passwordencrypted IS NULL THEN 0 ELSE 1 END AS HasAesPassword
FROM dbo.Users;

SELECT r.RoleName, p.PermissionName, p.DisplayName
FROM dbo.Roles r
JOIN dbo.RolePermission rp ON rp.RoleId = r.RoleId
JOIN dbo.Permissions p ON p.PermissionId = rp.PermissionId
ORDER BY r.RoleName, p.PermissionName;
GO

PRINT 'RiderManagement auth script completed.';
PRINT 'Next: run 003_AdminPortal.sql for the admin portal (roles, timestamps, HO-ADMIN).';
GO
