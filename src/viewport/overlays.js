// ═══════════════════════════════════════════════════════════════════════
//  OVERLAYS — non-rendering helpers drawn in the viewport
//
//  Colliders, shadow footprints, light directions and camera frustums.
//  These are what make invisible components editable: without them a
//  Rigidbody or a Shadow is just a row in the Inspector.
// ═══════════════════════════════════════════════════════════════════════

const OVERLAY_ORDER = 900;

function isViewportVisible(object) {
  for (let node = object; node; node = node.parent) if (!node.visible) return false;
  return true;
}

const overlayMaterial = (hex, opacity = 1) =>
  new THREE.LineBasicMaterial({ color: hex, depthTest: false, transparent: true, opacity });

function markOverlay(obj, tag) {
  obj.renderOrder = OVERLAY_ORDER;
  obj.userData.overlay = tag;
  obj.traverse?.((ch) => { ch.renderOrder = OVERLAY_ORDER; ch.userData.overlay = tag; });
  return obj;
}

/** Wireframe for a Rigidbody's collider, in its own world placement. */
function buildColliderOverlay(rb, bounds, worldScale) {
  const color = hexToInt(COMPONENTS.rigidbody.color, 0xff8844);
  const mat = overlayMaterial(color, rb.mode === "trigger" ? 0.55 : 0.9);
  let geo;

  const size = rb.autoFit && bounds
    ? { x: bounds.size.x * Math.abs(worldScale?.x ?? 1), y: bounds.size.y * Math.abs(worldScale?.y ?? 1), z: bounds.size.z * Math.abs(worldScale?.z ?? 1) }
    : (rb.size || { x: 1, y: 1, z: 1 });
  const radius = rb.autoFit && bounds ? Math.max(size.x, size.y, size.z) / 2 : (rb.radius ?? 0.5);

  switch (rb.shape) {
    case "sphere":
      geo = new THREE.SphereGeometry(Math.max(radius, 1e-3), 14, 10);
      break;
    case "plane": {
      const g = new THREE.GridHelper(20, 20, color, color);
      g.material.depthTest = false;
      g.material.transparent = true;
      g.material.opacity = 0.32;
      return markOverlay(g, "collider");
    }
    case "ray": {
      const len = Math.max(rb.rayLength ?? 5, 0.01);
      const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -len, 0)];
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
      return markOverlay(line, "collider");
    }
    case "mesh":
      geo = new THREE.BoxGeometry(
        Math.max(bounds?.size.x ?? 1, 1e-3),
        Math.max(bounds?.size.y ?? 1, 1e-3),
        Math.max(bounds?.size.z ?? 1, 1e-3),
      );
      break;
    default:
      geo = new THREE.BoxGeometry(
        Math.max(size.x, 1e-3), Math.max(size.y, 1e-3), Math.max(size.z, 1e-3),
      );
  }

  const wire = new THREE.LineSegments(new THREE.EdgesGeometry(geo), mat);
  geo.dispose();
  return markOverlay(wire, "collider");
}

/**
 * Where a shadow decal actually lands, plus an arrow toward its light.
 *
 * Everything comes from shadowProjection(), the same function the generator
 * emits from, so the turned and foreshortened quad you see here is the one the
 * PS2 draws — including the slide down the light onto the ground, which is why
 * a shadow does not sit under its caster once the sun is off vertical.
 *
 * The overlay lives in world space, so a parent cannot rotate or scale it twice.
 */
