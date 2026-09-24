# Rider live GPS tracking

## What it does

- Rider Android app runs a **foreground location service** (persistent notification) while the rider has any **active delivery** (Accepted through Delivered).
- One tracker covers multiple concurrent orders; tracking stops when the last active delivery ends or the rider logs out.
- Locations are uploaded to `PUT /api/Order/location` and broadcast on admin SignalR as `RiderLocationChanged`.
- Admin portal **Live map** (`/live-map`) shows rider markers, active-order count, delivery status, and last update. Stale / missing GPS is marked clearly. Managers are store-scoped via existing JWT + hub groups.

## Database migration

Run on SQL Server:

```text
Backend/scripts/008_RiderLiveLocation.sql
```

Adds to `dbo.Users`:

- `LastLatitude` FLOAT NULL  
- `LastLongitude` FLOAT NULL  
- `LocationUpdatedAt` DATETIME2 NULL  

Safe to re-run.

## Configuration

`appsettings.json`:

```json
"Location": {
  "StaleSeconds": 90
}
```

(Admin map currently uses a 90s stale threshold in code; keep this config for documentation / future wiring.)

Rate limit: `location` policy — 60 updates / rider / minute (`Program.cs`).

## Deploy steps

1. Run `008_RiderLiveLocation.sql`.
2. Publish and recycle **Rider.WebAPI** (new endpoint + SignalR event).
3. Build and deploy **AdminPortal** (`npm run build` → IIS).
4. Rebuild **Android** app and install on devices (native FGS + permissions).

## Android permissions (runtime)

The app requests:

1. Fine location  
2. Background location (“Allow all the time”) on Android 10+  
3. Notifications (Android 13+) for the tracking notification  

Users must grant **All the time** location for reliable updates with screen locked.

## API

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| PUT | `/api/Order/location` | Rider JWT | Body: `{ latitude, longitude, accuracyMeters?, recordedAt? }`. Requires ≥1 active delivery. |
| GET | `/api/Admin/Riders/live-map?storeId=` | Admin/Manager | Store-scoped list of riders with active orders + last GPS. |

SignalR (`/hubs/admin`): `RiderLocationChanged` payload includes `riderUserId`, coords, `activeOrderCount`, `deliveryStatus`, `cleared`.

## Account switching / network

- Logout clears GPS on server and stops the FGS.
- Session clear on user change prevents leaking prior rider UI state.
- Duplicate near-identical uploads within 2s are ignored.
- Admin hub reconnect + 30s poll refresh the map when SignalR drops.
