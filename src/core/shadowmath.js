// Directional shadow geometry, shared by export and viewport.
// setTransform takes a row-vector matrix (matrix.c:vu0_matrix_apply).
// Its X axis follows screen-right of the light camera, and its Z axis
// follows screen-down projected onto the ground. Translation is world space.
// Assign it AFTER setGrid/setUVRect: rebuild_geometry copies the current
// matrix into the render object, which would otherwise apply it twice.
const SHADOW_MAX_STRETCH = 8;

function shadowProjection(sh, lightDir, bounds = null, scale = null, near = 1) {
  const notes = [];
  const src = sh?.source || "rendertarget";
  const maxStretch = clamp(num(sh?.maxStretch, 4), 1, SHADOW_MAX_STRETCH);

  // ── the light, with its elevation clamped ────────────────────────────
  const raw = vnorm(lightDir || sh?.lightDir || { x: 0, y: 1, z: 1 }, { x: 0, y: 1, z: 0 });
  const h0 = Math.hypot(raw.x, raw.z);
  const minSin = 1 / maxStretch;

  let L, clampedElevation = false;
  if (h0 < 1e-4) {
    // Straight overhead (or straight down, which is not a light at all).
    L = { x: 0, y: 1, z: 0 };
  } else if (raw.y < minSin) {
    if (raw.y <= 0) {
      notes.push({
        level: "warn",
        message: "The light points at or below the horizon, so it casts no shadow onto the ground. " +
          "Raised it to the shallowest angle Max Stretch allows.",
      });
    } else {
      notes.push({
        level: "info",
        message: `The light sits low enough that the shadow would stretch ${f3(1 / raw.y)}x. ` +
          `Raised it to the ${f3(maxStretch)}x limit — increase Max Stretch to allow more.`,
      });
    }
    clampedElevation = true;
    const y = minSin;
    const k = Math.sqrt(Math.max(0, 1 - y * y)) / h0;
    L = { x: raw.x * k, y, z: raw.z * k };
  } else {
    L = raw;
  }

  const planView = Math.hypot(L.x, L.z) < 1e-4;
  const stretch = 1 / L.y;

  // ── the caster's bounding radius about its own origin ────────────────
  // A bounding sphere, because the light camera looks at the caster from an
  // angle that changes with the light: a footprint would be enough for a
  // plan view and too small for anything else.
  let radius = 0;
  if (bounds) {
    const sx = Math.abs(num(scale?.x, 1)), sy = Math.abs(num(scale?.y, 1)), sz = Math.abs(num(scale?.z, 1));
    const half = Math.hypot(bounds.size.x * sx, bounds.size.y * sy, bounds.size.z * sz) / 2;
    const off = Math.hypot(
      (bounds.center?.x || 0) * sx, (bounds.center?.y || 0) * sy, (bounds.center?.z || 0) * sz,
    );
    radius = off + half;
  }

  // ── extent along the unstretched axis ────────────────────────────────
  const manual = {
    x: Math.max(0.01, num(sh?.size?.x, 2)),
    z: Math.max(0.01, num(sh?.size?.z, 2)),
  };
  if (src !== "rendertarget") {
    // A blob is a picture on the ground, not a projection. It keeps both of
    // the user's own dimensions and never rotates.
    return {
      planView: true, clampedElevation, L, stretch: 1, radius, notes,
      extent: manual.x, sizeX: manual.x, sizeZ: manual.z,
      phi: 0, cos: 1, sin: 0,
      camFov: 0, camDist: 0, camTilt: 0,
    };
  }

  const autoFit = !!sh?.autoFit && !!bounds;
  if (sh?.autoFit && !bounds) {
    notes.push({ level: "info", message: "Fit To Caster needs the caster's mesh loaded — using the manual extent." });
  }
  const extent = autoFit ? Math.max(0.2, radius * 2.12) : manual.x;

  // ── the silhouette camera ────────────────────────────────────────────
  // extent = 2 * dist * tan(fov/2) — create_view (src/calc_3d.c:264) puts the
  // same 1/tan(fov/2) on both axes for a square target, so the frustum the
  // decal has to match is square whatever the decal itself ends up being.
  let camFov, camDist;
  if (autoFit) {
    // Stand off far enough to clear the caster and to stay near-orthographic:
    // up close, the end of the caster nearest the camera is magnified into a
    // shadow that does not match its own silhouette.
    camDist = Math.max(radius * 2 + near, extent * 3);
    camFov = clamp((Math.atan((extent / 2) / camDist) * 360) / Math.PI, 1, 179);
  } else {
    camFov = clamp(num(sh?.camFov, 20), 1, 179);
    camDist = (extent / 2) / Math.tan((camFov * Math.PI) / 360);
  }

  if (radius) {
    const advice = autoFit ? "Turn Fit To Caster off and set the extent by hand."
      : "Widen the Extent or lower the Light Cam FOV.";
    if (camDist <= radius) {
      notes.push({
        level: "warn",
        message: `The silhouette camera sits ${f3(camDist)} from the caster, which has a radius of ` +
          `${f3(radius)} — the camera is inside it. ${advice}`,
      });
    } else if (camDist - radius < near) {
      notes.push({
        level: "warn",
        message: `The caster reaches closer than the near plane (${f3(near)}) to the silhouette ` +
          `camera and will be clipped. ${advice}`,
      });
    }
  }

  const phi = planView ? 0 : Math.atan2(-L.x, L.z);
  return {
    planView, clampedElevation, L, stretch, radius, notes,
    extent, sizeX: extent, sizeZ: extent * stretch,
    phi, cos: Math.cos(phi), sin: Math.sin(phi),
    camFov, camDist,
    camTilt: planView ? Math.max(0.01, camDist * 0.01) : 0,
  };
}

