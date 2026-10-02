import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { load } from "./_load.js";

const vendor = await Deno.readTextFile(new URL("../vendor/three.js", import.meta.url));
const module = { exports: {} };
new Function("module", "exports", vendor)(module, module.exports);
globalThis.THREE = module.exports;
const A = await load([
  "core/util.js", "core/math.js", "core/shadowmath.js", "core/theme.js", "core/components.js",
  "core/project.js", "core/storage.js", "viewport/loaders.js", "viewport/overlays.js",
  "viewport/gizmos.js", "viewport/viewport.jsx",
  "core/skybox.js", "viewport/skybox.js",
]);
const near = (a, b) => assertAlmostEquals(a, b, 1e-5);

Deno.test("model drops follow the visible surface, use the ground elsewhere and honor grid snap", () => {
  const camera = new THREE.PerspectiveCamera(55, 1, .05, 100);
  camera.position.set(0, 10, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  const content = new THREE.Group(), surface = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 4));
  surface.position.y = 1; content.add(surface); content.updateMatrixWorld(true);
  const g = { camera, content, controls: { target: new THREE.Vector3() } }, rect = { left: 100, top: 50, width: 600, height: 600 };
  const onSurface = A.viewportPlacement(g, 400, 350, rect);
  near(onSurface.y, 2);
  surface.visible = false;
  const onGround = A.viewportPlacement(g, 400, 350, rect);
  near(onGround.y, 0); near(onGround.z, 0);
  const snapped = A.viewportPlacement(g, 455, 420, rect, .5);
  for (const value of Object.values(snapped)) near(value / .5, Math.round(value / .5));
  // A ray above the horizon still places at the point the editor is looking at.
  camera.lookAt(0, 20, 0); camera.updateMatrixWorld(true);
  g.controls.target.set(3, 4, 5);
  assertEquals(A.viewportPlacement(g, 400, 350, rect), { x: 3, y: 4, z: 5 });
});

Deno.test("texture filters defer GPU upload until the image is available", () => {
  const texture = new THREE.Texture();
  const pendingVersion = texture.version;
  A.setTextureFilter(texture, "NEAREST");
  assertEquals(texture.version, pendingVersion);
  assertEquals(texture.minFilter, THREE.NearestFilter);
  texture.image = { width: 2, height: 2 };
  A.setTextureFilter(texture, "LINEAR");
  assertEquals(texture.version, pendingVersion + 1);
  assertEquals(texture.magFilter, THREE.LinearFilter);
});

Deno.test("the sky stays centred on moving cameras without entering picking or depth", () => {
  const camera = new THREE.PerspectiveCamera(55, 1, .05, 8000), mesh = new THREE.Mesh();
  const g = { camera, skybox: mesh, content: new THREE.Group() };
  camera.position.set(400, -8, 92);
  A.placeViewportSkybox(g);
  assertEquals(mesh.position.toArray(), [400, -8, 92]);
  assertEquals(mesh.scale.x, 10);
  camera.position.set(-900, 40, 3);
  A.placeViewportSkybox(g);
  assertEquals(mesh.position.toArray(), [-900, 40, 3]);
  assertEquals(g.content.children.length, 0);
});

Deno.test("switching skies frees GPU resources, including textures that finish loading late", () => {
  const original = THREE.TextureLoader.prototype.load;
  const loads = [], disposed = [];
  THREE.TextureLoader.prototype.load = function(key, done) {
    const texture = new THREE.Texture(); texture.addEventListener("dispose", () => disposed.push(key));
    loads.push({ done, texture }); return texture;
  };
  try {
    const g = { three: new THREE.Scene(), camera: new THREE.PerspectiveCamera(55, 1, .05, 8000), renderer: { setClearColor() {} } };
    const files = [{ name: "one.png", cat: "textures", dataUrl: "first" }, { name: "two.png", cat: "textures", dataUrl: "second" }];
    A.syncViewportSkybox(g, { skybox: { enabled: true, texture: "one.png", rotation: 90, brightness: .6 } }, files);
    const first = g.skybox;
    assertEquals(first.material.depthWrite, false); assertEquals(first.material.depthTest, false);
    near(first.rotation.y, Math.PI / 2); near(first.material.color.r, .6);
    A.syncViewportSkybox(g, { skybox: { enabled: true, texture: "two.png" } }, files);
    assertEquals(g.three.children.length, 1); assert(disposed.includes("first"));
    loads[0].done(loads[0].texture);
    assertEquals(disposed.filter(key => key === "first").length, 2);
    A.syncViewportSkybox(g, { skybox: { enabled: false } }, files);
    assertEquals(g.three.children.length, 0); assert(disposed.includes("second"));
  } finally { THREE.TextureLoader.prototype.load = original; }
});

Deno.test("skybox covers the terrain orthographic view at every zoom and aspect",()=>{
  const camera=new THREE.OrthographicCamera(-40,40,20,-20,.05,8000),mesh=new THREE.Mesh(),g={camera,skybox:mesh};
  for(const zoom of [.25,1,4]){
    camera.zoom=zoom;A.placeViewportSkybox(g);
    assert(mesh.scale.x>Math.hypot(40,20)/zoom,"The sphere must cover every parallel camera ray, including the corners");
    assert(mesh.scale.x<camera.far/2);
  }
});

Deno.test("hidden ancestors suppress selection helpers and picking", () => {
  const parent = new THREE.Group(), child = new THREE.Group();
  parent.add(child);
  assert(A.isViewportVisible(child));
  parent.visible = false;
  assert(!A.isViewportVisible(child));
});

