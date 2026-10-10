import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { load } from "./_load.js";

const vendor = await Deno.readTextFile(new URL("../vendor/three.js", import.meta.url));
const module = { exports: {} };
new Function("module", "exports", vendor)(module, module.exports);
globalThis.THREE = module.exports;
const A = await load([
  "core/util.js", "core/math.js", "core/shadowmath.js", "core/theme.js", "core/components.js",
  "core/project.js", "core/storage.js", "viewport/loaders.js", "viewport/overlays.js",
  "viewport/gizmos.js", "viewport/viewport.jsx", "editor/mesh.js", "editor/terrain.js",
  "core/imagesize.js", "core/skybox.js", "viewport/skybox.js",
  "core/water.js", "core/water-cache.js", "viewport/water.js",
  "core/particles.js", "viewport/particles.js",
]);
const near = (a, b) => assertAlmostEquals(a, b, 1e-5);

Deno.test('same-size asset edits invalidate the preview, while a bounds annotation does not',()=>{
  const file={id:'mesh',size:3,content:'1 2'},revision=A.assetRevision(file);
  assertEquals(A.assetRevision({...file,bounds:{min:[0,0,0]}}),revision);
  file.content='3 4';assert(A.assetRevision(file)!==revision);
});

Deno.test('viewport buffers remain bounded and framing ignores invisible distant geometry',()=>{
  const ratio=A.viewportPixelRatio(3840,2160,3);assert(3840*2160*ratio*ratio<=2000001);
  const root=new THREE.Group(),visible=new THREE.Mesh(new THREE.BoxGeometry(2,2,2)),hidden=new THREE.Mesh(new THREE.BoxGeometry(2,2,2));
  hidden.position.x=10000;hidden.visible=false;root.add(visible,hidden);
  const bounds=A.expandVisibleViewportBounds(new THREE.Box3(),root);assertEquals(bounds.max.x,1);assertEquals(bounds.min.x,-1);
  A.disposeObject(root);
});

Deno.test('subtree cleanup releases shared texture slots and materials exactly once',()=>{
  const root=new THREE.Group(),texture=new THREE.Texture(),material=new THREE.MeshStandardMaterial({map:texture,normalMap:texture});
  const geometry=new THREE.BoxGeometry();root.add(new THREE.Mesh(geometry,material),new THREE.Mesh(geometry,material));
  const counts={texture:0,material:0,geometry:0};
  texture.addEventListener('dispose',()=>counts.texture++);material.addEventListener('dispose',()=>counts.material++);geometry.addEventListener('dispose',()=>counts.geometry++);
  A.disposeObject(root);assertEquals(counts,{texture:1,material:1,geometry:1});
});

Deno.test("water preview repeats ripples, keeps seafloor depth and advances the shared geometry rules",()=>{
  const root=new THREE.Mesh(new THREE.PlaneGeometry(1,1,8,8),new THREE.MeshBasicMaterial({map:new THREE.Texture()}));root.geometry.rotateX(-Math.PI/2);
  A.configureWaterPreview(root,{opacity:.4,tiling:4,flow:{x:.02,z:.01},waveHeight:.05},[]);
  assertEquals(root.material.map.wrapS,THREE.RepeatWrapping);assertEquals(root.material.depthWrite,false);near(root.material.opacity,.4);
  const uv=root.geometry.attributes.uv.array[0],state=root.userData.waterEntries[0];
  A.advanceWaterPreview(root,.1);assert(root.geometry.attributes.uv.array[0]!==uv);assert(state.phase>0);
  A.disposeObject(root);
});

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

