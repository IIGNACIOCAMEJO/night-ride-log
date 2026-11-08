# Night Ride Log

A local-first, full-stack motorcycle ride tracker with a sharp cyberpunk dashboard and the NEON RUN arcade game. It runs with a Node/SQLite sync server, but keeps its original static localStorage path for GitHub Pages and offline use.

## Run

Requires Node 22.5 or newer (for built-in `node:sqlite`). No package installation or external service is required.

```bash
npm start
```

Open `http://localhost:3000`. The SQLite database is created at `data/night-rides.sqlite`; uploaded server photos live under `data/uploads/`. Both are ignored by Git.

The server binds to `127.0.0.1` by default. Set `HOST` explicitly only when LAN access is intended; set `PORT` or `NRL_DATABASE` to override the port or database path.

For static fallback testing, serve the repository root with any static file server. API detection falls back to localStorage automatically.

## Features

- Dashboard, searchable ride log, six-month statistics, garage, data tools, and NEON RUN
- Authenticated REST API with local accounts, salted scrypt password hashes, hashed sessions, login throttling, and per-user SQLite data
- Full rides, bikes, and maintenance CRUD; local-first sync and preserved seed data
- Dependency-free route maps, GPX import/export, IndexedDB ride photos, and protected server photo storage
- Mileage/date service reminders, CSV/PDF statistics export, and privacy-filtered read-only ride links
- Responsive neon yellow/cyan interface, keyboard/touch game controls, reduced-motion support, and offline asset caching

## Test

```bash
npm test
```

The suite exercises the live HTTP API and database, authentication/isolation, resource CRUD, protected photo access, static-file hardening, exports/share links, and headless NEON RUN logic.

Syntax-only validation:

```bash
npm run check
```

## API outline

- Public: `GET /api/health`, `POST /api/auth/register`, `POST /api/auth/login`
- Auth: `GET /api/auth/me`, `POST /api/auth/logout`, `GET /api/sync`
- Resources: `/api/bikes`, `/api/rides`, `/api/maintenance` with collection GET/POST and item GET/PUT/DELETE
- Photos: `POST /api/rides/:id/photos` (up to eight validated JPEG/PNG/WebP files), authenticated `GET /api/photos/:rideId/:filename`

Send the session as `Authorization: Bearer <token>` or use the same-origin HttpOnly cookie issued at login.
