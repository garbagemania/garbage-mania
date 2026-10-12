/* Garbage Mania service worker.
 * Deliberately tiny and safe: it makes the app installable and shows a friendly
 * offline page when the network is down. It NEVER caches signed-in pages or API
 * responses, so no one can see another person's data from a cache. */
const OFFLINE_URL = "/offline.html";
const CACHE = "gm-offline-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE_URL, "/brand/garbage-mania-logo.png"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate") return; // only page navigations; everything else goes straight to the network
  event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
});
