"use strict";
(() => {
  // src/sw/cache.ts
  var VERSION = "dev" ? "dev" : "dev";
  var SHELL_CACHE = `astral-shell-${VERSION}`;
  var STATIC_CACHE = `astral-static-${VERSION}`;
  var MEDIA_CACHE = "astral-media-v1";
  var CACHE_PREFIX = "astral-";
  var EXPECTED_CACHES = /* @__PURE__ */ new Set([SHELL_CACHE, STATIC_CACHE, MEDIA_CACHE]);
  var SHELL_URL = "/";
  var MEDIA_MAX_ENTRIES = 600;
  var MEDIA_MAX_AGE_MS = 1e3 * 60 * 60 * 24 * 14;
  var CACHED_AT_HEADER = "x-sw-cached-at";
  var MEDIA_HOST_SUFFIXES = (true ? ".astraof.com,.asrtal.ru,.astral.media" : "").split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  var STATIC_ASSET_RE = /\/assets\/[^/]+\.(?:js|css|wasm|woff2?|ttf|otf|png|jpe?g|webp|gif|svg|avif|ico)$/i;
  var MEDIA_EXT_RE = /\.(?:png|jpe?g|webp|gif|svg|avif|apng|bmp|ico|mp4|webm|mov|m4a|mp3|ogg|opus|wav|flac)$/i;
  function isFirstPartyMediaHost(hostname) {
    return MEDIA_HOST_SUFFIXES.some(
      (suffix) => suffix.startsWith(".") ? hostname === suffix.slice(1) || hostname.endsWith(suffix) : hostname === suffix
    );
  }
  function hasMediaProxyParams(url) {
    return url.searchParams.has("format") || url.searchParams.has("width") || url.searchParams.has("height") || url.searchParams.has("quality") || url.searchParams.has("animated");
  }
  function isStaticAsset(url) {
    return STATIC_ASSET_RE.test(url.pathname);
  }
  function isMedia(url) {
    if (!isFirstPartyMediaHost(url.hostname)) return false;
    if (url.pathname.startsWith("/api") || url.pathname.startsWith("/gateway")) return false;
    return MEDIA_EXT_RE.test(url.pathname) || hasMediaProxyParams(url);
  }
  function isCacheable(response) {
    return Boolean(response) && (response.ok || response.type === "opaque");
  }
  function withTimestamp(response) {
    if (response.type === "opaque" || response.type === "opaqueredirect") {
      return response;
    }
    try {
      const headers = new Headers(response.headers);
      headers.set(CACHED_AT_HEADER, Date.now().toString());
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch {
      return response;
    }
  }
  function isExpired(response) {
    const stamp = response.headers.get(CACHED_AT_HEADER);
    if (!stamp) return false;
    const cachedAt = Number(stamp);
    if (!Number.isFinite(cachedAt)) return false;
    return Date.now() - cachedAt > MEDIA_MAX_AGE_MS;
  }
  var trimmingMedia = false;
  async function trimMediaCache(cache) {
    if (trimmingMedia) return;
    trimmingMedia = true;
    try {
      const keys = await cache.keys();
      const overflow = keys.length - MEDIA_MAX_ENTRIES;
      for (let i = 0; i < overflow; i++) {
        await cache.delete(keys[i]);
      }
    } catch {
    } finally {
      trimmingMedia = false;
    }
  }
  async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (isCacheable(response)) {
      void cache.put(request, response.clone()).catch(() => void 0);
    }
    return response;
  }
  async function networkFirstNavigation(request) {
    const cache = await caches.open(SHELL_CACHE);
    try {
      const response = await fetch(request);
      if (response && response.ok) {
        void cache.put(SHELL_URL, response.clone()).catch(() => void 0);
      }
      return response;
    } catch (error) {
      const cached = await cache.match(SHELL_URL) ?? await cache.match(request);
      if (cached) return cached;
      throw error;
    }
  }
  async function mediaCacheFirst(request) {
    const cache = await caches.open(MEDIA_CACHE);
    const cached = await cache.match(request);
    if (cached && !isExpired(cached)) {
      return cached;
    }
    try {
      const response = await fetch(request);
      if (isCacheable(response)) {
        const toStore = withTimestamp(response.clone());
        void cache.put(request, toStore).then(() => trimMediaCache(cache)).catch(() => void 0);
      }
      return response;
    } catch (error) {
      if (cached) return cached;
      throw error;
    }
  }
  async function handleInstall() {
    try {
      const cache = await caches.open(SHELL_CACHE);
      await cache.add(SHELL_URL);
    } catch {
    }
  }
  async function handleActivate() {
    try {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith(CACHE_PREFIX) && !EXPECTED_CACHES.has(name)).map((name) => caches.delete(name))
      );
    } catch {
    }
  }
  function handleFetch(event) {
    const request = event.request;
    if (request.method !== "GET") return;
    if (request.headers.has("range")) return;
    let url;
    try {
      url = new URL(request.url);
    } catch {
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    if (url.pathname.startsWith("/api") || url.pathname.startsWith("/gateway") || url.pathname.includes("error-reporting")) {
      return;
    }
    if (request.mode === "navigate") {
      event.respondWith(networkFirstNavigation(request));
      return;
    }
    if (isStaticAsset(url)) {
      event.respondWith(cacheFirst(request, STATIC_CACHE));
      return;
    }
    if (isMedia(url)) {
      event.respondWith(mediaCacheFirst(request));
      return;
    }
  }

  // src/sw/worker.ts
  self.addEventListener("install", (event) => {
    event.waitUntil(handleInstall());
    self.skipWaiting();
  });
  self.addEventListener("activate", (event) => {
    event.waitUntil(
      (async () => {
        await handleActivate();
        await self.clients.claim();
      })()
    );
  });
  self.addEventListener("fetch", (event) => {
    handleFetch(event);
  });
  self.addEventListener("message", (event) => {
    if (event.data?.type === "SKIP_WAITING") {
      self.skipWaiting();
    } else if (event.data?.type === "APP_UPDATE_BADGE") {
      const rawCount = event.data?.count;
      let badgeCount = null;
      if (typeof rawCount === "number" && Number.isFinite(rawCount)) {
        badgeCount = rawCount;
      } else if (typeof rawCount === "string" && rawCount.length > 0) {
        const parsed = Number(rawCount);
        badgeCount = Number.isFinite(parsed) ? parsed : null;
      }
      event.waitUntil(updateAppBadge(badgeCount));
    }
  });
  var getBadgeCount = (payload) => {
    const badgeValue = payload.data?.badge_count;
    if (typeof badgeValue === "number" && Number.isFinite(badgeValue)) {
      return badgeValue;
    }
    if (typeof badgeValue === "string" && badgeValue.length > 0) {
      const parsed = Number(badgeValue);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };
  var updateAppBadge = async (count) => {
    if (typeof navigator.setAppBadge !== "function" && typeof navigator.clearAppBadge !== "function") {
      return;
    }
    try {
      if (count !== null && count > 0) {
        if (typeof navigator.setAppBadge === "function") {
          await navigator.setAppBadge(count);
        }
      } else if (typeof navigator.clearAppBadge === "function") {
        await navigator.clearAppBadge();
      }
    } catch (error) {
      console.error("[SW] Failed to update app badge", error);
    }
  };
  var resolveTargetUrl = (url) => {
    if (!url) return null;
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    try {
      return new URL(url, self.location.origin).toString();
    } catch {
      return null;
    }
  };
  var postMessageToClients = async (message) => {
    try {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true
      });
      for (const client of clientList) {
        client.postMessage(message);
      }
      return clientList;
    } catch (error) {
      console.error("[SW] Unable to broadcast to clients", error);
      return [];
    }
  };
  var focusOrOpenClient = async (targetUrl, targetUserId) => {
    const message = {
      type: "NOTIFICATION_CLICK_NAVIGATE",
      url: targetUrl
    };
    if (targetUserId) {
      message.targetUserId = targetUserId;
    }
    const clientList = await postMessageToClients(message);
    const exact = clientList.find((c) => c.url === targetUrl);
    if (exact) {
      await exact.focus();
      return;
    }
    const sameOrigin = clientList.find((c) => {
      try {
        return new URL(c.url).origin === self.location.origin;
      } catch {
        return false;
      }
    });
    if (sameOrigin) {
      await sameOrigin.focus();
      return;
    }
    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  };
  self.addEventListener("push", (event) => {
    const payload = event.data?.json?.() ?? {
      title: "Astral"
    };
    const title = payload.title ?? "Astral";
    const options = {
      body: payload.body ?? void 0,
      icon: payload.icon ?? void 0,
      badge: payload.badge ?? void 0,
      data: payload.data ?? void 0
    };
    const badgeCount = getBadgeCount(payload);
    event.waitUntil(
      (async () => {
        await Promise.all([self.registration.showNotification(title, options), updateAppBadge(badgeCount)]);
      })()
    );
  });
  self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const targetUrl = resolveTargetUrl(event.notification.data?.url);
    if (!targetUrl) return;
    const targetUserId = event.notification.data?.target_user_id;
    event.waitUntil(
      (async () => {
        await focusOrOpenClient(targetUrl, targetUserId);
      })()
    );
  });
  self.addEventListener("pushsubscriptionchange", (event) => {
    event.waitUntil(
      postMessageToClients({ type: "PUSH_SUBSCRIPTION_CHANGE" }).then(() => void 0).catch(() => void 0)
    );
  });
})();
//# sourceMappingURL=sw.js.map
