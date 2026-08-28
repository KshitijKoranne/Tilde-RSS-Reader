/* Tilde's service worker.
 *
 * Your articles already live in IndexedDB, so the only thing standing between
 * you and reading on a plane is the app shell itself. This caches that shell.
 *
 * Two deliberate rules:
 *   - HTML is network-first, so a deploy is never held back by a stale cache.
 *     Only when the network fails do we serve the cached shell.
 *   - /api/feed is never cached. Feeds are the one thing that must be live,
 *     and caching them here would fight the proxy's own Cache-Control.
 */

const VERSION = 'v1'
const SHELL = `tilde-shell-${VERSION}`
const ASSETS = `tilde-assets-${VERSION}`

// Hashed filenames are only known at build time, so the shell list stays to
// what is stable. Everything under /assets/ is picked up as it is requested.
const SHELL_URLS = ['/', '/app', '/manifest.webmanifest', '/tilde-icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== SHELL && key !== ASSETS).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

async function networkFirst(request, cacheName, fallback) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response && response.ok) cache.put(request, response.clone())
    return response
  } catch (error) {
    const cached = (await cache.match(request)) || (fallback && (await cache.match(fallback)))
    if (cached) return cached
    throw error
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response && response.ok) cache.put(request, response.clone())
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL, '/app'))
    return
  }

  // Content-hashed build output: safe to serve from cache forever.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSETS))
    return
  }

  if (/\.(png|svg|webmanifest|woff2?)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, SHELL))
  }
})