function buildShadowOverlay(shadow, lightDir, bounds, worldScale, worldPos) {
  const color = hexToInt(COMPONENTS.shadow.color, 0xaa88ff);
  const group = new THREE.Group();
  const proj = shadowProjection(shadow, lightDir, bounds, worldScale);
  const groundY = shadow.groundY ?? 0;

  const sx = Math.max(proj.sizeX, 0.01) / 2;
  const sz = Math.max(proj.sizeZ, 0.01) / 2;

  // Slide the caster's origin down the light onto the ground. Light Offset slides the
  // finished decal on top of it.
  const g = shadowGroundPoint(proj, worldPos || { x: 0, y: 0, z: 0 }, groundY);
  const off = num(shadow.lightOffset, 0);
  group.position.set(
    g.x - proj.L.x * off,
    groundY,
    g.z - proj.L.z * off,
  );
  // Turned onto the light's azimuth. Local +X lies across the light, +Z along
  // it — the same convention the decal's UVs use.
  group.rotation.set(0, -proj.phi, 0, "ZYX");

  const quad = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-sx, 0, -sz), new THREE.Vector3(sx, 0, -sz),
      new THREE.Vector3(sx, 0, sz), new THREE.Vector3(-sx, 0, sz),
    ]),
    overlayMaterial(color, 0.95),
  );
  group.add(quad);

  // Grid lines hint at the tesselation that follows uneven ground.
  const gx = clamp(shadow.grid?.x ?? 12, 2, 24);
  const gz = clamp(shadow.grid?.z ?? 12, 2, 24);
  const pts = [];
  for (let i = 1; i < gx; i++) {
    const x = -sx + (i / gx) * sx * 2;
    pts.push(new THREE.Vector3(x, 0, -sz), new THREE.Vector3(x, 0, sz));
  }
  for (let j = 1; j < gz; j++) {
    const z = -sz + (j / gz) * sz * 2;
    pts.push(new THREE.Vector3(-sx, 0, z), new THREE.Vector3(sx, 0, z));
  }
  if (pts.length) {
    group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), overlayMaterial(color, 0.22)));
  }

  // The arrow sits on the object, not on the decal, so it is added to an
  // unrotated wrapper — it points at the light in world terms.
  const outer = new THREE.Group();
  outer.add(group);
  const arrow = new THREE.ArrowHelper(
    new THREE.Vector3(proj.L.x, proj.L.y, proj.L.z).normalize(),
    new THREE.Vector3(worldPos?.x || 0, worldPos?.y || 0, worldPos?.z || 0),
    Math.max(sx, sz) * 1.7,
    color, 0.28, 0.16,
  );
  arrow.line.material.depthTest = false;
  arrow.cone.material.depthTest = false;
  outer.add(arrow);

  return markOverlay(outer, "shadow");
}

/** Direction indicator for a Light. */
function buildLightOverlay(light) {
  const color = hexToInt(COMPONENTS.light.color, 0xffdd44);
  const group = new THREE.Group();
  const d = vnorm(light.direction || { x: 0, y: 1, z: 1 }, { x: 0, y: 1, z: 0 });

  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 10, 8),
    new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 }),
  );
  group.add(bulb);

  const arrow = new THREE.ArrowHelper(
    new THREE.Vector3(d.x, d.y, d.z).normalize(), new THREE.Vector3(0, 0, 0), 1.6, color, 0.3, 0.18,
  );
  arrow.line.material.depthTest = false;
  arrow.cone.material.depthTest = false;
  group.add(arrow);

  return markOverlay(group, "light");
}

/** Frustum outline for a Camera component. */
function buildCameraOverlay(cam) {
  const color = hexToInt(COMPONENTS.camera.color, 0x88ffcc);
  const group = new THREE.Group();
  const fov = clamp(cam.fov ?? 60, 1, 179);
  const far = 3.2;
  const h = Math.tan((fov * Math.PI) / 360) * far;
  const w = h * (4 / 3);

  const corners = [
    new THREE.Vector3(-w, -h, -far), new THREE.Vector3(w, -h, -far),
    new THREE.Vector3(w, h, -far), new THREE.Vector3(-w, h, -far),
  ];
  const o = new THREE.Vector3(0, 0, 0);
  const pts = [];
  for (const c of corners) pts.push(o.clone(), c.clone());
  for (let i = 0; i < 4; i++) pts.push(corners[i].clone(), corners[(i + 1) % 4].clone());

  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), overlayMaterial(color, 0.8)));
  return markOverlay(group, "camera");
}

/** Placeholder so empty objects and sounds remain clickable. */
function buildPlaceholder(colorHex) {
  const color = hexToInt(colorHex, 0x667788);
  const group = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.34, 0.34),
    new THREE.MeshBasicMaterial({ color, wireframe: true, depthTest: false, transparent: true, opacity: 0.75 }),
  );
  group.add(box);
  return markOverlay(group, "placeholder");
}

/** Selection outline that reads at any distance. */
function buildSelectionBox(object3d, active) {
  const box = new THREE.Box3().setFromObject(object3d);
  if (box.isEmpty()) return null;
  const helper = new THREE.Box3Helper(box, active ? 0x33d6ff : 0x8899aa);
  helper.material.depthTest = false;
  helper.material.transparent = true;
  helper.material.opacity = active ? 0.95 : 0.5;
  return markOverlay(helper, "selection");
}
