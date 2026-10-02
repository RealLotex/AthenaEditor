import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { load } from "./_load.js";
const A = await load(["core/util.js", "core/math.js", "core/shadowmath.js"]);

// vu0_matrix_apply (matrix.c): apply the exact matrix exported to setTransform.
function applyMatrix(m, v) {
  return [0, 1, 2, 3].map((c) => m[c]*v[0] + m[4+c]*v[1] + m[8+c]*v[2] + m[12+c]*v[3]);
}

/** LookAtCameraMatrix, src/calc_3d.c:225 — the camera basis it builds. */
function cameraBasis(position, target, up = [0, 1, 0]) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const norm = (v) => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  const forward = norm(sub(target, position));
  const left = norm(cross(up, forward));
  const nup = cross(forward, left);
  return {
    forward,
    right: [-left[0], -left[1], -left[2]],   // m0 row 0 is -left
    up: nup,
  };
}

const proj = (sh, light, bounds, scale, near) =>
  A.shadowProjection(sh, light, bounds, scale, near ?? 1);

const shadow = (patch = {}) => ({
  source: "rendertarget", autoFit: false, size: { x: 2, z: 2 },
  camFov: 20, maxStretch: 4, lightOffset: 0, ...patch,
});

/**
 * The end-to-end claim: a decal corner, run through the engine's transform,
 * lands exactly where the light camera's matching image corner projects to on
 * the ground. If this holds the shadow is correct; if it does not, no amount
 * of string assertions in codegen_test will save it.
 */
function assertDecalMatchesLightCamera(light, sh = shadow()) {
  const p = proj(sh, light);
  const caster = { x: 3, y: 2.5, z: -4 };
  const groundY = 0;

  const ground = A.shadowGroundPoint(p, caster, groundY);
  const matrix = A.shadowMatrixFor(p, ground, groundY);
  // The camera the generator emits for the silhouette pass. Straight overhead
  // it carries a nudge on Z, because cross(up, forward) is otherwise zero.
  const cam = cameraBasis(
    [
      caster.x + p.L.x * p.camDist,
      caster.y + p.L.y * p.camDist,
      caster.z + p.L.z * p.camDist + p.camTilt,
    ],
    [caster.x, caster.y, caster.z],
  );

  // Half the frustum at the caster's distance, in world units.
  const half = p.camDist * Math.tan((p.camFov * Math.PI) / 360);

  // Four image corners, as (u, v) in [-1, 1] with v down the screen.
  for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    // Where that corner of the image sits in space...
    const world = [0, 1, 2].map((i) =>
      [caster.x, caster.y, caster.z][i] + cam.right[i] * u * half - cam.up[i] * v * half
    );
    // ...and where its ray lands on the ground, travelling along -L. Light
    // Offset then slides the finished decal, so the expectation slides too.
    const t = (world[1] - groundY) / p.L.y;
    const off = sh.lightOffset || 0;
    const hit = [
      world[0] - p.L.x * t - p.L.x * off,
      groundY,
      world[2] - p.L.z * t - p.L.z * off,
    ];

    // The decal corner carrying that same texel. U runs along local +X and V
    // along local +Z, and a folded decal has both flipped.
    const node = applyMatrix(matrix, [u * p.sizeX / 2, 0, v * p.sizeZ / 2, 1]);
    node[0] -= p.L.x * (sh.lightOffset || 0);
    node[1] -= p.L.y;
    node[2] -= p.L.z * (sh.lightOffset || 0);

    assertAlmostEquals(node[0], hit[0], 2e-4, `corner (${u},${v}) x`);
    assertAlmostEquals(node[1], groundY, 2e-4, `corner (${u},${v}) y`);
    assertAlmostEquals(node[2], hit[2], 2e-4, `corner (${u},${v}) z`);
  }
  return p;
}

Deno.test("the decal lands exactly where the light camera's image projects", () => {
  // The case that was broken: a light with an X component. The old pass
  // rendered from the light and left the decal axis-aligned, so the shadow
  // came out turned by the light's azimuth.
  assertDecalMatchesLightCamera({ x: 1, y: 1, z: 1 });
});

Deno.test("...for every light azimuth and elevation", () => {
  for (let az = 0; az < 360; az += 15) {
    for (const elev of [20, 35, 50, 70, 89]) {
      const a = (az * Math.PI) / 180, e = (elev * Math.PI) / 180;
      assertDecalMatchesLightCamera({
        x: Math.cos(e) * Math.sin(a),
        y: Math.sin(e),
        z: Math.cos(e) * Math.cos(a),
      }, shadow({ maxStretch: 8 }));
    }
  }
});

Deno.test("...with a light offset slid in on top", () => {
  assertDecalMatchesLightCamera({ x: 0.6, y: 1, z: -0.3 }, shadow({ lightOffset: 0.75 }));
});

