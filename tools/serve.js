// Serve the editor from 127.0.0.1 and reload the page whenever src/ changes.
//
//   deno task serve            http://127.0.0.1:8080
//   deno task serve --port 9000
//
// Why this exists: `deno task watch` rebuilds AthenaEditor.html but you still
// have to go and hit refresh, and from file:// there is no way for the build to
// tell the page anything. Served from localhost there is: the page holds an
// EventSource open and the watcher pushes it a line when the build finishes.
//
// ── two things to know before you switch ──────────────────────────────────
//
// The live-reload snippet is injected into the RESPONSE, never into the file on
// disk. AthenaEditor.html has to stay something you can double-click with no
// server, so nothing here may leak into it.
//
// IndexedDB and localStorage are keyed by ORIGIN, and file:// and
// http://127.0.0.1:8080 are different origins. The autosaved project, the
// remembered athena.elf and the linked folder handle do not travel between
// them — you will be asked to link the folder again the first time. Both are
// secure contexts, so the File System Access API works either way.

import { build } from "./build.js";
import { fromFileUrl, resolve } from "jsr:@std/path@1";
import { createGameLauncher } from "./play.js";

// fromFileUrl, not url.pathname: this repo lives in "AthenaEnv Editor", and a
// raw pathname keeps the space as %20, which Deno.watchFs then cannot find.
const ROOT = fromFileUrl(new URL("..", import.meta.url)).replace(/[\\/]$/, "")
  .replace(/\\/g, "/");

const MIME = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  webmanifest: "application/manifest+json; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  glb: "model/gltf-binary",
  obj: "text/plain; charset=utf-8",
  ttf: "font/ttf",
  wav: "audio/wav",
  ogg: "audio/ogg",
};

const mimeOf = (path) =>
  MIME[path.split(".").pop().toLowerCase()] || "application/octet-stream";

export function servedPath(root, path) {
  const base = resolve(root).replace(/\\/g, "/");
  // Normalize URL separators before resolving dot segments. Doing this after
  // resolve leaves /..\\outside as a literal filename on POSIX, then turns it
  // into an escaping path after the workspace-prefix check has been bypassed.
  const full = resolve(root, `.${path.replace(/\\/g, "/")}`).replace(/\\/g, "/");
  return full === base || full.startsWith(`${base}/`) ? full : null;
}

/**
 * The page's half of live reload.
 *
 * It reconnects on its own, because the watcher's rebuild closes the stream
 * every time and a dev server you have to restart is worse than none.
 */
const LIVE_RELOAD = `
<script>
(() => {
  let src = null;
  const connect = () => {
    src = new EventSource("/__live");
    src.onmessage = (e) => { if (e.data === "reload") location.reload(); };
    src.onerror = () => { src.close(); setTimeout(connect, 500); };
  };
  connect();
})();
</script>`;

/**
 * Put the snippet inside the document rather than after it.
 *
 * A trailing script after </html> does run, but it lands outside the parsed
 * body and anything that later reads document.body during teardown sees a
 * surprise. Cheap to do properly.
 */
export function injectLiveReload(html, snippet = LIVE_RELOAD) {
  const at = html.lastIndexOf("</body>");
  if (at < 0) return html + snippet;
  return html.slice(0, at) + snippet + html.slice(at);
}

/** Everyone currently watching for a rebuild. */
const clients = new Set();

function broadcast(line) {
  const chunk = new TextEncoder().encode(`data: ${line}\n\n`);
  for (const c of [...clients]) {
    try {
      c.enqueue(chunk);
    } catch (_e) {
      clients.delete(c);
    }
  }
}

async function serveFile(path) {
  try {
    const body = await Deno.readFile(path);
    return new Response(body, {
      headers: {
        "content-type": mimeOf(path),
        // Never cache: the whole point is that the next request sees the edit.
        "cache-control": "no-store",
      },
    });
  } catch (_e) {
    return new Response("Not found", { status: 404 });
  }
}

export function editorResponse(html, token, appMode = false) {
  if (appMode) {
    html = html.replace(
      "</head>",
      `<meta name="atheditor-app" content="1">
<meta name="theme-color" content="#1b1e25">
<link rel="manifest" href="/app/app.webmanifest">
<link rel="icon" href="/app/icon.svg" type="image/svg+xml">
</head>`,
    );
  }
  return new Response(
    injectLiveReload(
      html,
      `<meta name="athena-launch-token" content="${token}">` +
        (appMode ? "" : LIVE_RELOAD),
    ),
    {
      headers: {
        "content-type": MIME.html,
        "cache-control": "no-store",
        "x-atheditor-mode": appMode ? "app" : "development",
      },
    },
  );
}

