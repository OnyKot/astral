"use strict";
(() => {
  // src/sw/worker.ts
  self.addEventListener("install", () => {
    self.skipWaiting();
  });
  self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
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
