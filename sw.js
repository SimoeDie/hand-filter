const CACHE = "hand-filter-pwa-v2";
const PRECACHE = [
    "./",
    "./index.html",
    "./manifest.json",
    "./sketch.js",
    "./gesture-tap.js",
    "./friend-cutout.js",
    "./lib/p5.min.js",
    "./lib/ml5.min.js",
    "./workshok-logo-px.png",
    "./glitch-your-face.png",
    "./hand-cursor.png",
    "./icon-192.png",
    "./icon-512.png",
    "./apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
    e.waitUntil(
        caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (e) => {
    e.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (e) => {
    if (e.request.method !== "GET") return;
    const url = new URL(e.request.url);
    if (url.origin !== location.origin) return;

    const isDocOrScript = e.request.mode === "navigate" ||
        url.pathname.endsWith(".html") ||
        url.pathname.endsWith(".js");

    if (isDocOrScript) {
        e.respondWith(
            fetch(e.request).then((res) => {
                const copy = res.clone();
                caches.open(CACHE).then((cache) => cache.put(e.request, copy));
                return res;
            }).catch(() => caches.match(e.request).then((hit) => hit || caches.match("./index.html")))
        );
        return;
    }

    e.respondWith(
        caches.match(e.request).then((cached) => {
            if (cached) return cached;
            return fetch(e.request).then((res) => {
                const copy = res.clone();
                caches.open(CACHE).then((cache) => cache.put(e.request, copy));
                return res;
            });
        })
    );
});