function localAppRequest(req) {
  const url = new URL(req.url), origin = req.headers.get("origin");
  return url.hostname === "127.0.0.1" && (!origin || origin === url.origin) &&
    req.headers.get("sec-fetch-site") !== "cross-site";
}

export function createEditorHandler(
  { root = ROOT, launchToken, appMode = false, play },
) {
  return async (req) => {
    const url = new URL(req.url);
    let path;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      return new Response("Invalid path", { status: 400 });
    }

    if (path === "/__app/status" || path === "/__app/session") {
      if (!localAppRequest(req) || req.method !== "GET") {
        return new Response("Forbidden", { status: 403 });
      }
      return Response.json(
        path.endsWith("session") ? { token: launchToken } : {
          app: "AthEditor",
          mode: appMode ? "app" : "development",
          root,
        },
        { headers: { "cache-control": "no-store" } },
      );
    }
    if (path.startsWith("/__play/")) return await play(req);
    if (path === "/share-images" || path.startsWith("/__shared-images")) {
      return new Response("Open or install AthEditor before receiving shared images.", { status: 503, headers: { "cache-control": "no-store" } });
    }
    if (path === "/service-worker.js") {
      if (!appMode) return new Response("Not found", { status: 404 });
      const html = await Deno.readFile(`${root}/AthenaEditor.html`);
      const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", html));
      const revision = Array.from(
        hash.slice(0, 12),
        (x) => x.toString(16).padStart(2, "0"),
      ).join("");
      const worker = (await Deno.readTextFile(`${root}/app/service-worker.js`))
        .replace("__ATHEDITOR_REVISION__", revision);
      return new Response(worker, {
        headers: {
          "content-type": MIME.js,
          "cache-control": "no-store",
          "service-worker-allowed": "/",
        },
      });
    }
    if (path === "/__live") {
      if (appMode) return new Response("Not found", { status: 404 });
      let self;
      const stream = new ReadableStream({
        start(controller) {
          self = controller;
          clients.add(controller);
          controller.enqueue(new TextEncoder().encode(": connected\n\n"));
        },
        cancel() {
          clients.delete(self);
        },
      });
      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-store",
          connection: "keep-alive",
        },
      });
    }
    if (path === "/") path = "/AthenaEditor.html";
    const full = servedPath(root, path);
    if (!full) return new Response("Forbidden", { status: 403 });
    if (path.endsWith(".html")) {
      try {
        return editorResponse(
          await Deno.readTextFile(full),
          launchToken,
          appMode,
        );
      } catch {
        return new Response("Not found", { status: 404 });
      }
    }
    return await serveFile(full);
  };
}

async function main() {
  const launchToken = crypto.randomUUID();
  const play = createGameLauncher(ROOT, launchToken);
  const argv = Deno.args;
  const appMode = argv.includes("--app");
  const portArg = argv.indexOf("--port");
  const port = portArg >= 0 ? Number(argv[portArg + 1]) : 8080;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw Error("Invalid port.");
  }

  try {
    await build({ quiet: false });
  } catch (e) {
    console.error(`initial build failed: ${e.message}`);
  }

  // Rebuild on change, then tell every open page. Debounced, because a single
  // save from an editor produces several filesystem events. Wrapped, because a
  // watcher that cannot start is a reason to lose live reload, not the server.
  if (!appMode) {
    (async () => {
      let watcher;
      try {
        watcher = Deno.watchFs(`${ROOT}/src`);
      } catch (e) {
        console.error(`live reload is off: ${e.message}`);
        return;
      }
      let timer;
      for await (const _ of watcher) {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          try {
            await build({ quiet: false });
            broadcast("reload");
          } catch (e) {
            console.error(e.message);
            // Leave the page alone on a failed build: reloading into a stale
            // file just hides the error message that is on this terminal.
          }
        }, 80);
      }
    })();
  }

  console.log(`\n  editor   http://127.0.0.1:${port}/`);
  console.log(
    appMode
      ? "  AthEditor — ready to install in Chrome or Edge"
      : `  watching src/ — the page reloads itself on a successful build`,
  );
  console.log(`  note: this is a different origin from file://, so the linked`);
  console.log(`        folder and the autosave start empty here.\n`);

  Deno.serve(
    { port, hostname: "127.0.0.1" },
    createEditorHandler({
      root: ROOT,
      launchToken,
      appMode,
      play,
    }),
  );
}

if (import.meta.main) await main();
