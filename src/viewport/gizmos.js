// ═══════════════════════════════════════════════════════════════════════
//  GIZMOS — move / rotate / scale handles
//
//  Dragging works by intersecting the pointer ray with a plane derived from
//  the active axis, not by measuring screen-space pixels. That keeps the
//  handle glued to the cursor at any camera angle and any distance, which
//  the screen-delta approach never quite manages.
// ═══════════════════════════════════════════════════════════════════════

const AXIS_COLOR = { x: 0xff3355, y: 0x44dd66, z: 0x3388ff };
const AXIS_VEC = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

/** Build the handle geometry for a mode. Meshes carry userData.gizmoAxis. */
function buildGizmo(mode) {
  const group = new THREE.Group();
  group.userData.isGizmo = true;
  group.renderOrder = 999;

  for (const axis of ["x", "y", "z"]) {
    const color = AXIS_COLOR[axis];
    const mat = new THREE.MeshBasicMaterial({
      color, depthTest: false, depthWrite: false, transparent: true, opacity: 0.92,
    });
    // A wider invisible mesh gives the handle a forgiving hit area.
    const hitMat = new THREE.MeshBasicMaterial({ visible: false, depthTest: false });
    const arm = new THREE.Group();

    if (mode === "rotate") {
      arm.add(new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.022, 6, 56), mat));
      arm.add(new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.13, 4, 40), hitMat));
      if (axis === "x") arm.rotation.y = Math.PI / 2;
      if (axis === "y") arm.rotation.x = Math.PI / 2;
    } else if (mode === "scale") {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 6), mat);
      shaft.position.y = 0.5;
      const knob = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), mat);
      knob.position.y = 1.08;
      arm.add(shaft, knob, hitCylinder(hitMat));
    } else {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 1.05, 6), mat);
      shaft.position.y = 0.525;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.24, 8), mat);
      tip.position.y = 1.19;
      arm.add(shaft, tip, hitCylinder(hitMat));
    }

    if (mode !== "rotate") {
      if (axis === "x") arm.rotation.z = -Math.PI / 2;
      if (axis === "z") arm.rotation.x = Math.PI / 2;
    }

    arm.traverse((ch) => {
      if (!ch.isMesh) return;
      ch.renderOrder = 999;
      ch.userData.isGizmo = true;
      ch.userData.gizmoAxis = axis;
    });
    group.add(arm);
  }
  return group;
}

const hitCylinder = (mat) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.35, 6), mat);
  m.position.y = 0.67;
  return m;
};

/**
 * Plane to drag against.
 * Move/scale: contains the axis and faces the camera as much as possible.
 * Rotate: perpendicular to the axis.
 */
function dragPlane(mode, axisDir, origin, cameraDir) {
  const plane = new THREE.Plane();
  if (mode === "rotate") {
    plane.setFromNormalAndCoplanarPoint(axisDir.clone(), origin);
    return plane;
  }
  // Normal = axis x (axis x cameraDir) gives the plane containing the axis
  // that is most face-on to the camera.
  const n = new THREE.Vector3().crossVectors(axisDir, new THREE.Vector3().crossVectors(axisDir, cameraDir));
  if (n.lengthSq() < 1e-8) n.copy(cameraDir); // axis points at the camera
  plane.setFromNormalAndCoplanarPoint(n.normalize(), origin);
  return plane;
}

/** Begin a drag. Returns the state the move handler needs, or null. */
function beginDrag({ mode, axis, raycaster, camera, origin, space, objectQuat }) {
  const axisDir = new THREE.Vector3(...AXIS_VEC[axis]);
  if (space === "local" && objectQuat) axisDir.applyQuaternion(objectQuat);
  axisDir.normalize();

  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  const plane = dragPlane(mode, axisDir, origin, camDir);

  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(plane, hit)) return null;

  const state = { mode, axis, axisDir, plane, origin: origin.clone() };
  if (mode === "rotate") {
    state.startVec = hit.clone().sub(origin);
    if (state.startVec.lengthSq() < 1e-8) return null;
    state.startVec.normalize();
  } else {
    state.startT = hit.clone().sub(origin).dot(axisDir);
  }
  return state;
}

/**
 * Continue a drag.
 * @returns {{delta:number}} for move/scale, {{angle:number}} for rotate, or null.
 */
function updateDrag(state, raycaster) {
  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(state.plane, hit)) return null;

  if (state.mode === "rotate") {
    const v = hit.clone().sub(state.origin);
    if (v.lengthSq() < 1e-8) return null;
    v.normalize();
    let angle = Math.acos(clamp(state.startVec.dot(v), -1, 1));
    // Sign from the axis the ring turns about.
    const cross = new THREE.Vector3().crossVectors(state.startVec, v);
    if (cross.dot(state.axisDir) < 0) angle = -angle;
    return { angle };
  }
  return { delta: hit.clone().sub(state.origin).dot(state.axisDir) - state.startT };
}

const snapTo = (v, step) => (step > 0 ? Math.round(v / step) * step : v);

/** Compose a rotation about the displayed axis instead of adding Euler angles. */
function rotationForDrag(start, axis, angle, space, parentQuat = new THREE.Quaternion()) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(start.x, start.y, start.z, "XYZ"));
  const delta = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...AXIS_VEC[axis]), angle);
  if (space === "local") q.multiply(delta);
  else q.premultiply(parentQuat.clone().invert().multiply(delta).multiply(parentQuat));
  const e = new THREE.Euler().setFromQuaternion(q, "XYZ");
  return { x: e.x, y: e.y, z: e.z };
}

/** Keep the handles a constant size on screen regardless of distance. */
function scaleGizmoToView(gizmo, camera, pixels = 90, viewportHeight = 600) {
  const dist = camera.position.distanceTo(gizmo.position);
  const fovRad = (camera.fov * Math.PI) / 180;
  const worldPerPixel = (2 * Math.tan(fovRad / 2) * dist) / viewportHeight;
  const s = Math.max(worldPerPixel * pixels, 1e-4);
  gizmo.scale.setScalar(s);
}