Deno.test("...and straight overhead, where the lookat is degenerate", () => {
  const p = assertDecalMatchesLightCamera({ x: 0, y: 1, z: 0 });
  assert(p.planView);
  assert(p.camTilt > 0, "a straight-down camera needs a nudge or cross(up, forward) is zero");
  assertAlmostEquals(p.stretch, 1, 1e-9);
});

// ═══════════════════════════════════════════════════════════════════════
//  Stretch, extent and the guard rails
// ═══════════════════════════════════════════════════════════════════════

Deno.test("a low sun stretches the decal along its own azimuth", () => {
  const high = proj(shadow(), { x: 0, y: 1, z: 0.05 });
  const low = proj(shadow(), { x: 0, y: 0.4, z: 0.917 });
  // Across the light the decal never changes; along it, it grows as 1/sin.
  assertAlmostEquals(low.sizeX, high.sizeX, 1e-9);
  assert(low.sizeZ > high.sizeZ * 2, "a 24-degree sun should cast a much longer shadow");
  assertAlmostEquals(low.sizeZ / low.sizeX, low.stretch, 1e-9);
});

Deno.test("Max Stretch caps how long a shadow can get", () => {
  const p = proj(shadow({ maxStretch: 3 }), { x: 0, y: 0.05, z: 0.999 });
  assertAlmostEquals(p.stretch, 3, 1e-6);
  assertAlmostEquals(p.sizeZ / p.sizeX, 3, 1e-6);
  assert(p.clampedElevation);
  assert(p.notes.some((n) => /stretch/i.test(n.message)), "the user is not told the light was raised");
});

Deno.test("Max Stretch of 1 is a plain plan-view blob", () => {
  const p = proj(shadow({ maxStretch: 1 }), { x: 1, y: 0.3, z: 1 });
  assert(p.planView, "pinning the stretch to 1 should pin the light overhead");
  assertAlmostEquals(p.sizeZ, p.sizeX, 1e-9);
  assertEquals(p.phi, 0);
});

Deno.test("a light below the horizon is reported, not silently projected", () => {
  const p = proj(shadow(), { x: 0, y: -1, z: 0.2 });
  assert(p.notes.some((n) => n.level === "warn" && /horizon/i.test(n.message)));
  assert(p.stretch > 0 && Number.isFinite(p.sizeZ), "output must stay finite");
});

Deno.test("the extent and the light camera's frustum always agree", () => {
  for (const sh of [shadow({ camFov: 12 }), shadow({ camFov: 60 }), shadow({ size: { x: 7, z: 7 } })]) {
    const p = proj(sh, { x: 0.3, y: 0.9, z: 0.2 });
    const frustum = 2 * p.camDist * Math.tan((p.camFov * Math.PI) / 360);
    assertAlmostEquals(frustum, p.extent, 1e-6, "the decal does not cover what the camera saw");
    assertAlmostEquals(p.sizeX, p.extent, 1e-9);
  }
});

Deno.test("fit-to-caster wraps the whole caster, not just its footprint", () => {
  // The light camera looks from an angle, so a tall thin caster still needs a
  // decal wide enough for its height.
  const bounds = { size: { x: 0.6, y: 3.0, z: 0.6 }, center: { x: 0, y: 0, z: 0 } };
  const p = proj(shadow({ autoFit: true }), { x: 0.5, y: 0.8, z: 0.3 }, bounds, { x: 1, y: 1, z: 1 });
  assert(p.extent > 3.0, `extent ${p.extent} would clip a 3-unit-tall caster seen from the side`);
  assert(p.camDist > p.radius, "the camera must clear the caster");
  assertEquals(p.notes.filter((n) => n.level === "warn"), []);
});

Deno.test("fit-to-caster follows the object's scale", () => {
  const bounds = { size: { x: 1, y: 1, z: 1 }, center: { x: 0, y: 0, z: 0 } };
  const one = proj(shadow({ autoFit: true }), { x: 0, y: 1, z: 0.2 }, bounds, { x: 1, y: 1, z: 1 });
  const big = proj(shadow({ autoFit: true }), { x: 0, y: 1, z: 0.2 }, bounds, { x: 3, y: 3, z: 3 });
  assertAlmostEquals(big.extent / one.extent, 3, 1e-6);
});

Deno.test("a blob shadow keeps both of its dimensions and never rotates", () => {
  const p = proj(shadow({ source: "texture", size: { x: 4, z: 1.5 } }), { x: 1, y: 1, z: 1 });
  assertEquals([p.sizeX, p.sizeZ], [4, 1.5]);
  assertEquals(p.phi, 0);
});

Deno.test("a camera buried inside its caster is reported", () => {
  const bounds = { size: { x: 1, y: 6, z: 1 }, center: { x: 0, y: 0, z: 0 } };
  const p = proj(shadow({ camFov: 120, size: { x: 2, z: 2 } }), { x: 0, y: 1, z: 0.2 }, bounds, { x: 1, y: 1, z: 1 });
  assert(p.notes.some((n) => n.level === "warn" && /inside it/.test(n.message)));
});
