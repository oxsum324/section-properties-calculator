// 版本戳與 base path 由 vite build 時的 sw-inject plugin 注入；dev 環境為字面值
const CACHE_NAME = 'bolt-review-tool-d699e265e6'
const BASE_PATH = '/section-properties-calculator/anchor/'
const APP_SHELL = [
  BASE_PATH,
  BASE_PATH + 'index.html',
  BASE_PATH + 'manifest.webmanifest',
  BASE_PATH + 'icon.svg',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') {
    return
  }

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request)
          if (cachedResponse) {
            return cachedResponse
          }
          return caches.match(BASE_PATH)
        }),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse
      }

      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response
        }

        const copy = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
        return response
      })
    }),
  )
})
