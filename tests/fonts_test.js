import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from "jsr:@std/assert@1";

const source = (await Promise.all([
  "core/util.js",
  "core/components.js",
  "core/project.js",
  "editor/assets.js",
  "editor/fonts.js",
].map((path) => Deno.readTextFile(new URL(`../src/${path}`, import.meta.url)))))
  .join("\n");
const A = new Function(
  "fsReadAsDataUrl",
  source +
    "\nreturn { inspectFontBytes, readHUDfont, attachHUDfont, hudFontFamily, mkProject, mkUIEl };",
)(
  async (file) =>
    `data:${file.type};base64,${
      btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer())))
    }`,
);
function fontBytes(signature = "\x00\x01\x00\x00", extra = []) {
  const tables = [
    "head",
    "hhea",
    "maxp",
    "hmtx",
    "cmap",
    ...(signature === "OTTO" ? ["CFF "] : ["glyf", "loca"]),
    ...extra,
  ];
  const buffer = new ArrayBuffer(12 + tables.length * 16 + 4),
    bytes = new Uint8Array(buffer),
    view = new DataView(buffer);
  bytes.set([...signature].map((ch) => ch.charCodeAt(0)));
  view.setUint16(4, tables.length);
  tables.forEach((tag, i) => {
    const pos = 12 + i * 16;
    bytes.set([...tag].map((ch) => ch.charCodeAt(0)), pos);
    view.setUint32(pos + 8, buffer.byteLength - 4);
    view.setUint32(pos + 12, 4);
  });
  return buffer;
}

Deno.test("HUD font validation accepts static TrueType/CFF faces and rejects wrappers, collections, variable and truncated fonts", () => {
  assertEquals(A.inspectFontBytes(fontBytes()), "ttf");
  assertEquals(A.inspectFontBytes(fontBytes("OTTO")), "otf");
  for (const sig of ["ttcf", "wOFF", "wOF2", "typ1"]) {
    assertThrows(() => A.inspectFontBytes(fontBytes(sig)));
  }
  assertThrows(
    () => A.inspectFontBytes(fontBytes("\x00\x01\x00\x00", ["fvar"])),
    Error,
    "static",
  );
  assertThrows(
    () => A.inspectFontBytes(fontBytes().slice(0, 10)),
    Error,
    "incomplete",
  );
  const bad = fontBytes();
  new DataView(bad).setUint32(20, 0xffffffff);
  assertThrows(() => A.inspectFontBytes(bad), Error, "incomplete table");
});

Deno.test("font import verifies decoding before returning an embedded portable asset", async () => {
  const buffer = fontBytes();
  let verified = false;
  const asset = await A.readHUDfont(new Blob([buffer]), "My Font Regular", {
    FontFace: class {
      constructor(_name, bytes) {
        assertEquals(new Uint8Array(bytes), new Uint8Array(buffer));
      }
      load() {
        verified = true;
        return Promise.resolve(this);
      }
    },
  });
  assert(verified);
  assertEquals(asset.name, "my_font_regular.ttf");
  assertEquals(asset.cat, "fonts");
  assertEquals(asset.libraryFolder, "Imported");
  assertEquals(
    atob(asset.dataUrl.split(",")[1]),
    String.fromCharCode(...new Uint8Array(buffer)),
  );
  await assertRejects(
    () =>
      A.readHUDfont(new Blob([buffer]), "Broken", {
        FontFace: class {
          load() {
            return Promise.reject(Error("Cannot decode font"));
          }
        },
      }),
    Error,
    "Cannot decode",
  );
});

Deno.test("attaching fonts reuses identical bytes, preserves other fonts and refuses stale HUD selections", () => {
  const project = A.mkProject(),
    scene = project.scenes[0],
    text = A.mkUIEl("Text");
  scene.uiElements.push(text);
  project.assets = [{
    name: "Label.ttf",
    cat: "fonts",
    dataUrl: "data:font/ttf;base64,YQ==",
  }];
  const asset = {
    name: "Label.ttf",
    cat: "fonts",
    dataUrl: "data:font/ttf;base64,Yg==",
    libraryFolder: "Imported",
  };
  const added = A.attachHUDfont(project, scene.id, text.id, asset);
  assertEquals(added.name, "label_2.ttf");
  assertEquals(text.fontFile, added.name);
  assertEquals(project.assets.length, 2);
  assertEquals(A.attachHUDfont(project, scene.id, text.id, asset).id, added.id);
  assertEquals(project.assets.length, 2);
  assertEquals(A.attachHUDfont(project, scene.id, "deleted", asset), null);
  assertEquals(A.attachHUDfont(project, "old-scene", text.id, asset), null);
  assert(A.hudFontFamily("A-B.ttf") !== A.hudFontFamily("A_B.ttf"));
});
