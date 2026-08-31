# Maison Rider Admin Portal

Head-office / store-manager web app for Maison delivery ops. Riders keep using the **mobile app**. This portal talks only to **Rider.WebAPI** and the existing **RiderManagement** database.

## How jobs get created (KDS)

This portal does **not** bump kitchen tickets.

1. FOH bumps a **DELIVERY** order on KDS.
2. KDS calls `POST /api/Order/AssignOrder` (anonymous — no admin JWT).
3. Rider.WebAPI writes `AssignedOrders` with status `Available`.
4. Riders see the job in the mobile app (`GET /api/Order/Available`).
5. The admin live board lists the same rows, scoped by store for managers.

Do not call KDS APIs for rider CRUD. Do not rebuild kitchen screens here.

## Roles

| Role | Login | Sees |
|------|--------|------|
| **Administrator** | Head office (`HO-ADMIN`) | All stores, payout settings |
| **Manager** | Store manager account | Own `StoreId` only |
| **Rider** | Mobile app only (e.g. `RD-9921`) | Portal login is rejected |

JWT is the same Rider.WebAPI stack (`POST /api/User/login`). Admin endpoints require `[Authorize]` + Administrator or Manager.

## Seeded admin

After `003_AdminPortal.sql` and API startup:

| Field | Value |
|-------|--------|
| Worker ID | `HO-ADMIN` |
| Password | `Admin@Maison1` |
| Role | Administrator |

The API seeds the AES password on first run if it is still null (same pattern as `RD-9921`).

## Run

### 1. Database

In SSMS, against SQL Server:

1. `Backend/scripts/scripts.sql` — DB + auth + assigned-order tables (once).
2. `Backend/scripts/003_AdminPortal.sql` — admin roles, store column, order timestamps, payout settings, `HO-ADMIN` user. Safe to re-run.

### 2. API

```sh
cd Backend
dotnet run --project src/Rider.WebAPI
```

Swagger: http://localhost:5195/swagger  
Confirm `appsettings.json` connection string points at `RiderManagement`.

### 3. Portal

```sh
cd AdminPortal
npm install
npm run dev
```

Open http://localhost:5173 and sign in as `HO-ADMIN`.

Vite proxies `/api` to `http://localhost:5195`. To point at another host, copy `.env.example` to `.env` and set `VITE_API_URL` (leave empty to use the proxy).

## Portal features (v1)

- **Riders** — list / create / edit store / activate / reset password. Online = last seen within 10 minutes (login or `GET /api/Order/Available`).
- **Live operations** — board + table of Available / Accepted / InProgress / Completed / Cancelled. Cancel or requeue (not a kitchen bump). Order detail includes customer, items, payment, rider, timestamps.
- **Payments** — cash / card / other, cash to collect vs collected, rider settlement (payout from settings). CSV / Excel export.
- **Reports** — orders per rider per day, completed vs cancelled, average Accepted → Completed when timestamps exist.
- **Settings** (HO) — per-delivery fee or % of order total.

## Admin API (Bearer, Administrator or Manager)

| Method | Route |
|--------|--------|
| GET/POST/PUT | `/api/Admin/Riders`, `/api/Admin/Riders/{id}`, `reset-password`, `activate`, `deactivate` |
| GET | `/api/Admin/Orders`, `/api/Admin/Orders/summary`, `/api/Admin/Orders/{id}` |
| POST | `/api/Admin/Orders/{id}/cancel`, `/requeue` |
| PUT | `/api/Admin/Orders/{id}/cash-collected` |
| GET | `/api/Admin/Payments`, `/api/Admin/Payments/export` |
| GET | `/api/Admin/Reports` |
| GET | `/api/Admin/Stores` |
| GET/PUT | `/api/Admin/Settings/payout` (PUT = Administrator only) |

`POST /api/Order/AssignOrder` stays anonymous for KDS.
