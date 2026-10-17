// Turn service worker: makes the app installable. Network-only on purpose: committee data must
// always be read live from Arkiv, never from a stale cache.
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))
self.addEventListener("fetch", () => {})
