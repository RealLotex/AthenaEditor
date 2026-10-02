import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { createEditorHandler, editorResponse } from "../tools/serve.js";
import { matchesEditorService } from "../tools/start.js";

const root = Deno.cwd();
const request = (path, options) =>
  new Request(`http://127.0.0.1:8080${path}`, options);

Deno.test("desktop responses are installable without live reload; portable build stays independent", async () => {
  const html =
    "<html><head><title>AthEditor</title></head><body></body></html>";
  const app = editorResponse(html, "current-token", true);
  const body = await app.text();
  assertStringIncludes(body, 'rel="manifest"');
  assertStringIncludes(body, 'name="atheditor-app"');
  assertStringIncludes(
    body,
    'name="athena-launch-token" content="current-token"',
  );
  assertEquals(app.headers.get("x-atheditor-mode"), "app");
  assert(!body.includes("EventSource"));
  const dev = await editorResponse(html, "token").text();
  assertStringIncludes(dev, "EventSource");
  assert(!dev.includes('rel="manifest"'));
  const portable = await Deno.readTextFile("AthenaEditor.html");
  assertStringIncludes(portable, "<title>AthEditor</title>");
  assert(!portable.includes('name="atheditor-app" content="1"'));
});

Deno.test("desktop server serves manifest, icons, versioned worker and live PCSX2 without caching requests", async () => {
  let playCalls = 0;
  const handler = createEditorHandler({
    root,
    launchToken: "fresh",
    appMode: true,
    play: () => {
      playCalls++;
      return Response.json({ running: false });
    },
  });
  const manifestResponse = await handler(request("/app/app.webmanifest"));
  assertStringIncludes(
    manifestResponse.headers.get("content-type"),
    "application/manifest+json",
  );
  const manifest = await manifestResponse.json();
  assertEquals(manifest.name, "AthEditor");
  assertEquals(manifest.display, "standalone");
  assertEquals(manifest.display_override, ["window-controls-overlay"]);
  assertEquals(manifest.id, "/");
  assertEquals(manifest.launch_handler.client_mode, "focus-existing");
  assertEquals(manifest.share_target.method, "POST");
  assertEquals(manifest.share_target.enctype, "multipart/form-data");
  assertEquals(manifest.share_target.params.files[0].accept, [
    "image/png",
    "image/jpeg",
    ".png",
    ".jpg",
    ".jpeg",
  ]);
  assertEquals(manifest.file_handlers[0].accept, {
    "application/vnd.atheditor.project+json": [".atheditor"],
  });
  assertEquals(manifest.shortcuts.map((item) => item.url), [
    "/?action=new",
    "/?action=recent",
  ]);
  for (const icon of manifest.icons) {
    const response = await handler(request(icon.src));
    const bytes = new Uint8Array(await response.arrayBuffer());
    assertEquals(response.status, 200);
    assertEquals([...bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(bytes.buffer);
    assertEquals(`${view.getUint32(16)}x${view.getUint32(20)}`, icon.sizes);
  }
  const worker = await handler(request("/service-worker.js"));
  const body = await worker.text();
  assertEquals(worker.headers.get("service-worker-allowed"), "/");
  assert(!body.includes("__ATHEDITOR_REVISION__"));
  assertEquals((await handler(request("/__live"))).status, 404);
  await handler(request("/__play/status"));
  assertEquals(playCalls, 1);
  assertEquals(await (await handler(request("/__app/session"))).json(), {
    token: "fresh",
  });
  assertEquals(
    (await handler(
      request("/__app/session", {
        headers: { "sec-fetch-site": "cross-site" },
      }),
    )).status,
    403,
  );
  assertEquals(
    (await handler(
      request("/__app/session", {
        headers: { origin: "https://other.example" },
      }),
    )).status,
    403,
  );
  assertEquals((await handler(request("/%"))).status, 400);
  const status = await (await handler(request("/__app/status"))).json();
  assert(matchesEditorService(status, root));
  assert(!matchesEditorService({ ...status, mode: "development" }, root));
  assert(!matchesEditorService({ ...status, root: root + "-other" }, root));
});

async function workerHarness() {
  const source = await Deno.readTextFile("app/service-worker.js");
  const handlers = {}, cached = new Map(), deleted = [], seen = [];
  const shared = new Map(), windows = [];
  const cache = {
    put: (key, response) => {
      cached.set(key, response);
    },
    match: (key) => cached.get(key)?.clone(),
    addAll: (files) => {
      files.forEach((path) => cached.set(path, new Response("icon")));
    },
  };
  let online = true,
    html =
      '<head><meta name="athena-launch-token" content="secret"></head><body>old editor</body>';
  const self = {
    location: { origin: "http://127.0.0.1:8080" },
    clients: {
      claim() {},
      matchAll: () => Promise.resolve(windows),
      get: (id) => Promise.resolve(windows.find((client) => client.id === id)),
    },
    addEventListener: (type, fn) => {
      handlers[type] = fn;
    },
  };
  const caches = {
    open: (name) =>
      name === "atheditor-incoming-images"
        ? {
          put: (key, response) => shared.set(key, response.clone()),
          match: (key) =>
            shared.get(
              typeof key === "string" ? key : new URL(key.url).pathname,
            )?.clone(),
          keys: () =>
            [...shared.keys()].map((key) =>
              new Request(self.location.origin + key)
            ),
          delete: (key) => shared.delete(key),
        }
        : cache,
    keys: () => ["atheditor-shell-old", "unrelated-data"],
    delete: (key) => {
      deleted.push(key);
    },
  };
  const fetch = (input) => {
    seen.push(input);
    if (!online) throw Error("service stopped");
    return new Response(html, { headers: { "x-atheditor-mode": "app" } });
  };
  new Function("self", "caches", "fetch", source)(self, caches, fetch);
  async function dispatch(type, request, extra = {}) {
    const pending = [];
    let response;
    handlers[type]({
      ...extra,
      request,
      waitUntil: (p) => pending.push(p),
      respondWith: (p) => {
        response = p;
      },
    });
    const result = await response;
    await Promise.all(pending);
    return result;
  }
  return {
    dispatch,
    cached,
    deleted,
    seen,
    shared,
    windows,
    setOnline: (v) => {
      online = v;
    },
    setHtml: (v) => {
      html = v;
    },
  };
}

Deno.test("incoming image shares stay outside shell cache, reach one existing editor and remain until successful import", async () => {
  const worker = await workerHarness(), messages = [];
  worker.windows.push({
    id: "editor",
    url: "http://127.0.0.1:8080/",
    focused: true,
    postMessage: (message) => messages.push(message),
    focus() {},
  });
  worker.setOnline(false);
  const form = new FormData();
  form.append(
    "images",
    new File(["image bytes"], "Reference.png", { type: "image/png" }),
  );
  const response = await worker.dispatch(
    "fetch",
    request("/share-images", { method: "POST", body: form }),
    { resultingClientId: "receipt" },
  );
  assertEquals(response.status, 200);
  assertStringIncludes(await response.text(), "open editor");
  assertEquals(messages.length, 1);
  assertEquals(worker.shared.size, 1);
  assertEquals(worker.cached.size, 0);
  const path = `/__shared-images/${messages[0].id}`;
  assertEquals(
    (await worker.dispatch("fetch", request(path), { clientId: "other" }))
      .status,
    409,
  );
  const image = await worker.dispatch("fetch", request(path), {
    clientId: "editor",
  });
  assertEquals(
    await (await image.formData()).get("images").text(),
    "image bytes",
  );
  assertEquals(worker.shared.size, 1);
  assertEquals(
    await (await worker.dispatch("fetch", request("/__shared-images"), {
      clientId: "editor",
    })).json(),
    [messages[0].id],
  );
  const ack = await worker.dispatch(
    "fetch",
    request(path, { method: "DELETE" }),
    { clientId: "editor" },
  );
  assertEquals(ack.status, 204);
  assertEquals(worker.shared.size, 0);
  assertEquals(
    (await worker.dispatch("fetch", request(path), { clientId: "editor" }))
      .status,
    404,
  );
});

Deno.test("sharing without an editor redirects to a queued receipt; simultaneous consumers claim it once; invalid input is refused", async () => {
  const worker = await workerHarness(), form = new FormData();
  form.append("images", new File(["image"], "Art.jpg", { type: "image/jpeg" }));
  const received = await worker.dispatch(
    "fetch",
    request("/share-images", { method: "POST", body: form }),
  );
  assertEquals(received.status, 303);
  const id = new URL(received.headers.get("location")).searchParams.get(
    "shared",
  );
  worker.windows.push({ id: "first", url: "http://127.0.0.1:8080/" }, {
    id: "second",
    url: "http://127.0.0.1:8080/",
  });
  const results = await Promise.all(
    ["first", "second"].map((clientId) =>
      worker.dispatch("fetch", request(`/__shared-images/${id}`), { clientId })
    ),
  );
  assertEquals(results.map((result) => result.status), [200, 409]);
  worker.windows.splice(0, 1); // A closed owner can be recovered by another editor.
  assertEquals(
    (await worker.dispatch("fetch", request(`/__shared-images/${id}`), {
      clientId: "second",
    })).status,
    200,
  );
  const bad = new FormData();
  bad.append(
    "images",
    new File(["script"], "Run.js", { type: "text/javascript" }),
  );
  assertEquals(
    (await worker.dispatch(
      "fetch",
      request("/share-images", { method: "POST", body: bad }),
    )).status,
    400,
  );
  assertEquals(worker.shared.size, 1);
});

Deno.test("offline editor caches the shell without credentials and never intercepts project or PCSX2 requests", async () => {
  const w = await workerHarness();
  await w.dispatch("install");
  await w.dispatch("activate");
  assertEquals(w.deleted, ["atheditor-shell-old"]);
  const nav = {
    method: "GET",
    mode: "navigate",
    url: "http://127.0.0.1:8080/",
  };
  w.setOnline(false);
  let response = await w.dispatch("fetch", nav);
  const offline = await response.text();
  assertStringIncludes(offline, "old editor");
  assert(!offline.includes("secret"));
  assert(!offline.includes("athena-launch-token"));
  assertEquals(
    await w.dispatch("fetch", {
      ...nav,
      url: "http://127.0.0.1:8080/__play/status",
      mode: "cors",
    }),
    undefined,
  );
  assertEquals(
    await w.dispatch("fetch", {
      ...nav,
      method: "POST",
      url: "http://127.0.0.1:8080/__play/launch",
    }),
    undefined,
  );
  assertEquals(
    await w.dispatch("fetch", {
      ...nav,
      url: "http://127.0.0.1:8080/models/edited.obj",
      mode: "cors",
    }),
    undefined,
  );
  assertEquals(
    await w.dispatch("fetch", { ...nav, url: "https://other.example/" }),
    undefined,
  );
  w.setOnline(true);
  w.setHtml("<body>new editor</body>");
  response = await w.dispatch("fetch", nav);
  assertStringIncludes(await response.text(), "new editor");
  w.setOnline(false);
  assertStringIncludes(
    await (await w.dispatch("fetch", nav)).text(),
    "new editor",
  );
});

Deno.test("Run renews a stopped service's session once and preserves the exported game", async () => {
  const source = await Deno.readTextFile("src/editor/play.js");
  const calls = [], meta = { content: "old" }, game = { main: "game" };
  const document = { querySelector: () => meta };
  const fetch = (path, options) => {
    calls.push({ path, options });
    if (path === "/__app/session") return Response.json({ token: "new" });
    return options.headers["x-athena-launch-token"] === "new"
      ? Response.json({ running: true })
      : Response.json({ error: "Forbidden" }, { status: 403 });
  };
  const run = new Function(
    "document",
    "fetch",
    source + "\nreturn editorPlayRequest;",
  )(document, fetch);
  assertEquals(await run("launch", game), { running: true });
  assertEquals(calls.map((c) => c.path), [
    "/__play/launch",
    "/__app/session",
    "/__play/launch",
  ]);
  assertEquals(calls[2].options.body, JSON.stringify(game));
  assertEquals(meta.content, "new");
});

Deno.test("Run in an offline installed editor requests a live session and explains how to start the service", async () => {
  const source = await Deno.readTextFile("src/editor/play.js");
  const document = { querySelector: () => null };
  const run = new Function(
    "document",
    "fetch",
    source + "\nreturn editorPlayRequest;",
  )(
    document,
    () => {
      throw Error("offline");
    },
  );
  let message;
  try {
    await run("status");
  } catch (error) {
    message = error.message;
  }
  assertStringIncludes(message, "Start AthEditor");
});

Deno.test("installation preserves user activation, hides after acceptance and leaves portable HTML alone", async () => {
  const source = await Deno.readTextFile("src/core/installation.js");
  const events = new Map(), effects = [], registrations = [];
  let installed = false, hosted = true;
  const promptRef = { current: null };
  const document = { querySelector: () => hosted ? {} : null };
  const window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: (name) => events.delete(name),
  };
  const navigator = {
    serviceWorker: {
      register: (path) => {
        registrations.push(path);
        return Promise.resolve();
      },
    },
  };
  const hook = new Function(
    "document",
    "window",
    "navigator",
    "useState",
    "useRef",
    "useEffect",
    source + "\nreturn useEditorInstallation;",
  )(
    document,
    window,
    navigator,
    () => [installed, (next) => {
      installed = next;
    }],
    () => promptRef,
    (fn) => effects.push(fn),
  );
  let api = hook();
  const clean = effects.pop()();
  assertEquals(registrations, ["/service-worker.js"]);
  let prompted = false, prevented = false;
  events.get("beforeinstallprompt")({
    preventDefault: () => {
      prevented = true;
    },
    prompt: () => {
      prompted = true;
      return Promise.resolve();
    },
    userChoice: Promise.resolve({ outcome: "accepted" }),
  });
  const result = api.install(() => {
    throw Error("unexpected fallback");
  });
  assert(prompted, "native prompt must be called synchronously from the click");
  assert(prevented);
  await result;
  assertEquals(hook().available, false);
  clean();
  assertEquals(events.size, 0);
  hosted = false;
  installed = false;
  api = hook();
  effects.pop()();
  assertEquals(api.available, false);
  assertEquals(registrations.length, 1);
});
