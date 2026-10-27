// Service worker : l'app (thèmes et polices compris) fonctionne hors ligne après une première visite.
// La liste PRECACHE et le nom CACHE sont écrits au build (vite.config.ts, plugin « precache »).
const CACHE = "basse-run-dev";
const PRECACHE = [];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", ...PRECACHE])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (req.mode === "navigate") {
    // Page : réseau d'abord (pour recevoir les mises à jour), cache en secours.
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r ?? caches.match("./index.html")).then((r) => r ?? caches.match("./"))),
    );
    return;
  }
  // Fichiers (noms avec empreinte, polices) : cache d'abord.
  e.respondWith(
    caches.match(req).then((hit) => hit ?? fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    })),
  );
});