Deno.test("viewport matrices match the VU0 scale-rotate-translate order", () => {
  const p = { x: 3, y: 2, z: -5 }, r = { x: .4, y: -.7, z: .3 }, s = { x: 2, y: 3, z: 4 };
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(p.x, p.y, p.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(r.x, r.y, r.z, "XYZ")),
    new THREE.Vector3(s.x, s.y, s.z),
  );
  A.matFromTRS(p, r, s).forEach((v, i) => near(v, matrix.elements[i]));
});

Deno.test("a shadow overlay matches exported corners under a transformed parent", () => {
  const parent = A.mkObject("Parent"), caster = A.mkObject("Caster"), owner = A.mkObject("Shadow");
  parent.components.transform.position = A.v3(8, 3, -4);
  parent.components.transform.rotation = A.v3(.2, .7, .1);
  parent.components.transform.scale = A.v3(2, 2, 2);
  caster.components.model = A.makeComponent("model");
  caster.components.transform.position = A.v3(1, 2, 3);
  owner.components.shadow = { ...A.makeComponent("shadow"), caster: "Caster", groundY: .4, lightDir: A.v3(1, 2, -3) };
  parent.children = [owner, caster];
  const scene = { objects: [parent] }, worlds = A.worldTransforms(scene.objects);
  const bounds = { size: A.v3(1, 2, 1), center: A.v3() };
  const node = { group: new THREE.Group(), overlays: [], bounds: null };
  const g = { helpers: new THREE.Group(), nodes: new Map([[owner.id, node], [caster.id, { bounds }]]) };
  A.syncOverlays(g, owner, node, scene, true, worlds);
  const overlay = node.overlays[0], quad = overlay.children[0].children[0];
  g.helpers.updateMatrixWorld(true);
  const sh = owner.components.shadow, world = worlds.get(caster.id);
  const proj = A.shadowProjection(sh, sh.lightDir, bounds, world.scale);
  const ground = A.shadowGroundPoint(proj, world.position, sh.groundY);
  const matrix = A.shadowMatrixFor(proj, ground, sh.groundY);
  const expected = new THREE.Matrix4().fromArray(matrix);
  for (let i = 0; i < 4; i++) {
    const point = new THREE.Vector3().fromBufferAttribute(quad.geometry.attributes.position, i);
    const actual = point.clone().applyMatrix4(quad.matrixWorld);
    const want = point.applyMatrix4(expected);
    want.y -= proj.L.y;
    near(actual.x, want.x); near(actual.y, want.y); near(actual.z, want.z);
  }
  A.syncOverlays(g, owner, node, scene, false, worlds);
  assertEquals(g.helpers.children.length, 0, "hiding overlays must remove world-space helpers too");
});

Deno.test("collider overlay applies auto-fit scale once and stays axis-aligned", () => {
  const obj = A.mkObject("Box");
  obj.components.rigidbody = A.makeComponent("rigidbody");
  obj.components.transform.scale = A.v3(2, 3, 4);
  obj.components.transform.rotation = A.v3(.5, .8, 0);
  const node = { group: new THREE.Group(), overlays: [], bounds: { size: A.v3(1, 1, 1), center: A.v3() } };
  const g = { helpers: new THREE.Group() };
  A.syncOverlays(g, obj, node, { objects: [obj] }, true);
  const size = new THREE.Box3().setFromObject(node.overlays[0]).getSize(new THREE.Vector3());
  near(size.x, 2); near(size.y, 3); near(size.z, 4);
});

Deno.test("world and local rotation drags rotate around their displayed axes", () => {
  const start = A.v3(.3, .5, .8), angle = .4;
  const parent = new THREE.Quaternion().setFromEuler(new THREE.Euler(.1, -.6, .2));
  const local = new THREE.Quaternion().setFromEuler(new THREE.Euler(start.x, start.y, start.z));
  const delta = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle);
  for (const space of ["world", "local"]) {
    const r = A.rotationForDrag(start, "x", angle, space, parent);
    const actual = parent.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(r.x, r.y, r.z)));
    const wanted = space === "world" ? delta.clone().multiply(parent).multiply(local) : parent.clone().multiply(local).multiply(delta);
    near(Math.abs(actual.dot(wanted)), 1);
  }
});

Deno.test("front-face culling and disabled texture mapping reach the viewport", () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: new THREE.Texture() }));
  A.applyModelMaterial(mesh, { face_culling: "CULL_FACE_FRONT", texture_mapping: false }, []);
  assertEquals(mesh.material.side, THREE.BackSide);
  assertEquals(mesh.material.map, null);
});

Deno.test("an obsolete asynchronous mesh load releases its geometry", async () => {
  const dispose = THREE.BufferGeometry.prototype.dispose;
  let disposed = 0;
  THREE.BufferGeometry.prototype.dispose = function () { disposed++; return dispose.call(this); };
  try {
    const obj = A.mkObject("Model");
    obj.components.model = { ...A.makeComponent("model"), file: "mesh.obj" };
    const node = { holder: new THREE.Group(), modelKey: null };
    A.syncVisual({ loadToken: 2 }, obj, node, [{ name: "mesh.obj", cat: "models", content: "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3" }], 1, () => false);
    await Promise.resolve();
    await Promise.resolve();
    assert(disposed > 0);
    assertEquals(node.holder.children.length, 0);
  } finally { THREE.BufferGeometry.prototype.dispose = dispose; }
});