Deno.test("terrain preview applies filter, shading and pipeline edits without repainting terrain", () => {
  const original = THREE.TextureLoader.prototype.load;
  THREE.TextureLoader.prototype.load = function() { const texture = new THREE.Texture(); texture.image = { width: 16, height: 16 }; return texture; };
  const obj = { components: { model: { textureFile: "atlas.png", textureFilter: "NEAREST", pipeline: "PL_DEFAULT", shade_model: "SHADE_GOURAUD", face_culling: "CULL_FACE_BACK" } }, _terrainPreview: A.makeTerrain(4,4) };
  const node = { holder: new THREE.Group() }, files = [{name:"atlas.png",cat:"textures",dataUrl:"data:image/png;base64,AQ=="}];
  const sync = () => { A.syncVisual({},obj,node,files,1,()=>false); return node.holder.children[0]; };
  try {
    let visual = sync();
    assertEquals(visual.material.map.magFilter,THREE.NearestFilter);
    assertEquals(visual.material.flatShading,false);
    obj.components.model.textureFilter="LINEAR";
    visual=sync(); assertEquals(visual.material.map.magFilter,THREE.LinearFilter);
    obj.components.model.shade_model="SHADE_FLAT";
    visual=sync(); assertEquals(visual.material.flatShading,true);
    assertEquals(visual.material.map.magFilter,THREE.LinearFilter);
    obj.components.model.pipeline="PL_NO_LIGHTS";
    visual=sync(); assert(visual.material.isMeshBasicMaterial);
    obj.components.model.texture_mapping=false;
    assertEquals(sync().material.map,null);
  } finally { THREE.TextureLoader.prototype.load=original; }
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
    assertEquals(first.children[0].material.depthWrite, false); assertEquals(first.children[0].material.depthTest, false);
    near(first.rotation.y, Math.PI / 2); near(first.children[0].material.color.r, .6);
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

Deno.test("upper-only backdrops cover downward cameras, blend before objects and dispose shared textures once",()=>{
  const original=THREE.TextureLoader.prototype.load,loads=[],disposed=[];
  THREE.TextureLoader.prototype.load=function(key){const texture=new THREE.Texture();texture.addEventListener("dispose",()=>disposed.push(key));loads.push(key);return texture;};
  try{
    const camera=new THREE.PerspectiveCamera(40.074,640/448,1,4000);
    camera.position.set(0,4.75,7.51);camera.lookAt(0,2,0);camera.updateMatrixWorld(true);
    const g={camera,three:new THREE.Scene(),renderer:{setClearColor(){}}};
    A.syncViewportSkybox(g,{skybox:{enabled:true,texture:"sky.png",textureSize:1024,bitDepth:16,upperOnly:true,tiles:["left.bmp","right.bmp"]}},[
      {cat:"textures",name:"sky.png",dataUrl:"original"},{cat:"textures",name:"left.bmp",dataUrl:"left"},{cat:"textures",name:"right.bmp",dataUrl:"right"}
    ]);
    g.three.updateMatrixWorld(true);assertEquals(loads,["left","right"]);
    const ray=new THREE.Raycaster();
    for(const x of [-.95,0,.95])for(const y of [-.95,0]){
      ray.setFromCamera(new THREE.Vector2(x,y),camera);const hits=ray.intersectObject(g.skybox,true);
      assert(hits.length>0,"A downward game camera must see the sky background");assertEquals(hits[0].object,g.skyboxBackdrop);
    }
    assertEquals(g.skyboxBackdrop.material.transparent,false);assertEquals(g.skyboxBackdrop.material.blending,THREE.CustomBlending);
    assert(g.skyboxBackdrop.renderOrder>-1000&&g.skyboxBackdrop.renderOrder<0);
    const previous=g.skyboxBackdrop;
    A.syncViewportSkybox(g,{skybox:{enabled:true,texture:'sky.png',textureSize:1024,bitDepth:16,upperOnly:true,tiles:['left.bmp','right.bmp'],backdropMode:'solid',backdropColor:{r:255,g:0,b:0}}},[
      {cat:'textures',name:'sky.png',dataUrl:'original'},{cat:'textures',name:'left.bmp',dataUrl:'left'},{cat:'textures',name:'right.bmp',dataUrl:'right'}
    ]);
    assert(previous!==g.skyboxBackdrop);assertEquals(loads,['left','right'],"Dragging colors must not reload sky textures");
    A.clearViewportSkybox(g);assertEquals(disposed.sort(),["left","right"]);assertEquals(g.three.children.length,0);
  }finally{THREE.TextureLoader.prototype.load=original;}
});
