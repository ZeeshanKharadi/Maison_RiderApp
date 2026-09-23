-- =============================================================================
-- RiderManagement FULL INSTALL — scripts 001 through 007 (combined)
-- Safe to re-run (scripts are idempotent / additive).
-- Individual files under Backend\scripts remain the source of truth for patches;
-- this file is the one-shot installer for a new or existing database.
-- =============================================================================

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
PRINT 'Section 001 (auth + core tables) completed.';
GO


-- =============================================================================
-- BEGIN 002_AssignedOrders.sql
-- =============================================================================

-- =============================================================================
-- RiderManagement â€” Assigned Orders (run against existing RiderManagement DB)
-- Full install: use scripts.sql instead.
-- =============================================================================
USE RiderManagement;
GO

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

PRINT 'Assigned order tables ready.';
GO

PRINT 'Completed section: 002_AssignedOrders.sql';
GO


-- =============================================================================
-- BEGIN 003_AdminPortal.sql
-- =============================================================================

-- =============================================================================
-- RiderManagement â€” Admin portal (roles, store scope, order timestamps, payout)
-- Safe to re-run. Requires scripts.sql (or equivalent) to have been applied.
-- Full install: run scripts.sql first, then this file.
-- =============================================================================
USE RiderManagement;
GO

-- -----------------------------------------------------------------------------
-- 1) USERS â€” store assignment + last-seen (online/offline)
-- -----------------------------------------------------------------------------
IF COL_LENGTH('dbo.Users', 'StoreId') IS NULL
    ALTER TABLE dbo.Users ADD StoreId NVARCHAR(50) NULL;
GO
IF COL_LENGTH('dbo.Users', 'LastSeenAt') IS NULL
    ALTER TABLE dbo.Users ADD LastSeenAt DATETIME2 NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_Users_StoreId' AND object_id = OBJECT_ID(N'dbo.Users')
)
    CREATE NONCLUSTERED INDEX IX_Users_StoreId ON dbo.Users (StoreId)
        WHERE StoreId IS NOT NULL AND DeletedAt IS NULL;
GO

-- -----------------------------------------------------------------------------
-- 2) STORES (named list for admin dropdowns; storeId on orders remains source of truth)
-- -----------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.Stores', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Stores
    (
        StoreId   NVARCHAR(50)  NOT NULL CONSTRAINT PK_Stores PRIMARY KEY,
        Name      NVARCHAR(200) NULL,
        Latitude  FLOAT         NULL,
        Longitude FLOAT         NULL,
        IsActive  BIT           NOT NULL CONSTRAINT DF_Stores_IsActive DEFAULT (1),
        CreatedAt DATETIME2     NOT NULL CONSTRAINT DF_Stores_CreatedAt DEFAULT (SYSUTCDATETIME())
    );
END
GO

IF COL_LENGTH('dbo.Stores', 'Latitude') IS NULL
    ALTER TABLE dbo.Stores ADD Latitude FLOAT NULL;
GO

IF COL_LENGTH('dbo.Stores', 'Longitude') IS NULL
    ALTER TABLE dbo.Stores ADD Longitude FLOAT NULL;
GO



-- Copy any store ids already seen on AssignOrder batches
INSERT INTO dbo.Stores (StoreId, Name, IsActive, CreatedAt)
SELECT DISTINCT b.StoreId, b.StoreId, 1, SYSUTCDATETIME()
FROM dbo.AssignedOrderBatches b
WHERE b.StoreId IS NOT NULL
  AND LTRIM(RTRIM(b.StoreId)) <> N''
  AND NOT EXISTS (SELECT 1 FROM dbo.Stores s WHERE s.StoreId = b.StoreId);
GO



UPDATE dbo.Stores SET Latitude = 24.8607, Longitude = 67.0011 WHERE StoreId = N'10006';
UPDATE dbo.Stores SET Latitude = 24.8650, Longitude = 67.0050 WHERE StoreId = N'10008';

-- -----------------------------------------------------------------------------
-- 3) ASSIGNED ORDERS â€” timestamps + cash collected
-- -----------------------------------------------------------------------------
IF COL_LENGTH('dbo.AssignedOrders', 'AcceptedAt') IS NULL
    ALTER TABLE dbo.AssignedOrders ADD AcceptedAt DATETIME2 NULL;
GO
IF COL_LENGTH('dbo.AssignedOrders', 'PickedUpAt') IS NULL
    ALTER TABLE dbo.AssignedOrders ADD PickedUpAt DATETIME2 NULL;
