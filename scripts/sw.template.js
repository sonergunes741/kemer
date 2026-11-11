/*
 * Kemer service worker: the whole game is precached on the first visit, so it plays offline.
 * Generated at build time by the kemer-sw plugin in vite.config.ts (version and file list).
 * Registered only for top-level, secure, self-hosted installs (never inside portal iframes).
 */
// Caches are named per install (its registration scope), so another Kemer build on this origin,
// such as a demo beside the full game, keeps its offline copy when this one updates.
const PREFIX = `kemer-${self.registration.scope}-`;
const CACHE = `${PREFIX}__VERSION__`;
const PRECACHE = __PRECACHE__;
/** Cache names from before caches were scoped (kemer-<version>): the first scoped build clears them. */
const UNSCOPED = /^kemer-\d/;
/** A page with no answer after this long (ms) is shown from the cache, when it holds a copy. */
const PAGE_TIMEOUT = 3000;

self.addEventListener('install', (event) => {
  // Every file straight from the server ('reload'): the HTTP cache may still hold the previous
  // build's page, and storing that here would pair it with assets this cache does not have.
  const requests = PRECACHE.map((path) => new Request(new URL(path, self.location.href), { cache: 'reload' }));
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(requests))
      .then(() => self.skipWaiting()),
  );
});

/**
 * Caches activate may delete: this install's from earlier builds, and unscoped ones. In a name of
 * ours only a version follows the prefix, never a '/', so an install in a sub-folder whose name
 * starts with '-' (kemer-<scope>-beta/-<version>) is not mistaken for this one.
 */
function isOutdated(key) {
  if (key === CACHE) return false;
  return UNSCOPED.test(key) || (key.startsWith(PREFIX) && !key.includes('/', PREFIX.length));
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter(isOutdated).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/**
 * Keep a copy under `key` (a page under its own path, an asset under its request); never an error
 * or a redirected answer. Never rejects: a failed write (a full disk) only means the file is
 * fetched again next time.
 */
function storeCopy(key, response) {
  if (!response.ok || response.type !== 'basic' || response.redirected) return undefined;
  const copy = response.clone();
  return caches
    .open(CACHE)
    .then((cache) => cache.put(key, copy))
    .catch(() => undefined);
}

/** The stored copy of a page, else the game (a portal link with a query, a page never seen). */
function cachedPage(key) {
  return caches
    .match(key)
    .then((hit) => hit || caches.match('./'))
    .then((hit) => hit || caches.match('./index.html'));
}

/**
 * The network's page when it comes in time and is not a server error. Otherwise the cached copy,
 * so no network, a host outage (5xx) or a stalled connection still opens the game; with nothing
 * cached, whatever the network answers in the end.
 *
 * Only a page the network served is stored, and `keep` is handed that store (or nothing) exactly
 * once. A late answer behind a cached copy is dropped: it may be a newer build's page, which this
 * cache's assets cannot serve offline, and that build's own worker precaches it with its assets.
 */
function pageResponse(network, key, keep) {
  let timer = 0;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), PAGE_TIMEOUT);
  });
  const usable = network.then(
    (response) => (response.status < 500 ? response : null),
    () => null,
  );
  // Stored before it is handed over, while its body is still unread.
  const shown = (response) => {
    keep(storeCopy(key, response));
    return response;
  };
  return Promise.race([usable, timeout])
    .then((response) => {
      clearTimeout(timer);
      if (response) return shown(response);
      return cachedPage(key).then((hit) => {
        if (!hit) return network.then(shown);
        keep(undefined);
        return hit;
      });
    })
    .catch(() => {
      keep(undefined);
      return Response.error();
    });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Network first for pages so updates arrive; the cached copy keeps them working offline. Each
    // page is stored under its own path (the privacy page must never replace the game), and a
    // redirected response is never stored: browsers refuse to serve one for a navigation.
    // 'no-cache' asks the server even when the HTTP cache holds a copy it counts as fresh: that
    // copy may be the previous build's page, whose assets are gone.
    const key = url.origin + url.pathname;
    const network = fetch(request, { cache: 'no-cache' });
    // The worker stays alive until the page it showed is stored.
    let keep = () => undefined;
    event.waitUntil(new Promise((resolve) => (keep = resolve)));
    event.respondWith(pageResponse(network, key, keep));
    return;
  }

  // Everything else is content-hashed or versioned: cache first. An asset fetched from the network
  // keeps the worker alive until its copy is stored; a cache hit or a failure has nothing to store
  // (the first call to `keep` wins).
  let keep = () => undefined;
  event.waitUntil(new Promise((resolve) => (keep = resolve)));
  event.respondWith(
    caches
      .match(request)
      .then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            keep(storeCopy(request, response));
            return response;
          }),
      )
      .finally(() => keep(undefined)),
  );
});
