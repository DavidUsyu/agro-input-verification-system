# Agro-Input Verification System

A proposed web-based system that helps smallholder farmers in Kenya check seed and fertilizer product codes against stored product records.

## Project status

The development foundation is implemented: a Next.js frontend, NestJS API, PostgreSQL connection, environment setup, and build checks. Farmer authentication, product management and verification are the next implementation stages; they are not available yet.

## Technology and structure

- Frontend: Next.js App Router, React, TypeScript and CSS.
- Backend: NestJS, TypeScript and the PostgreSQL `pg` driver.
- Database: PostgreSQL 18 in Docker, with a persistent named volume.
- Tooling: npm workspaces, ESLint and GitHub Actions.

```text
frontend/              Web application, homepage and service status page
backend/src/           API, environment validation and database connection
scripts/               Local environment setup and integration smoke checks
compose.yaml           Local PostgreSQL service
.github/workflows/     Automated lint, type, build and connection checks
```

The application database tables and migrations will be added during the database implementation step. This setup creates an empty development database and verifies connectivity.

## First implementation milestone

The proposed initial 30% milestone covers:

- Farmer registration, login and logout.
- Administrator login and role-based access.
- Administrator management of products and their verification codes.
- Product-code verification through a web interface.
- Personal verification history for registered farmers and an administrator view of all verification records.
- Guest verification, consistent with the optional farmer relationship in the database design.

The university assessment rubric will determine whether this scope meets the 30% requirement.

## Verification behavior

The system will validate submitted codes, look up stored records, check product status and expiry, save verification results, and display relevant product details.

Initial outcomes will include verified against stored records, expired, unregistered, and explicitly flagged suspicious records. Missing or malformed codes will receive validation messages.

A matching code does not establish the authenticity of physical contents. An unknown code means it was not found in the database; it does not establish that a product is counterfeit. Demonstration data will be clearly identified.

## Later milestones

- Suspicious-product reporting and administrator review.
- Full monitoring dashboard, geographic trends and exports.
- USSD access using the same backend and database.
- Further usability testing and refinement.

## Design basis

The scope is based on the project proposal, *A Web-Based System for Detecting Counterfeit Agro-Inputs Through Product Code Verification Among Smallholder Farmers in Kenya*, and the accompanying agro-input verification design diagrams.

The architecture consists of a web frontend, backend/API and relational database, with a USSD interface added in a later milestone.

## Running the project

### Prerequisites

- Node.js 24.15 or a newer 24.x release, and npm 11 or newer. The selected version is recorded in `.nvmrc`.
- Docker Desktop running with Linux containers, or an existing PostgreSQL instance.

Run these commands from the repository root:

```sh
npm install
npm run setup
npm run db:up
npm run dev
```

On Windows PowerShell, use `npm.cmd` in place of `npm` if script execution policy blocks `npm.ps1`.

`npm run setup` creates the ignored root `.env`, `backend/.env` and `frontend/.env.local`. It generates a random local database password and keeps existing files unchanged. The `.env.example` files document the available settings and contain no real credentials.

Open:

| Address | Purpose |
| --- | --- |
| http://localhost:3000 | Starter homepage |
| http://localhost:3000/status | Click **Check connection** to test browser-to-API and database connectivity |
| http://localhost:3001/api/health | API liveness; works even if PostgreSQL is stopped |
| http://localhost:3001/api/health/ready | Runs a database query; returns HTTP 503 if PostgreSQL is unavailable |

The local database listens on `127.0.0.1:5433`, leaving the usual PostgreSQL port 5432 available for other projects. Both application servers also bind to the local machine by default.

Use Ctrl+C to stop the development servers. Run `npm run db:stop` to stop PostgreSQL without deleting its stored data. Restart it with `npm run db:up`.

### Configuration

| File | Settings |
| --- | --- |
| `.env` | Docker database user, password, database name and host port |
| `backend/.env` | `DATABASE_URL`, `PORT`, `HOST` and the permitted `FRONTEND_ORIGIN` |
| `frontend/.env.local` | `NEXT_PUBLIC_API_URL` (public API address; never put credentials here) |

If you already have PostgreSQL, create a dedicated database, run `npm run setup`, and update `backend/.env` with its connection URL. Skip `npm run db:up`. Passwords with special characters must be URL-encoded in `DATABASE_URL`.

Changing `.env` after the Docker volume has been initialized does not change the stored PostgreSQL credentials. Keep the backend connection URL in sync with the actual database settings. Setup never overwrites existing environment files.

Frontend public environment settings are incorporated into the build; rebuild after changing them. When changing the frontend port or browser hostname, update `FRONTEND_ORIGIN` in `backend/.env` to match the exact browser origin.

### Checks and production builds

```sh
npm run check
npm run smoke
```

`check` runs ESLint, TypeScript checks and production builds for both applications. `smoke` requires those builds and a running database. It temporarily starts the built applications on ports 3100 and 3101, checks the homepage, status page, API response, CORS and database readiness, then stops its servers. It does not test browser interactions or implement business-feature tests.

To run the built applications yourself, use separate terminals:

```sh
npm run start --workspace backend
npm run start --workspace frontend
```

GitHub Actions is configured to run the checks with a separate temporary PostgreSQL database on pushes to `main` and pull requests. After the initial installation, use `npm ci` to reproduce the dependency versions in `package-lock.json`.

### Troubleshooting

- **Docker cannot connect:** start Docker Desktop and wait for its engine, then rerun `npm run db:up`.
- **A port is already in use:** stop the conflicting project or adjust the relevant port and environment settings. Smoke checks require free ports 3100 and 3101.
- **API connected, database unavailable:** run `npm run db:logs` and check `DATABASE_URL` against the database settings.
- **The browser cannot reach the API:** confirm the backend is running, `NEXT_PUBLIC_API_URL` is correct, and `FRONTEND_ORIGIN` matches the browser address.

Framework setup references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [NestJS first steps](https://docs.nestjs.com/first-steps), and the [official PostgreSQL image](https://hub.docker.com/_/postgres).
