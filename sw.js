/* Offline support.
   Shell files: served from the saved copy at once, refreshed in the background.
   Edition data: fetched fresh when online, served from the saved copy when not. */

const VERSION = "v6";
const SHELL = "briefing-shell-" + VERSION;
const DATA = "briefing-data";

const SHELL_FILES = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "manifest.webmanifest",
  "fonts/barlow-condensed-700.woff2",
  "fonts/barlow-400.woff2",
  "fonts/barlow-500.woff2",
  "pictures/amida.webp",
  "pictures/kirifuri.webp",
  "pictures/yoshitsune.webp",
  "pictures/yoro.webp",
  "pictures/ono.webp",
  "pictures/aoigaoka.webp",
  "pictures/roben.webp",
  "pictures/kiyotaki.webp",
  "icons/icon-192.png",
  "icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k.startsWith("briefing-shell-") && k !== SHELL)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fromCache(response) {
  const headers = new Headers(response.headers);
  headers.set("x-briefing-cache", "1");
  return response.blob().then((body) => new Response(body, { status: response.status, statusText: response.statusText, headers }));
}

async function dataFirstNetwork(request) {
  const cache = await caches.open(DATA);
  const key = new URL(request.url).pathname;
  try {
    const fresh = await fetch(request.url, { cache: "no-store" });
    if (fresh.ok) {
      cache.put(key, fresh.clone());
      return fresh;
    }
    throw new Error("bad status " + fresh.status);
  } catch (err) {
    const saved = await cache.match(key);
    if (saved) return fromCache(saved);
    throw err;
  }
}

async function shellFirstCache(request) {
  const cache = await caches.open(SHELL);
  const saved = await cache.match(request, { ignoreSearch: true });
  const refresh = fetch(request).then((fresh) => {
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  });
  if (saved) {
    refresh.catch(() => {});
    return saved;
  }
  try {
    return await refresh;
  } catch (err) {
    if (request.mode === "navigate") {
      const page = await cache.match("index.html");
      if (page) return page;
    }
    throw err;
  }
}

/* Notifications. Each push carries { title, body, url } and must always show something. */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = { title: "Daily Briefing", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(self.registration.showNotification(data.title || "Daily Briefing", {
    body: data.body || "",
    icon: "icons/icon-192.png",
    data: { url: data.url || "#/" }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const hash = String((event.notification.data && event.notification.data.url) || "#/");
  const target = new URL("./" + (hash.startsWith("#") ? hash : "#/"), self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(self.registration.scope));
    if (open) {
      open.postMessage({ type: "open", hash });
      return open.focus();
    }
    return self.clients.openWindow(target);
  }));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes("/data/") && url.pathname.endsWith(".json")) {
    event.respondWith(dataFirstNetwork(request));
  } else {
    event.respondWith(shellFirstCache(request));
  }
});
