# Night Ride Log

A buildless, offline-capable motorcycle ride tracker with a cyberpunk dashboard. All rides and bikes remain in the browser's `localStorage`; there is no backend or analytics.

## Run locally

Serve the repository root with any static server:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`. A local server is required for service-worker/offline testing. The app is also ready to publish directly from the repository root with GitHub Pages.

## Features

- Dashboard totals, longest ride, current-month summary, and recent rides
- Ride add/edit/delete, search, bike filter, and date/mileage sorting
- Six-month canvas mileage chart, miles by bike, and night/day split
- Garage with bike add/edit/delete and linked-ride safeguards
- JSON export/import, seed reset, and full local-data clearing
- Responsive, keyboard-accessible UI with no external dependencies
- Offline asset cache after the first successful load

## Validation

```bash
node --check seed.js
node --check storage.js
node --check rides.js
node --check stats.js
node --check app.js
node --check sw.js
```
