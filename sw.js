/* DuoPet - service worker
   - index.html: SEMPRE da rede primeiro (sem cache do navegador/CDN), então ao publicar uma versão nova ela chega na hora.
     Só usa a cópia guardada quando está sem internet.
   - ícones e Firebase SDK: guarda uma cópia e atualiza em segundo plano (o jogo abre offline).
   - Nunca mexe em chamadas ao Firestore/Auth (elas têm cache próprio). */
const CACHE = "duopet-static-v1";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => {})))));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("duopet-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function networkFirst(req) {
  const u = new URL(req.url), key = u.origin + u.pathname, cache = await caches.open(CACHE);
  try {
    const res = await fetch(key, { cache: "no-store", credentials: "same-origin" });
    if (res && res.ok) { cache.put(key, res.clone()); if (u.pathname.endsWith("/")) cache.put(key + "index.html", res.clone()); }
    return res;
  } catch (err) {
    return (await cache.match(key)) || (await cache.match(new URL("./index.html", self.registration.scope).href)) || Response.error();
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE), hit = await cache.match(req);
  const net = fetch(req).then(res => { if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (u.search.includes("chk=")) return;                                   // checagem de versão: sempre direto da rede
  const sameOrigin = u.origin === self.location.origin;
  if (sameOrigin && (req.mode === "navigate" || u.pathname.endsWith("/") || u.pathname.endsWith(".html"))) { e.respondWith(networkFirst(req)); return; }
  if (u.hostname === "www.gstatic.com" && u.pathname.startsWith("/firebasejs/")) { e.respondWith(staleWhileRevalidate(req)); return; }
  if (sameOrigin && /\.(png|webmanifest|ico|svg)$/.test(u.pathname)) { e.respondWith(staleWhileRevalidate(req)); }
});
