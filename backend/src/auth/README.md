# Authentication

This milestone implements farmer registration, shared farmer/administrator login, logout, current-user lookup and role-protected account pages. Product management and verification remain separate milestones.

## Local use

```sh
npm run db:up
npm run db:migrate
npm run dev
```

Open `http://localhost:3000/register` to create a farmer account. Supply a full name, at least one contact method (email or phone), and a password of 15–128 characters. County is optional. Kenyan `07...`, `01...` and `254...` phone numbers are normalized to `+254...`; international numbers can use E.164. Login accepts either the email or the normalized/local phone number.

Registration creates the user, farmer profile and initial session in one database transaction. Only the farmer role is accepted through public registration; extra request fields, including `role` and `permission_level`, are rejected.

After login, farmers go to `/farmer` and administrators to `/admin`. Unauthenticated visits redirect to `/login`; a signed-in user visiting the other role's page returns to their own area. The backend independently enforces roles on its protected endpoints. Newly added backend endpoints require a session by default; use `@Public()` only for intentionally public routes and `@RequireRole(...)` for role restrictions.

## Creating an administrator

From an interactive terminal in the repository root:

```sh
npm run admin:create
```

Enter the administrator's name, email, unique staff number and password. Password entry is hidden and confirmed. The command creates a `standard` administrator; it never promotes or overwrites an existing account and has no default credentials. Sign in through the same `/login` page afterward.

For automated provisioning, the command also accepts `AGRO_ADMIN_NAME`, `AGRO_ADMIN_EMAIL`, `AGRO_ADMIN_STAFF_NUMBER` and `AGRO_ADMIN_PASSWORD` through the process environment. Supply those through a secret manager or temporary process environment, not command-line arguments, checked-in files or shared terminal history. Tests use this mode only against temporary schemas. No administrator is automatically created in the application database.

## Endpoints

| Method | Backend path | Access |
| --- | --- | --- |
| POST | `/api/auth/register` | Public; JSON and trusted browser origin required |
| POST | `/api/auth/login` | Public; JSON and trusted browser origin required |
| POST | `/api/auth/logout` | Trusted browser origin; idempotent, returns 204 |
| GET | `/api/auth/me` | Active, unexpired session |
| GET | `/api/auth/farmer` | Farmer session |
| GET | `/api/auth/administrator` | Administrator session |

Browser requests use the frontend's `/api/auth/...` route handler. It forwards only the supported authentication actions to `API_INTERNAL_URL`, preserving the browser's Origin for the backend check and returning session cookies on the frontend host. Requests are bounded to 8 KiB and are never cached. Server-rendered account pages also validate their cookie against the backend, with caching disabled. No user ID or role supplied by the browser determines authorization.

## Passwords and sessions

- Passwords use Node's asynchronous scrypt with a random 16-byte salt, a 64-byte output, `N=65536`, `r=8`, `p=2`, and constant-time comparison. Hashes contain the scheme and parameters for future upgrades. Passwords are not trimmed, logged or returned. Unknown accounts perform the same hash work as wrong passwords. At most two expensive hashes run simultaneously per API process.
- Sessions use random 32-byte opaque tokens. PostgreSQL stores only their SHA-256 digests in `auth_sessions`. Browser tokens are delivered only through `agro_session`, an HttpOnly, SameSite=Lax cookie with path `/`. They are not stored in localStorage or JSON responses.
- The default absolute lifetime is 12 hours, configurable with `SESSION_TTL_HOURS` (1–168). Signing in replaces the session presented by that browser. Signing out deletes that session and clears the cookie. Every protected request rechecks expiry and the account's current active status and role.
- Mutation requests require an exact `FRONTEND_ORIGIN`, including requests to the backend directly. This Origin check, together with the cookie policy, protects browser sign-in and sign-out requests against cross-site submissions.
- Public registration is limited to 10 requests per 15 minutes and login to 20 per 15 minutes, per network peer and API process. Invalid credentials and validation failures count. The in-memory limiter resets on restart and has bounded storage. Forwarded IP headers are deliberately not trusted, so calls through the frontend proxy share its allowance. A multi-user deployment should add a trusted reverse-proxy IP policy and shared limiter before scaling. This prototype is configured for local development.
- Expired sessions for an account are pruned on its next successful sign-in. A future maintenance task can remove other expired rows; expiry is enforced even when a row has not yet been pruned.

`SESSION_COOKIE_SECURE` defaults to true when `NODE_ENV=production`. Production startup rejects HTTP `FRONTEND_ORIGIN` or disabled secure cookies. Serve the frontend over HTTPS and configure the public origin accordingly. `API_INTERNAL_URL` is a server-only setting (default `http://127.0.0.1:3001/api`); never point it at an untrusted host because it receives authentication requests.

Contact ownership verification, password recovery, password changes, MFA and session-management screens are not implemented in this milestone. An account's email or phone is an identifier, not a verified claim of ownership.

## Validation

```sh
npm run check
npm run db:test
npm run auth:test
npm run smoke
```

`auth:test` requires the built backend. It starts the real Nest application on a temporary port and uses a separate temporary PostgreSQL schema. It covers public-role restrictions, contact normalization, password hashing, cookie flags, current-user responses, role authorization, duplicate registration rollback, incorrect credentials, session rotation, expiry, logout, disabled accounts, origin checks, request-size limits and throttling. It also tests the administrator-creation command. No test account remains in the application database.

Implementation references: [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), and [Next.js authentication](https://nextjs.org/docs/app/guides/authentication).
