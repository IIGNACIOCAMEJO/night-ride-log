"use strict";

const CACHE = "night-ride-log-v2-neon-run";
const ASSETS = ["./", "./index.html", "./styles.css", "./seed.js", "./storage.js", "./rides.js", "./stats.js", "./game.js", "./app.js"];

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (key) { return key !== CACHE; }).map(function (key) { return caches.delete(key); })); }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).then(function (response) {
    const copy = response.clone(); caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); }); return response;
  }).catch(function () { return caches.match(event.request).then(function (cached) { return cached || caches.match("./index.html"); }); }));
});
