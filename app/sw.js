import idb from 'idb';

/* Help from https://developers.google.com/web/fundamentals/primers/service-workers/lifecycle
  on how to use a service worker's lifecycle to cache important content 
  and serve it when it's requested */

let staticCacheName = 'restaurant-v1';
let imagesCache = 'restaurant-content-imgs';
let allCaches = [staticCacheName, imagesCache];

const dbPromise = idb.open('mws-restaurants', 1, upgradeDB => {
  switch (upgradeDB.oldVersion) {
    case 0:
      upgradeDB.createObjectStore('restaurants', { keyPath: 'id' });
  }
});

// Determine pages to cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(staticCacheName)
      .then(cache => {
        return cache.addAll([
          '/',
          '/index.html',
          '/restaurant.html',
          '/css/styles.css',
          '/js/dbhelper.js',
          '/js/main.js',
          '/js/restaurant_info.js',
          '/js/register.js',
        ])
          .catch(error => {
            console.log(`Cache failed to open ${error}.`);
          });
      }));
});

// Delete old caches that aren't being used anymore
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(cacheNames => {
    return Promise.all(cacheNames.filter(cacheName => {
      return cacheName.startsWith('restaurant-') && !allCaches.includes(cacheName);
    }).map(cacheName => {
      return caches['delete'](cacheName);
    }));
  }));
});

// Tell the cache what to respond with
self.addEventListener('fetch', function (event) {
  let requestUrl = new URL(event.request.url);

  if (requestUrl.origin === location.origin) {
    if (requestUrl.pathname === '/') {
      event.respondWith(caches.match('/index.html'));
      return;
    }

    if (requestUrl.pathname.startsWith('/images/')) {
      event.respondWith(serveImage(event.request));
      return;
    }
  }

  if (requestUrl.pathname.startsWith('/restaurant.html')) {
    if (requestUrl.port === "1337") {
      const urlPath = checkURL.pathname.split("/");
      const restaurantID = 0;
      if (urlPath[urlPath.length - 1] === 'restaurants') {
        restaurantID = -1;
      } else {
        restaurantID = urlPath[urlPath.length - 1];
      }
      event.respondWith(dbPromise
        .then(db => {
          return db
            .transaction('restaurants')
            .objectStore('restaurants')
            .get(id)
        })
        .then(restaurantData => {
          console.log(restaurantData)
        })
      )
    }
  }

  event.respondWith(
    caches.match(event.request).then(function (response) {
      return response || fetch(event.request).then(networkResponse => {
        cache.put(event.request, networkResponse.clone());
        return networkResponse;
      });
    })
  );
});

// Serve any cached requested images
function serveImage(request) {
  var storageUrl = request.url.replace(/-\d+px\.jpg$/, '');

  return caches.open(imagesCache).then(cache => {
    return cache.match(storageUrl).then(response => {
      if (response) return response;

      return fetch(request).then(networkResponse => {
        cache.put(storageUrl, networkResponse.clone());
        return networkResponse;
      });
    });
  });
}

