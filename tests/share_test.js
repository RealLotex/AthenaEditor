import { assertEquals, assertRejects } from "jsr:@std/assert@1";
const source = await Deno.readTextFile(
  new URL("../src/editor/share.js", import.meta.url),
);
function sharing(fetch = () => {}) {
  const downloads = [], revoked = [], locks = [];
  const A = new Function(
    "document",
    "URL",
    "setTimeout",
    "navigator",
    "fetch",
    source + "\nreturn { shareEditorFile, receiveSharedImages };",
  )(
    {
      createElement: () => ({
        click() {
          downloads.push(this.download);
        },
      }),
    },
    {
      createObjectURL: () => "blob:export",
      revokeObjectURL: (url) => revoked.push(url),
    },
    (fn) => fn(),
    {
      locks: {
        request: (key, callback) => {
          locks.push(key);
          return callback();
        },
      },
    },
    fetch,
  );
  return { ...A, downloads, revoked, locks };
}

Deno.test("outgoing files reach native sharing synchronously, cancellation preserves state, and unsupported formats download", async () => {
  const A = sharing(),
    file = new File(["png"], "Scene.png", { type: "image/png" });
  let calls = 0, received;
  const window = {
    navigator: {
      canShare: () => true,
      share(data) {
        calls++;
        received = data;
        return Promise.resolve();
      },
    },
  };
  const result = A.shareEditorFile(file, window);
  assertEquals(calls, 1);
  assertEquals(received.files, [file]);
  assertEquals(await result, "shared");
  window.navigator.share = () =>
    Promise.reject(new DOMException("Cancelled", "AbortError"));
  assertEquals(await A.shareEditorFile(file, window), "cancelled");
  assertEquals(A.downloads.length, 0);
  window.navigator.canShare = () => false;
  assertEquals(await A.shareEditorFile(file, window), "downloaded");
  assertEquals(A.downloads, ["Scene.png"]);
  assertEquals(A.revoked, ["blob:export"]);
  window.navigator.canShare = () => true;
  window.navigator.share = () => Promise.reject(Error("OS failure"));
  await assertRejects(
    () => A.shareEditorFile(file, window),
    Error,
    "OS failure",
  );
});

Deno.test("shared receipt is acknowledged only after project import succeeds; replacement/failure leaves it recoverable", async () => {
  const id = "00000000-0000-4000-8000-000000000000", calls = [];
  const A = sharing((path, options) => {
    calls.push([path, options.method || "GET"]);
    if (options.method === "DELETE") {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    const form = new FormData();
    form.append(
      "images",
      new File(["image"], "Art.png", { type: "image/png" }),
    );
    return Promise.resolve(new Response(form));
  });
  assertEquals(
    await A.receiveSharedImages(id, async (transfer, destination) => {
      assertEquals(destination, "Textures/Shared");
      assertEquals(await transfer.files[0].text(), "image");
      return true;
    }),
    true,
  );
  assertEquals(calls.map((call) => call[1]), ["GET", "DELETE"]);
  calls.length = 0;
  assertEquals(await A.receiveSharedImages(id, () => false), false);
  assertEquals(calls.map((call) => call[1]), ["GET"]);
  assertEquals(await A.receiveSharedImages("../invalid", () => true), false);
  assertEquals(A.locks, [`atheditor-share-${id}`, `atheditor-share-${id}`]);
});
