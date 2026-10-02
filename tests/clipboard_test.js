import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { load } from "./_load.js";
const A = await load([
  "core/util.js",
  "core/math.js",
  "core/components.js",
  "core/project.js",
  "editor/mesh.js",
  "editor/assets.js",
  "editor/clipboard.js",
]);
const encode = (payload) => A.EDITOR_CLIPBOARD_PREFIX + JSON.stringify(payload);

Deno.test("cross-project clipboard preserves world placement and subtree references, imports assets and repairs collisions", () => {
  const project = A.mkProject(),
    scene = project.scenes[0],
    parent = A.mkObject("Parent"),
    model = A.mkObject("Mesh");
  parent.components.transform.position = A.v3(10, 2, 3);
  model.components.transform.position = A.v3(4, 5, 6);
  model.components.model = {
    ...A.makeComponent("model"),
    file: "mesh.obj",
    textureFile: "Color.png",
  };
  model._prefabId = "foreign";
  const shadow = A.mkObject("Shadow");
  shadow.components.shadow = { ...A.makeComponent("shadow"), caster: "Mesh" };
  model.children.push(shadow);
  parent.children.push(model);
  scene.objects.push(parent);
  const mesh = {
    id: "source",
    name: "mesh.obj",
    cat: "models",
    content: "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n",
  };
  const texture = {
    name: "Color.png",
    cat: "textures",
    dataUrl: "data:image/png;base64,YQ==",
  };
  const payload = A.parseObjectClipboard(
    encode(
      A.makeObjectClipboard(project, scene, [model.id, shadow.id], [
        mesh,
        texture,
      ]),
    ),
  );
  assertEquals(payload.objects.length, 1);
  assertEquals(
    payload.objects[0].components.transform.position,
    A.v3(14, 7, 9),
  );
  assertEquals(payload.assets.length, 2);
  const target = A.mkProject(), targetScene = target.scenes[0];
  targetScene.objects.push(A.mkObject("Mesh"));
  target.assets.push({
    ...mesh,
    content: mesh.content.replace("1 0 0", "2 0 0"),
  });
  const ids = A.pasteObjectClipboard(target, targetScene, payload);
  const pasted = A.findObj(targetScene.objects, ids[0]);
  assertEquals(pasted.components.model.file, "mesh_2.obj");
  assertEquals(pasted.components.model.textureFile, "color.png");
  assertEquals(pasted.children[0].components.shadow.caster, pasted.name);
  assert(pasted.id !== model.id);
  assertEquals(pasted._prefabId, undefined);
  assertEquals(
    target.assets[0].content,
    mesh.content.replace("1 0 0", "2 0 0"),
  );
  assert(target.assets[1].id !== mesh.id);
  assertEquals(project.assets.length, 0);
});

Deno.test("clipboard uses native custom data with portable text and passes screenshot promises during activation", async () => {
  let written, calls = 0;
  const source = {
    ClipboardItem: class {
      static supports(type) {
        return type === A.EDITOR_CLIPBOARD_TYPE;
      }
      constructor(data) {
        this.data = data;
      }
    },
    navigator: {
      clipboard: {
        write(items) {
          written = items;
          calls++;
          return Promise.resolve();
        },
      },
    },
  };
  const project = A.mkProject();
  const payload = A.makeObjectClipboard(project, project.scenes[0], [
    project.scenes[0].objects[0].id,
  ], []);
  const pending = A.writeObjectClipboard(payload, source);
  assertEquals(calls, 1);
  await pending;
  assertEquals(
    A.parseObjectClipboard(await written[0].data["text/plain"].text()),
    payload,
  );
  assertEquals(
    JSON.parse(await written[0].data[A.EDITOR_CLIPBOARD_TYPE].text()),
    payload,
  );
  const image = Promise.resolve(new Blob(["png"], { type: "image/png" }));
  const copied = A.writeCaptureClipboard(image, source);
  assertEquals(calls, 2);
  assertEquals(written[0].data["image/png"], image);
  await copied;
  source.navigator.clipboard.read = () =>
    Promise.resolve([{
      types: [A.EDITOR_CLIPBOARD_TYPE],
      getType: () => Promise.resolve(new Blob([JSON.stringify(payload)])),
    }]);
  assertEquals((await A.readEditorClipboard(source)).payload, payload);
  source.navigator.clipboard.read = () =>
    Promise.resolve([{
      types: ["image/png"],
      getType: () => Promise.resolve(new Blob(["png"], { type: "image/png" })),
    }]);
  const files = (await A.readEditorClipboard(source)).files;
  assertEquals(files[0].name, "Clipboard.png");
  assertEquals(await files[0].text(), "png");
});

Deno.test("clipboard ignores unrelated text and rejects malformed hierarchies/assets before mutation", () => {
  assertEquals(A.parseObjectClipboard("ordinary text"), null);
  const project = A.mkProject(),
    payload = A.makeObjectClipboard(project, project.scenes[0], [
      project.scenes[0].objects[0].id,
    ], []);
  assertThrows(() =>
    A.parseObjectClipboard(A.EDITOR_CLIPBOARD_PREFIX + '{"__proto__":{}}')
  );
  assertThrows(() =>
    A.parseObjectClipboard(
      encode({ ...payload, objects: [{ name: "Invalid" }] }),
    )
  );
  assertThrows(() =>
    A.parseObjectClipboard(
      encode({
        ...payload,
        assets: [{ name: "../bad.obj", cat: "models", content: "x" }],
      }),
    )
  );
  assertThrows(() =>
    A.parseObjectClipboard(
      encode({
        ...payload,
        assets: [{
          name: "image.png",
          cat: "textures",
          dataUrl: "https://example.com/private",
        }],
      }),
    )
  );
  assertEquals(project.assets.length, 0);
});
