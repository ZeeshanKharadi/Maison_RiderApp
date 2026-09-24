-- =============================================================================
-- RiderManagement — Rider live GPS fields on Users
-- Safe to re-run.
-- =============================================================================
USE RiderManagement;
GO

IF COL_LENGTH('dbo.Users', 'LastLatitude') IS NULL
    ALTER TABLE dbo.Users ADD LastLatitude FLOAT NULL;
GO

IF COL_LENGTH('dbo.Users', 'LastLongitude') IS NULL
    ALTER TABLE dbo.Users ADD LastLongitude FLOAT NULL;
GO

IF COL_LENGTH('dbo.Users', 'LocationUpdatedAt') IS NULL
    ALTER TABLE dbo.Users ADD LocationUpdatedAt DATETIME2 NULL;
GO
