// Only the editor shell belongs in this cache. Projects, imported files and
// PCSX2 requests keep their existing storage and always use live responses.
const SHELL_CACHE = "atheditor-shell-__ATHEDITOR_REVISION__";
const SHELL_FILES = [
  "/app/app.webmanifest",
  "/app/icon-192.png",
  "/app/icon-512.png",
  "/app/icon.svg",
];
const SHARE_CACHE = "atheditor-incoming-images";
let shareOperations = Promise.resolve();
const sharePath = (id) => `/__shared-images/${id}`;
const editorClient = (client) => {
  try { return ["/", "/AthenaEditor.html"].includes(new URL(client.url).pathname); } catch { return false; }
};

async function acceptSharedImages(event) {
  try {
    const form = await event.request.formData(), received = form.getAll("images");
    const images = received.filter((file) => file instanceof File &&
      ["image/png", "image/jpeg", ""].includes(file.type) && /\.(png|jpe?g)$/i.test(file.name));
    if (!images.length || images.length !== received.length || images.length > 32 || images.reduce((size, file) => size + file.size, 0) > 64 * 1024 * 1024) {
      return new Response("Share PNG or JPEG images (up to 64 MB per share).", { status: 400 });
    }
    const cache = await caches.open(SHARE_CACHE);
    if ((await cache.keys()).length >= 16) return new Response("Open AthEditor to import pending shared images before sharing more.", { status: 507 });
    const id = crypto.randomUUID(), data = new FormData();
    images.forEach((file) => data.append("images", file, file.name));
    const windows = (await self.clients.matchAll({ type: "window", includeUncontrolled: false })).filter((client) => editorClient(client) && client.id !== event.resultingClientId);
    windows.sort((a, b) => Number(b.focused) - Number(a.focused));
    const target = windows[0];
    const response = new Response(data);
    response.headers.set("x-atheditor-share-client", target?.id || "");
    await cache.put(sharePath(id), response);
    if (target) {
      target.postMessage({ type: "atheditor.shared-images", id });
      try { await target.focus(); } catch { /* Import still reaches the editor. */ }
      return new Response('<!doctype html><meta charset="utf-8"><title>AthEditor</title><p>Images sent to the open editor. You can close this window.</p>', { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    return Response.redirect(`${self.location.origin}/?shared=${id}`, 303);
  } catch {
    return new Response("Images could not be received. Open AthEditor and try sharing again.", { status: 503 });
  }
}

async function sharedImageRequest(event, id) {
  const cache = await caches.open(SHARE_CACHE);
  const permitted = async (response) => {
    const owner = response.headers.get("x-atheditor-share-client");
    return !owner || owner === event.clientId || !(await self.clients.get(owner));
  };
  if (!id && event.request.method === "GET") {
    const ids = [];
    for (const key of await cache.keys()) {
      const response = await cache.match(key);
      if (response && await permitted(response)) ids.push(new URL(key.url).pathname.split("/").at(-1));
    }
    return Response.json(ids);
  }
  if (!/^[a-z0-9-]{20,80}$/i.test(id || "")) return new Response("Invalid receipt", { status: 400 });
  const key = sharePath(id), response = await cache.match(key);
  if (!response) return new Response("Already received", { status: 404 });
  if (!event.clientId || !(await permitted(response))) return new Response("Sent to another editor window", { status: 409 });
  if (event.request.method === "DELETE") {
    await cache.delete(key);
    return new Response(null, { status: 204 });
  }
  if (event.request.method !== "GET") return new Response("Method not allowed", { status: 405 });
  const claimed = new Response(response.clone().body, { headers: response.headers });
  claimed.headers.set("x-atheditor-share-client", event.clientId);
  await cache.put(key, claimed);
  return response;
}

async function cacheEditorShell(response) {
  if (!response.ok || response.headers.get("x-atheditor-mode") !== "app") {
    return;
  }
  // A stopped/restarted local service needs a fresh session token. Never put
  // its credential in the offline copy; Run obtains it from the live service.
  const html = (await response.clone().text()).replace(
    /<meta name="athena-launch-token" content="[^"]*">/g,
    "",
  );
  const cache = await caches.open(SHELL_CACHE);
  await cache.put(
    "/",
    new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await cacheEditorShell(await fetch("/", { cache: "no-store" }));
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL_FILES);
  })());
  // Updates wait for the existing editor windows to close. No forced reload
  // or skipWaiting while someone is editing a project.
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("atheditor-shell-") && key !== SHELL_CACHE) {
        await caches.delete(key);
      }
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request, url = new URL(request.url);
  if (url.origin === self.location.origin && request.method === "POST" && url.pathname === "/share-images") {
    event.respondWith(acceptSharedImages(event));
    return;
  }
  if (url.origin === self.location.origin && (url.pathname === "/__shared-images" || url.pathname.startsWith("/__shared-images/"))) {
    // A worker may receive several consumers at once. Claim receipts in order
    // so only one editor imports each share, even without Web Locks support.
    const response = shareOperations.catch(() => {}).then(() => sharedImageRequest(event, url.pathname.split("/")[2]));
    shareOperations = response;
    event.respondWith(response);
    return;
  }
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  const editor = request.mode === "navigate" &&
    ["/", "/AthenaEditor.html"].includes(url.pathname);
  if (!editor && !SHELL_FILES.includes(url.pathname)) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        if (editor) {
          try {
            await cacheEditorShell(response);
          } catch {
            /* A full cache must not prevent opening the live editor. */
          }
        }
        return response;
      }
      if (response.status < 500) return response;
    } catch { /* Local service stopped: keep the editor available. */ }
    const cached = await (await caches.open(SHELL_CACHE)).match(
      editor ? "/" : url.pathname,
    );
    return cached || new Response("Open Start AthEditor to start the editor.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  })());
});
