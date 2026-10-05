# BF Tracker

Minimal, installable body-fat tracker PWA. Static files, no backend, data in `localStorage`.
See [REQUIREMENTS.md](REQUIREMENTS.md).

Live: https://mhoffman02.github.io/bf-tracker/

## Privacy

**Data Not Collected.** BF Tracker has no account, no analytics, no ads and no tracking. Your measurements are stored only in your browser on this device (`localStorage`) and are never sent to a server. The app makes no network requests while in use (enforced by a test); after the first visit it runs fully offline.

- **Data shared with third parties:** none.
- **Hosting:** the app's files are served by GitHub Pages, which, like any web host, may log standard request data (e.g. IP address) when the files are downloaded. No measurements are included.
- **Your control:** export a CSV backup anytime; deleting the app or clearing website data permanently deletes your entries.

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

**Install it — don't just bookmark it.** Safari may delete a website's stored data after 7 days of Safari use without visiting the site. Apps added to the Home Screen are exempt, so your entries are kept.

## License

[MIT](LICENSE)
