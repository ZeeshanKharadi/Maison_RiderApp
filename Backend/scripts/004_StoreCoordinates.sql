-- =============================================================================
-- RiderManagement — Store coordinates for delivery map (pickup location)
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

-- Store 10006 — replace lat/lng with your real store location
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

-- Store 10008 — replace lat/lng with your real store location
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
