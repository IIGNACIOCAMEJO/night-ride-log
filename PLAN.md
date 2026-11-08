# Night Ride Log — Build Plan

## Architecture

- Buildless static app served from the repository root.
- Shared browser data model in `seed.js` and persistence/import/export helpers in `storage.js`.
- Feature modules in `rides.js` and `stats.js`, coordinated by `app.js`.
- Mobile-first accessible shell in `index.html` and `styles.css`.
- Offline caching through `sw.js`; no third-party dependencies.

## Parallel workstreams

1. **Data/storage/seed data** — implement `seed.js` and `storage.js`: schema, realistic seed rides/bikes, validation, persistence, import/export/reset/clear helpers.
2. **UI/layout/styling** — implement `index.html` and `styles.css`: semantic app shell, all views/forms/dialogs, cyberpunk responsive design, accessible navigation and controls.
3. **Stats/charts** — implement `stats.js`: dashboard summaries, monthly canvas chart, bike mileage, and night/day breakdown rendering.
4. **Rides CRUD** — implement `rides.js`: ride list filtering/search/sort, form population/validation, add/edit/delete behavior, and bike-linked display.

## Orchestrator integration

- Implement `app.js`, garage/settings controllers, view routing, notifications, and service-worker registration.
- Add `sw.js` and `README.md`.
- Integrate module contracts and resolve conflicts.
- Run JavaScript syntax checks, static HTML checks, local HTTP smoke tests, and browser interaction tests when available.
- Document the result, files, agents, test instructions, and chosen defaults in `DONE.md`.
