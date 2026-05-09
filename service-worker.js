self.addEventListener("install", event => {
  event.waitUntil(
    caches.open("dfna-cache").then(cache => {
      return cache.addAll([
        "index.html",
        "manifest.json",
        "dfna_last_locations.js"
      ]);
    })
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