GO
IF COL_LENGTH('dbo.AssignedOrders', 'CompletedAt') IS NULL
    ALTER TABLE dbo.AssignedOrders ADD CompletedAt DATETIME2 NULL;
GO
IF COL_LENGTH('dbo.AssignedOrders', 'CashCollected') IS NULL
    ALTER TABLE dbo.AssignedOrders ADD CashCollected DECIMAL(18,2) NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_AssignedOrders_AcceptedByUserId'
      AND object_id = OBJECT_ID(N'dbo.AssignedOrders')
)
    CREATE NONCLUSTERED INDEX IX_AssignedOrders_AcceptedByUserId
        ON dbo.AssignedOrders (AcceptedByUserId)
        WHERE AcceptedByUserId IS NOT NULL;
GO

-- -----------------------------------------------------------------------------
-- 4) APP SETTINGS â€” payout is configurable, not hardcoded
-- -----------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.AppSettings', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AppSettings
    (
        SettingKey   NVARCHAR(100) NOT NULL CONSTRAINT PK_AppSettings PRIMARY KEY,
        SettingValue NVARCHAR(500) NOT NULL,
        UpdatedAt    DATETIME2     NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.AppSettings WHERE SettingKey = N'PayoutMode')
    INSERT INTO dbo.AppSettings (SettingKey, SettingValue, UpdatedAt)
    VALUES (N'PayoutMode', N'fixed', SYSUTCDATETIME());
GO
IF NOT EXISTS (SELECT 1 FROM dbo.AppSettings WHERE SettingKey = N'PayoutFixedFee')
    INSERT INTO dbo.AppSettings (SettingKey, SettingValue, UpdatedAt)
    VALUES (N'PayoutFixedFee', N'50', SYSUTCDATETIME());
GO
IF NOT EXISTS (SELECT 1 FROM dbo.AppSettings WHERE SettingKey = N'PayoutPercent')
    INSERT INTO dbo.AppSettings (SettingKey, SettingValue, UpdatedAt)
    VALUES (N'PayoutPercent', N'10', SYSUTCDATETIME());
GO

-- -----------------------------------------------------------------------------
-- 5) ROLES â€” Manager (Administrator + Rider already seeded in scripts.sql)
-- -----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE RoleName = N'Manager')
BEGIN
    INSERT INTO dbo.Roles (RoleName, Description, IsActive, CreatedAt)
    VALUES (N'Manager', N'Store manager â€” scoped to one store', 1, SYSUTCDATETIME());
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE RoleName = N'Administrator')
BEGIN
    INSERT INTO dbo.Roles (RoleName, Description, IsActive, CreatedAt)
    VALUES (N'Administrator', N'Head office administrator', 1, SYSUTCDATETIME());
END
GO

MERGE dbo.Permissions AS t
USING (VALUES
    ('admin.portal',       'Access rider admin portal',            'Admin - Portal'),
    ('admin.riders',       'Create and manage riders',             'Admin - Riders'),
    ('admin.operations',   'View live assigned-order board',       'Admin - Operations'),
    ('admin.payments',     'View payments and settlements',        'Admin - Payments'),
    ('admin.reports',      'View operational reports',             'Admin - Reports'),
    ('admin.settings',     'Change payout and portal settings',    'Admin - Settings')
) AS s (PermissionName, Description, DisplayName)
ON t.PermissionName = s.PermissionName
WHEN NOT MATCHED THEN
    INSERT (PermissionName, Description, DisplayName, CreatedAt)
    VALUES (s.PermissionName, s.Description, s.DisplayName, SYSUTCDATETIME())
WHEN MATCHED THEN
    UPDATE SET t.Description = s.Description, t.DisplayName = s.DisplayName;
GO

DECLARE @AdminRoleId INT = (SELECT TOP 1 RoleId FROM dbo.Roles WHERE RoleName = N'Administrator');
DECLARE @ManagerRoleId INT = (SELECT TOP 1 RoleId FROM dbo.Roles WHERE RoleName = N'Manager');

IF @AdminRoleId IS NOT NULL
BEGIN
    INSERT INTO dbo.RolePermission (RoleId, PermissionId, CreatedAt)
    SELECT @AdminRoleId, p.PermissionId, SYSUTCDATETIME()
    FROM dbo.Permissions p
    WHERE p.PermissionName IN (
        'admin.portal', 'admin.riders', 'admin.operations',
        'admin.payments', 'admin.reports', 'admin.settings',
        'user_management', 'role_management'
    )
      AND NOT EXISTS (
          SELECT 1 FROM dbo.RolePermission rp
          WHERE rp.RoleId = @AdminRoleId AND rp.PermissionId = p.PermissionId
      );
