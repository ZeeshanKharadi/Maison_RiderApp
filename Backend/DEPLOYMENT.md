# Deployment notes (production lifecycle)

1. **Database** — Run scripts in order through `scripts/006_ProductionLifecycle.sql` on the RiderManagement database (idempotent/additive).

2. **POS API key** — Set `PosIntegration:ApiKey` (env or secrets). Do not leave `CHANGE_ME_POS_KEY`. POS clients must send `X-POS-Api-Key`.

3. **SMTP** — Configure `EmailSettings` (`MailServer`, `User`, `Password`, `SMTPPort`). Password-reset OTP succeeds only when email send succeeds.

4. **CORS** — Set `Cors:Origins` to Admin Portal origins (include scheme + host + port). Portal uses credentialed requests + SignalR.

5. **SignalR** — Hub at `/hubs/admin`. Clients pass JWT as `?access_token=...`. Reverse proxies must support WebSockets (e.g. nginx `proxy_http_version 1.1`, `Upgrade` / `Connection` headers).

6. **JWT / encryption** — Keep `Jwt:Key` and `EncryptionKey:key` in secrets store; rotate carefully.

7. **Heartbeat / availability policy** — Explicit Online/Offline is stored separately from `LastSeenAt`. Heartbeats refresh `LastSeenAt`. Open availability intervals are closed with `HeartbeatExpired` after `Availability:HeartbeatMinutes` (default 15) so a crashed app does not accumulate unbounded online hours. Going online does not invent a prior shift start; Offline blocks new accepts but allows finishing active deliveries.

8. **Rollback** — `006_ProductionLifecycle.sql` is additive. Rollback is manual column/table drop; do not delete historical `CashCollected` values. Legacy rows may carry `CashSemanticsNote = LegacyCashCollected_Ambiguous`.

