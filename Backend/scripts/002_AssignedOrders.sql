-- =============================================================================
-- RiderManagement — Assigned Orders (run against existing RiderManagement DB)
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
