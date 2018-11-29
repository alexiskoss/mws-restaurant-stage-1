import idb from 'idb';

/* Help from https://developers.google.com/web/fundamentals/primers/service-workers/lifecycle
  on how to use a service worker's lifecycle to cache important content 
  and serve it when it's requested */

let staticCacheName = 'restaurant-v1';
let imagesCache = 'restaurant-content-imgs';
let allCaches = [staticCacheName, imagesCache];

const dbPromise = idb.open('mws-restaurants', 2, upgradeDB => {
  switch (upgradeDB.oldVersion) {
    case 0:
      upgradeDB.createObjectStore('restaurants', { keyPath: 'id' });
    case 1:
      upgradeDB.createObjectStore('pending', {
        keyPath: 'id',
        autoIncrement: true
      });
  }
});

/* Help from https://www.twilio.com/blog/2017/02/send-messages-when-youre-back-online-with-service-workers-and-background-sync.html
on how to implement background sync to create a queue for when requests are sent while in offline mode */
self.addEventListener('sync', function (event) {
  event.waitUntil(
    // do asynchronous tasks here
    dbPromise
      .then(db => {
        const tx = db.transaction('pending', 'readonly');
        return tx.objectStore('pending').getAll();
      }).then(requests => {
        console.log("SW REQ", requests);
        return Promise.all(requests.map(function (request) {
          console.log(`URL http://localhost:1337/restaurants/${request.body.restID}/?is_favorite=${request.body.favorite}`);
          return fetch(`http://localhost:1337/restaurants/${request.body.restID}/?is_favorite=${request.body.favorite}`, {
            method: 'PUT',
            body: JSON.stringify(request.body),
          }).then(function (data) {
            console.log(data);
            console.log("DATA STATUS", data.status);
            if (data.status === 200) {
              return dbPromise.then(db => {
                const tx = db.transaction('pending', 'readwrite')
                console.log("REQUEST ID", request);
                tx.objectStore('pending').delete(request.id);
                return tx.complete;
              });
            }
          })
        }))
      })
  );
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
          '/review.html',
          '/css/styles.css',
          '/js/dbhelper.js',
          '/js/main.js',
          '/js/restaurant_info.js',
          '/js/review.js',
          '/js/register.js',
          'https://use.fontawesome.com/releases/v5.5.0/css/all.css'
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
      return caches.delete(cacheName);
    }));
  }));
});

// Tell the cache what to respond with
self.addEventListener('fetch', function (event) {
  let requestUrl = new URL(event.request.url);
  let eventRequest = event.request;

  if (requestUrl.origin === location.origin) {
    if (requestUrl.pathname === '/') {
      event.respondWith(caches.match('/index.html'));
      return;
    }

    if (requestUrl.pathname.startsWith('/images/')) {
      event.respondWith(serveImage(eventRequest));
      return;
    }
  }

  if (requestUrl.port === '1337') {
    const urlPath = requestUrl.pathname.split('/');
    let restaurantID = 0;
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
          .get(restaurantID)
      }).then(restaurantData => {
        return ((restaurantData && restaurantData.data) || fetch(eventRequest)
          .then(fetchResponse => fetchResponse.json())
          .then(json => {
            return dbPromise.then(db => {
              const tx = db.transaction('restaurants', 'readwrite');
              tx.objectStore('restaurants').put({
                id: restaurantID,
                data: json
              });
              return json;
            });
          })
        );
      })
      .then(finalResponse => {
        return new Response(JSON.stringify(finalResponse));
      })
      .catch(error => {
        return new Response(`Error fetching data: ${error}`);
      })
    );
    return;
  }

  event.respondWith(
    caches.match(eventRequest).then(response => {
      if (response) return response;

      return fetch(eventRequest).then(networkResponse => {
        return caches.open(staticCacheName).then(cache => {
          cache.put(eventRequest, networkResponse.clone());
          return networkResponse
        })
      })
    }).catch(error => {
      console.log('Offline, cannot fetch', error);
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
    }).catch(error => {
      console.log('Offline, cannot fetch', error);
    });
  });
}
