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

-- Optional: seed test coordinates for the default dev store
UPDATE dbo.Stores
SET Latitude = 24.8607,
    Longitude = 67.0011
WHERE StoreId = N'ST-001'
  AND Latitude IS NULL
  AND Longitude IS NULL;
GO
