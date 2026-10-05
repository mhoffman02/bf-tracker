# BF Tracker

Minimal, installable body-fat tracker PWA. Static files, no backend, data in `localStorage`.
See [REQUIREMENTS.md](REQUIREMENTS.md).

Live: https://mhoffman02.github.io/bf-tracker/

## Dev

```sh
npm install          # dev-only: jsdom (e2e), @types/node; the app itself has no deps
npm run serve        # http://localhost:8080  (ES modules + service worker need http, not file://)
npm test             # unit + e2e, node:test
npm run test:watch   # re-runs on save
```

The service worker is disabled on localhost (it would serve stale files); open `http://localhost:8080/?sw` to test offline.

### Tests (red → green)

- `tests/calc.test.js` — unit: formulas, validation, moving average (`calc.js`).
- `tests/e2e.test.js` — loads the real `index.html` + `app.js` in jsdom and drives the UI: weekly entry/auto-save/reload, unit toggle, female/hip.

Workflow: write a failing test first, run `npm run test:watch`, make it pass, refactor.

## Deploy

GitHub Pages → Settings → Pages → Source: **Deploy from a branch**, `main` / `/ (root)`.

On each release, bump `VERSION` in `service-worker.js` so installed clients pick up new files.

## Install on iPhone/iPad

Open the live URL in Safari → Share → **Add to Home Screen**.
Note: home-screen app storage is separate from Safari-tab storage, and devices don't sync — use CSV export as backup.
