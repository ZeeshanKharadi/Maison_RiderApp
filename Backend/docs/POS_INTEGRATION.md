# POS Integration

## Authentication

All POS push endpoints require the header:

```
X-POS-Api-Key: <your-key>
```

Configured in `appsettings` / environment as:

```
PosIntegration:ApiKey
```

There is **no anonymous fallback**. Requests without a matching key receive `401`.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/Order/AssignOrder` | Open pool assignment (payload unchanged) |
| POST | `/api/Order/AssignOrderToRider` | Direct assignment (`workerId` + same order payload) |

## Coordinated POS configuration changes

1. Set the same API key in Maison backend (`PosIntegration:ApiKey` or env `PosIntegration__ApiKey`) and in the POS integration client.
2. Add HTTP header on every AssignOrder / AssignOrderToRider call:
   - `X-POS-Api-Key: <shared-secret>`
3. Remove any previous anonymous/no-auth POS HTTP calls — they will receive **401**.
4. Payload JSON for `orders` / `orderItems` is **unchanged**.
5. For cash/COD orders, continue sending `paymentMethod` and `cash` (expected customer cash). Do not put prepaid totals into `cash`.

Example (curl):

```bash
curl -X POST "https://<api-host>/api/Order/AssignOrder" \
  -H "Content-Type: application/json" \
  -H "X-POS-Api-Key: <shared-secret>" \
  -d "{ ... existing AssignOrder body ... }"
```

