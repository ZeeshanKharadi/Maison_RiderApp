-- =============================================================================
-- RiderManagement — Admin portal (roles, store scope, order timestamps, payout)
-- Safe to re-run. Requires scripts.sql (or equivalent) to have been applied.
-- Full install: run scripts.sql first, then this file.
-- =============================================================================
USE RiderManagement;
GO

-- -----------------------------------------------------------------------------
-- 1) USERS — store assignment + last-seen (online/offline)
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
        IsActive  BIT           NOT NULL CONSTRAINT DF_Stores_IsActive DEFAULT (1),
        CreatedAt DATETIME2     NOT NULL CONSTRAINT DF_Stores_CreatedAt DEFAULT (SYSUTCDATETIME())
    );
END
GO

F COL_LENGTH('dbo.Stores', 'Latitude') IS NULL
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
-- 3) ASSIGNED ORDERS — timestamps + cash collected
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
-- 4) APP SETTINGS — payout is configurable, not hardcoded
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
-- 5) ROLES — Manager (Administrator + Rider already seeded in scripts.sql)
-- -----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE RoleName = N'Manager')
BEGIN
    INSERT INTO dbo.Roles (RoleName, Description, IsActive, CreatedAt)
    VALUES (N'Manager', N'Store manager — scoped to one store', 1, SYSUTCDATETIME());
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
