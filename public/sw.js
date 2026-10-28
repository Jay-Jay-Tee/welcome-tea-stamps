// Keeps the card and stall pages openable when the venue wifi dies. Network first, cache as fallback.
// API calls other than /api/config are never cached: stamps must come from the server.
const CACHE = "stamps-v9";
const SHELL = ["/", "/index.html", "/stall.html", "/style.css", "/icons.js", "/bug-certificate.js", "/logo.png", "/favicon.svg", "/vendor/jsqr.js", "/api/config"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || !SHELL.includes(url.pathname)) return;
  // Wait up to 4 seconds for the network, then use the saved copy.
  const net = fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(url.pathname, copy)); }
    return r;
  });
  const timeout = new Promise((_, no) => setTimeout(no, 4000));
  e.respondWith(
    Promise.race([net, timeout]).catch(() => caches.match(url.pathname).then((hit) => hit || net)),
  );
});
