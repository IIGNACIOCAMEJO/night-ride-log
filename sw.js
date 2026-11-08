"use strict";

const CACHE = "night-ride-log-v4-private";
const ASSETS = ["./", "./index.html", "./styles.css", "./seed.js", "./storage.js", "./api.js", "./map-gpx.js", "./maintenance.js", "./data-tools.js", "./rides.js", "./stats.js", "./game.js", "./app.js"];

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (key) { return key !== CACHE; }).map(function (key) { return caches.delete(key); })); }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) { event.respondWith(fetch(event.request)); return; }
  event.respondWith(fetch(event.request).then(function (response) {
    if (response.ok && url.origin === self.location.origin) { const copy = response.clone(); caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); }); }
    return response;
  }).catch(function () { return caches.match(event.request).then(function (cached) { if (cached) return cached; if (event.request.mode === "navigate") return caches.match("./index.html"); return Response.error(); }); }));
});