END

IF @ManagerRoleId IS NOT NULL
BEGIN
    INSERT INTO dbo.RolePermission (RoleId, PermissionId, CreatedAt)
    SELECT @ManagerRoleId, p.PermissionId, SYSUTCDATETIME()
    FROM dbo.Permissions p
    WHERE p.PermissionName IN (
        'admin.portal', 'admin.riders', 'admin.operations',
        'admin.payments', 'admin.reports'
    )
      AND NOT EXISTS (
          SELECT 1 FROM dbo.RolePermission rp
          WHERE rp.RoleId = @ManagerRoleId AND rp.PermissionId = p.PermissionId
      );
END
GO

-- -----------------------------------------------------------------------------
-- 6) SEED head-office admin (password set on API startup, same as RD-9921)
--     Login userid = HO-ADMIN
-- -----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE ThirdPartyEmployeeId = N'HO-ADMIN')
BEGIN
    DECLARE @AdminUserId UNIQUEIDENTIFIER = NEWID();
    DECLARE @AdminRoleId2 INT = (SELECT TOP 1 RoleId FROM dbo.Roles WHERE RoleName = N'Administrator');

    INSERT INTO dbo.Users
    (
        UserId, Username, Email, PhoneNumber, ThirdPartyEmployeeId,
        IsActive, IsVerified, CreatedAt,
        Position, Grade, department, PayGroup
    )
    VALUES
    (
        @AdminUserId,
        N'Maison Head Office',
        N'ho.admin@maison.local',
        N'+15550000000',
        N'HO-ADMIN',
        1, 1, SYSUTCDATETIME(),
        N'Administrator', N'HO', N'Head Office', N'Standard'
    );

    IF @AdminRoleId2 IS NOT NULL
        INSERT INTO dbo.UserRoles (UserId, RoleId, AssignedAt)
        VALUES (@AdminUserId, @AdminRoleId2, SYSUTCDATETIME());
END
GO

-- Ensure HO-ADMIN keeps the Administrator role if the user already existed
IF EXISTS (SELECT 1 FROM dbo.Users WHERE ThirdPartyEmployeeId = N'HO-ADMIN')
BEGIN
    DECLARE @HoId UNIQUEIDENTIFIER = (SELECT TOP 1 UserId FROM dbo.Users WHERE ThirdPartyEmployeeId = N'HO-ADMIN');
    DECLARE @HoRole INT = (SELECT TOP 1 RoleId FROM dbo.Roles WHERE RoleName = N'Administrator');
    IF @HoId IS NOT NULL AND @HoRole IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM dbo.UserRoles WHERE UserId = @HoId AND RoleId = @HoRole)
        INSERT INTO dbo.UserRoles (UserId, RoleId, AssignedAt) VALUES (@HoId, @HoRole, SYSUTCDATETIME());
END
GO

-- Assign Administrator to legacy superadmin 000000 if present
IF EXISTS (SELECT 1 FROM dbo.Users WHERE ThirdPartyEmployeeId = N'000000')
BEGIN
    DECLARE @SaId UNIQUEIDENTIFIER = (SELECT TOP 1 UserId FROM dbo.Users WHERE ThirdPartyEmployeeId = N'000000');
    DECLARE @SaRole INT = (SELECT TOP 1 RoleId FROM dbo.Roles WHERE RoleName = N'Administrator');
    IF @SaId IS NOT NULL AND @SaRole IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM dbo.UserRoles WHERE UserId = @SaId AND RoleId = @SaRole)
        INSERT INTO dbo.UserRoles (UserId, RoleId, AssignedAt) VALUES (@SaId, @SaRole, SYSUTCDATETIME());
END
GO

-- Demo rider store (optional, only if ST-001 exists)
UPDATE dbo.Users
SET StoreId = N'ST-001'
WHERE ThirdPartyEmployeeId = N'RD-9921'
  AND StoreId IS NULL
  AND EXISTS (SELECT 1 FROM dbo.Stores WHERE StoreId = N'ST-001');
GO

PRINT 'Admin portal schema ready.';
GO

PRINT 'Completed section: 003_AdminPortal.sql';
GO


