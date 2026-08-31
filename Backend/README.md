# Rider Management Backend

KDS-layered .NET 8 host with **ESS-compatible** authentication routes and payloads. Also hosts **admin APIs** for the Maison Rider Ops portal (`AdminPortal/`).

## Solution

| Project | Role |
|---------|------|
| `Rider.Domain` | Entities, `ApiResponse<T>`, `BaseResponse<T>` |
| `Rider.Application` | Interfaces, DTOs, DI extensions |
| `Rider.Persistence` | EF Core, repositories, UoW, JWT Bearer registration |
| `Rider.Infrastructure` | AES crypto, JWT generation, `UserService`, `OrderService`, `AdminService` |
| `Rider.WebAPI` | User / Order / Admin controllers, middleware, host |

## Auth APIs (ESS routes)

| Method | Route | Auth |
|--------|-------|------|
| POST | `/api/User/login` | Anonymous |
| POST | `/api/User/register` | Anonymous (register or forgot) |
| POST | `/api/User/VerifyOtp` | Anonymous |
| POST | `/api/User/UpdatePassword` | Anonymous |
| POST | `/api/User/ChangePassword` | Bearer |
| POST | `/api/User/Logout` | Bearer |
| GET | `/api/User/CurrentUser` | Bearer |
| POST | `/api/User/RefreshToken` | Anonymous |
| PUT | `/api/User/UpdateProfile` | Bearer |
| POST | `/api/User/ValidateToken` | Bearer |

Login body: `{ "userid": "RD-9921", "password": "password123" }`  
Login response: `{ "status": true, "message": "...", "Data": { "userData": {...}, "token": "...", "refreshToken": "..." } }`

JWT now includes `role` claims (`Rider`, `Manager`, `Administrator`) and `storeId`.

## Orders (KDS + riders)

| Method | Route | Auth |
|--------|-------|------|
| POST | `/api/Order/AssignOrder` | **Anonymous** (KDS / POS — open pool for all riders) |
| POST | `/api/Order/AssignOrderToRider` | **Anonymous** (KDS / POS — dispatch to one `workerId`) |
| GET | `/api/Order/Available` | Bearer (open pool + jobs reserved for this rider) |
| GET | `/api/Order/{id}` | Bearer |
| POST | `/api/Order/{id}/status` | Bearer (rider: Accepted / InProgress / Completed) |

**How a delivery job is created:** FOH bumps a DELIVERY order on KDS → KDS `POST /api/Order/AssignOrder` (everyone) **or** `POST /api/Order/AssignOrderToRider` (one rider) → `AssignedOrders.Status = Available`. The admin portal does not create kitchen bumps.

## Admin APIs (portal)

Require Bearer + role **Administrator** or **Manager**. Store managers are scoped to their `Users.StoreId`. Head office (Administrator) sees all stores. Riders cannot call these endpoints.

See `AdminPortal/README.md` for the route list, seeded `HO-ADMIN` login, and how to run the React portal.

## Setup

1. Update `src/Rider.WebAPI/appsettings.json` connection string (`RiderManagement`).
2. Run **`scripts/scripts.sql`** in SSMS (creates DB + auth tables + seeds).
   - Source: ESS `script/script.txt` (Users/OTP/Roles/Permissions/…) adapted for AES `passwordencrypted`.
3. Run **`scripts/003_AdminPortal.sql`** (safe to re-run): Manager role, `StoreId` / `LastSeenAt` on users, order timestamps + `CashCollected`, payout settings, `HO-ADMIN`.
4. `dotnet run --project src/Rider.WebAPI`
   - Seeds AES password for `RD-9921` (password `RD-9921`) if still null.
   - Seeds AES password for `HO-ADMIN` (password `Admin@Maison1`) if still null.
5. Rider mobile login: `{ "userid": "RD-9921", "password": "RD-9921" }`
6. Admin portal login: `{ "userid": "HO-ADMIN", "password": "Admin@Maison1" }` then open `AdminPortal` (`npm run dev`).

JWT / EncryptionKey values match ESS defaults for compatibility. Do not commit secrets; override with environment variables in deployed environments (`ConnectionStrings__DefaultConnection`, `Jwt__Key`, `EncryptionKey__key`).