/**
 * Where a decal's centre lands on the ground, for a caster at `p`.
 *
 * The centre of the silhouette is the ray through the caster's origin; it
 * meets the ground plane after sliding along -L. This is the editor-side twin
 * of the arithmetic the generator emits into the frame loop.
 */
function shadowGroundPoint(proj, p, groundY = 0) {
  const t = (num(p?.y, 0) - groundY) / proj.L.y;
  return {
    x: num(p?.x, 0) - proj.L.x * t,
    y: groundY,
    z: num(p?.z, 0) - proj.L.z * t,
  };
}

/** Matrix for setTransform; the engine subtracts L.y from every node. */
function shadowMatrixFor(proj, ground, groundY = 0) {
  return [
    proj.cos, 0, proj.sin, 0,
    0, 1, 0, 0,
    -proj.sin, 0, proj.cos, 0,
    ground.x, groundY + proj.L.y, ground.z, 1,
  ];
}

/** Native rays begin half their length above the decal along +L (shadows.c).
 * Follow all three coordinates so a high platform remains within the query.
 * The grid's horizontal basis keeps each ray on its silhouette projection. */
function shadowRayMatrixFor(proj, origin, rayLength) {
  const half = Math.max(0.01, num(rayLength, 12)) / 2;
  return shadowMatrixFor(proj, {
    x: origin.x - proj.L.x * half,
    z: origin.z - proj.L.z * half,
  }, origin.y - proj.L.y * half);
}

/** Exclude the caster's subtree and its enclosing physics actor. A model is
 * often a child of the player root, with the Rigidbody on that root. */
function shadowReceiverBodies(objects, bodies, casterId) {
  const parents = new Map(), byId = new Map();
  const visit = (list, parent = null) => { for (const o of list) { parents.set(o.id, parent); byId.set(o.id, o); visit(o.children || [], o); } };
  visit(objects);
  const excluded = new Set();
  const exclude = o => { if (!o) return; excluded.add(o.id); for (const c of o.children || []) exclude(c); };
  const caster = byId.get(casterId);
  exclude(caster);
  let actor = parents.get(casterId);
  while (actor) {
    if (bodies.some(b => b.obj.id === actor.id)) { exclude(actor); break; }
    actor = parents.get(actor.id);
  }
  return bodies.filter(b => !b.isTrigger && b.shape !== 'ray' && !b.obj.components?.water && !excluded.has(b.obj.id));
}
