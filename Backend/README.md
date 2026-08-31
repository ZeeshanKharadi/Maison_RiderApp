# Rider Management Backend

KDS-layered .NET 8 host with **ESS-compatible** authentication routes and payloads.

## Solution

| Project | Role |
|---------|------|
| `Rider.Domain` | Entities, `ApiResponse<T>`, `BaseResponse<T>` |
| `Rider.Application` | Interfaces, DTOs, DI extensions |
| `Rider.Persistence` | EF Core, repositories, UoW, JWT Bearer registration |
| `Rider.Infrastructure` | AES crypto, JWT generation, `UserService`, OTP notifier |
| `Rider.WebAPI` | `UserController`, middleware, host |

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

## Setup

1. Update `src/Rider.WebAPI/appsettings.json` connection string (`RiderManagement`).
2. Run **`scripts/scripts.sql`** in SSMS (creates DB + auth tables + seeds).
   - Source: ESS `script/script.txt` (Users/OTP/Roles/Permissions/…) adapted for AES `passwordencrypted`.
3. Set password for seeded rider `RD-9921` via API:
   - `POST /api/User/register` → `VerifyOtp` → `UpdatePassword`, **or**
   - register a new `workerId` then set password.
4. `dotnet run --project src/Rider.WebAPI`
5. Login: `{ "userid": "RD-9921", "password": "<your password>" }`

JWT / EncryptionKey values match ESS defaults for compatibility.