-- =============================================================================
-- BEGIN 003_DedupeAssignedOrders.sql
-- =============================================================================

-- Remove duplicate Available orders (same OrderId) â€” keeps newest CreatedAt row.
USE RiderManagement;
GO

;WITH ranked AS (
    SELECT
        Id,
        OrderId,
        ROW_NUMBER() OVER (
            PARTITION BY OrderId
            ORDER BY CreatedAt DESC, Id DESC
        ) AS rn
    FROM dbo.AssignedOrders
    WHERE Status = N'Available'
)
DELETE FROM dbo.AssignedOrderItems
WHERE AssignedOrderId IN (SELECT Id FROM ranked WHERE rn > 1);

;WITH ranked AS (
    SELECT
        Id,
        OrderId,
        ROW_NUMBER() OVER (
            PARTITION BY OrderId
            ORDER BY CreatedAt DESC, Id DESC
        ) AS rn
    FROM dbo.AssignedOrders
    WHERE Status = N'Available'
)
DELETE FROM dbo.AssignedOrders
WHERE Id IN (SELECT Id FROM ranked WHERE rn > 1);

PRINT 'Duplicate available orders removed.';
GO

PRINT 'Completed section: 003_DedupeAssignedOrders.sql';
GO


-- =============================================================================
-- BEGIN 004_RiderNotifications.sql
-- =============================================================================

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

PRINT 'Completed section: 004_RiderNotifications.sql';
GO


-- =============================================================================
-- BEGIN 004_StoreCoordinates.sql
-- =============================================================================

-- =============================================================================
-- RiderManagement â€” Store coordinates for delivery map (pickup location)
-- Safe to re-run. Requires dbo.Stores (003_AdminPortal.sql).
-- =============================================================================
USE RiderManagement;
GO

IF COL_LENGTH('dbo.Stores', 'Latitude') IS NULL
    ALTER TABLE dbo.Stores ADD Latitude FLOAT NULL;
GO

IF COL_LENGTH('dbo.Stores', 'Longitude') IS NULL
    ALTER TABLE dbo.Stores ADD Longitude FLOAT NULL;
GO

-- Store 10006 â€” replace lat/lng with your real store location
IF NOT EXISTS (SELECT 1 FROM dbo.Stores WHERE StoreId = N'10006')
BEGIN
    INSERT INTO dbo.Stores (StoreId, Name, IsActive, CreatedAt, Latitude, Longitude)
    VALUES (N'10006', N'Store 10006', 1, SYSUTCDATETIME(), 24.8607, 67.0011);
END
ELSE
BEGIN
    UPDATE dbo.Stores
    SET Latitude = COALESCE(Latitude, 24.8607),
        Longitude = COALESCE(Longitude, 67.0011)
    WHERE StoreId = N'10006';
END
GO

-- Store 10008 â€” replace lat/lng with your real store location
IF NOT EXISTS (SELECT 1 FROM dbo.Stores WHERE StoreId = N'10008')
BEGIN
    INSERT INTO dbo.Stores (StoreId, Name, IsActive, CreatedAt, Latitude, Longitude)
    VALUES (N'10008', N'Store 10008', 1, SYSUTCDATETIME(), 24.865, 67.005);
END
ELSE
BEGIN
    UPDATE dbo.Stores
    SET Latitude = COALESCE(Latitude, 24.865),
        Longitude = COALESCE(Longitude, 67.005)
    WHERE StoreId = N'10008';
END
GO

PRINT 'Completed section: 004_StoreCoordinates.sql';
GO


-- =============================================================================
-- BEGIN 005_UserDeviceTokens.sql
-- =============================================================================

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

PRINT 'Completed section: 005_UserDeviceTokens.sql';
GO


-- =============================================================================
-- BEGIN 006_ProductionLifecycle.sql
-- =============================================================================

-- =============================================================================
-- 006_ProductionLifecycle.sql
-- Production-readiness: concurrency, COD separation, auth reset tokens,
-- availability intervals, audit, rejections, admin notifications.
-- Idempotent / additive. Does NOT drop data.
-- Deploy AFTER 001â€“005 scripts. Rollback: reverse column/table adds manually;
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

PRINT 'Completed section: 006_ProductionLifecycle.sql';
GO


-- =============================================================================
-- BEGIN 007_Phase1Corrections.sql
-- =============================================================================

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

PRINT 'Completed section: 007_Phase1Corrections.sql';
GO

PRINT 'All sections 001–007 applied (combined scripts.sql).';
GO

