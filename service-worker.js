// Bump on each release so installed clients pick up new files.
const VERSION = "v7";
const CACHE = `bf-tracker-${VERSION}`;

const PRECACHE = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "calc.js",
  "csv.js",
  "manifest.json",
  "icons/favicon.svg",
  "icons/favicon-32.png",
  "icons/favicon-64.png",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // cache: "reload" bypasses the HTTP cache (GitHub Pages: max-age=600),
      // otherwise a new version can be filled with stale files.
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

// Cache-first; ignoreSearch so "index.html?source=pwa" etc. still hit.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches
      .match(event.request, { ignoreSearch: true })
      .then((cached) => cached || fetch(event.request))
  );
});
