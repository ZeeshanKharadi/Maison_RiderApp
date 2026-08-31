-- Remove duplicate Available orders (same OrderId) — keeps newest CreatedAt row.
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
