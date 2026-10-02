import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { injectLiveReload, servedPath } from "../tools/serve.js";

// ═══════════════════════════════════════════════════════════════════════
//  The dev server
//
//  `deno task serve` exists so a change to src/ shows up in the browser
//  without a manual refresh, which file:// cannot do — there is no channel
//  from the build to the page.
//
//  The one thing that must never happen is the live-reload snippet reaching
//  AthenaEditor.html on disk. That file has to stay something you double
//  click with no server anywhere; a page that opens an EventSource to a dead
//  localhost would retry forever in everyone's browser.
// ═══════════════════════════════════════════════════════════════════════

Deno.test("the snippet goes inside the body, not after the document", () => {
  const out = injectLiveReload(
    "<html><body><div id=root></div></body></html>",
    "<!--X-->",
  );
  assertEquals(out, "<html><body><div id=root></div><!--X--></body></html>");
});

Deno.test("a document with no body still gets it", () => {
  assertStringIncludes(injectLiveReload("<h1>hi</h1>", "<!--X-->"), "<!--X-->");
});

Deno.test("the local server cannot serve files outside its workspace", () => {
  const root = Deno.cwd();
  assert(
    servedPath(root, "/textures/palette.png").endsWith("/textures/palette.png"),
  );
  for (
    const path of [
      "/../outside.txt",
      "/a/../../outside.txt",
      "/..\\outside.txt",
    ]
  ) assertEquals(servedPath(root, path), null);
});

Deno.test("only the last body close is used", () => {
  // A page that mentions </body> inside a string or a script must not confuse it.
  const html =
    `<html><body><script>const s = "</body>";</script></body></html>`;
  const out = injectLiveReload(html, "<!--X-->");
  // The snippet sits immediately before the real closing tag, leaving the one
  // inside the script string untouched.
  assertEquals(
    out.indexOf("<!--X-->") + "<!--X-->".length,
    out.lastIndexOf("</body>"),
  );
  assertStringIncludes(out, `const s = "</body>";</script><!--X--></body>`);
});

Deno.test("the injected script reconnects on its own", () => {
  // The watcher's rebuild drops every open stream, so a snippet that gave up
  // on the first error would work exactly once per server start.
  const out = injectLiveReload("<body></body>");
  assertStringIncludes(out, "EventSource");
  assertStringIncludes(out, "onerror");
  assertStringIncludes(out, "setTimeout(connect");
});

Deno.test("the built artifact carries no trace of the dev server", async () => {
  const html = await Deno.readTextFile(
    new URL("../AthenaEditor.html", import.meta.url),
  );
  assert(
    !html.includes("__live"),
    "the live-reload endpoint leaked into the build",
  );
  assert(
    !html.includes("EventSource"),
    "the built file must run from file:// with no server",
  );
});
