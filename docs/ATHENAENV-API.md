# AthenaEnv API — verified reference

## Render settings and sky depth (verified 2026-10-02)

The official `latest` ELF is pinned by SHA-256 in
[the bundled player reference](../reference/AthenaEnvReleaseAndExamples/README.md).
Its Render module does **not** export SHADE_FLAT or SHADE_GOURAUD. Assign
`RenderData.shade_model = 0` for Flat and `= 1` for Gouraud (GS IIP values).
Assigning an undefined constant silently selects Flat. The release exports the
same numeric values on Draw, but numeric assignments avoid the missing Render exports.
Live silhouette passes must also restore the numeric choice after temporarily
selecting Flat. Restoring Render.SHADE_GOURAUD selects Flat again on every frame.

The RenderData constructor resets supplied Image filters to LINEAR
(`src/js_api/ath_render.c`, lines 373 and 405 in the release commit). Apply each
requested filter **after every constructor** that could share that image.
Embedded mesh images are reached with getTexture(index); it returns undefined
past the final texture. Filter all embedded images, rather than only index zero.

For a sky drawn with its own projection, initialize buffer wrappers once with
Screen.initBuffers and retain Screen.getBuffer(Screen.DEPTH_BUFFER). Before the
sky render, set that buffer with mask 1, enable depth testing and select
Screen.DEPTH_ALWAYS. Restore mask 0 before scene geometry, which uses DEPTH_GEQUAL.
Disabling comparison alone does not protect scene depth. The unmasked sky also
reproduces a PCSX2 2.6.3 hardware-renderer crash with CT16S + Z16S; masking the
writes fixes the supplied scene while retaining the 16-bit buffers.
Share this initialization with offscreen shadows: a second initBuffers call throws.
The wrappers refer to existing buffers and allocate no additional VRAM.

These settings were checked inside the released ELF in PCSX2, in addition to
reading the [release source](https://github.com/DanielSant0s/AthenaEnv/tree/359485433f63c3b2f606a535f13aae1fdbfdb956).

## Frame lifecycle and scene changes (verified 2026-10-01)

Generate frames with `Screen.clearColor(color)` and `Screen.display(callback)`.
`js_std_loop` in src/quickjs/quickjs-libc.c clears the screen, calls the registered
callback and presents the frame. Do not call Screen.clear or Screen.flip again in
that callback. Resource declarations and behaviour initialization remain outside it.

The module must finish evaluating before std.reload frees its VM. A top-level
infinite loop leaves live module objects and reload can assert/hang in JS_FreeRuntime.
Behaviour scripts queue an exit through `ctx.goToScene(name)`; the generated frame
callback calls std.reload at its beginning on the following frame, before behaviour
updates. Keep that call out of nested behaviour functions.

This was verified against the bundled athena.elf with ten alternating scene entries
and all four controller templates in PCSX2. See docs/PRODUCTION-VERIFICATION.md.
The local upstream source checkout used for this audit is reference/AthenaEnvSourceFiles.

Every signature here was read out of the C sources in `reference/AthenaEnv/`, not the
README. **Where the README disagrees with this document, the README is wrong** — several
of its signatures do not match the bindings, and the mismatches are silent at runtime.

Each entry cites its source file so you can re-verify after an upstream update.

---

## How to re-verify

```bash
# find a binding's argument order
grep -n -A20 'js_world_step_with_contacts' reference/AthenaEnv/src/js_api/ath_ode.c

# see how a module exports its functions
grep -n 'JS_CFUNC_DEF' reference/AthenaEnv/src/js_api/ath_shadows.c
```

`JS_CFUNC_DEF("name", arity, handler)` — the arity is a hint, not a contract. Read the
handler's `argv[]` indexing to learn the real order.

The engine's own working examples are the best cross-check:

- `reference/AthenaEnv/bin/shadows.js` — offscreen render targets, shadow projectors, ODE
- `reference/AthenaEnv/examples/ode_ray_example.js` — ray geoms

---

## Transforms

**`RenderObject.rotation` is Euler radians, applied Z → Y → X.** Not a quaternion.

`src/render.c:369` calls `matrix_functions->rotate(transform, transform, obj->rotation)`,
and `core_matrix_rotate` (`src/matrix.c`) composes `Rz · Ry · Rx`.

`MATRIX` is `float[16]`, row-major, **row-vector convention** (`v' = v * M`), with
translation at indices 12, 13, 14.

The default VU0 backend builds `M = S * R * T`: `vu0_matrix_scale` scales rows.
The unused `core_matrix_scale` fallback scales columns and gives a different result.
A single rotated, non-uniformly scaled object is representable as TRS. A hierarchy can
introduce shear; `trsFromMat()` checks its reconstruction and flags that case as `lossy`.
The equivalent Three.js Euler order is `XYZ` (column-vector convention).

Quaternions appear in exactly two places: skinned bone transforms (`src/skin_math.c`) and
`Shadows.Projector.rotation`.

> `Shadows.Projector.rotation` accepts `{x, y, z}` but the underlying value is a
> quaternion whose `w` stays 1 and is never normalised. What comes out is not a rotation —
> it also changes scale. The editor avoids these property setters and uses `setTransform`
> with an ordinary rotation and world translation. See the Shadows section.

---

## Camera — `src/js_api/ath_3dcamera.c`, `src/camera.c`

### `Camera.target()` moves the camera

`setCameraTarget` (`src/camera.c:63`) is not a setter. It preserves the camera-to-target
vector by dragging the position along:

```c
sub(camera_target, camera_target, tmp_target);        // old - new
sub(camera_position, camera_position, camera_target); // position += new - old
```

So `Camera.position(p); Camera.target(t);` does **not** leave the camera at `p` — it
leaves it at `p + (t - old_target)`. `setCameraPosition` *is* a plain setter, so the
working order is the reverse of what reads naturally:

```js
Camera.target(tx, ty, tz);      // first — this one moves the camera
Camera.position(px, py, pz);    // second — this one does not move the target
```

The editor emits it in that order everywhere, including inside the shadow pass. Written
the other way it usually looks right, because on a frame where the target has not moved
the delta is zero — which is exactly what makes it hard to find.

### `LookAtCameraMatrix` is degenerate looking straight down

`src/calc_3d.c:225` builds `left = normalize(cross(up, forward))`. With `forward` of
`(0, -1, 0)` and the engine's `up` of `(0, 1, 0)`, that cross product is the zero vector.
Any straight-down camera needs a small offset on X or Z.

The resulting basis is `X = -left`, `Y = cross(forward, left)`, `Z = forward`, so
**screen-right is `cross(forward, up)`**. That is what fixes the orientation of an
offscreen pass relative to whatever samples it.

### `Camera.save()` / `Camera.restore(state)` exist

`ath_3dcamera.c:10` and `:43`. `save()` returns `{position, target, up, local_up}`, and
`restore()` writes the globals directly — it is not subject to the `target` behaviour
above. There is no need to mirror camera state by hand.

`camera_up` is only ever `(0, ±1, 0)`: `turnCamera` sets `camera_up[1]` and leaves the
other components at zero. There is no binding to set an arbitrary up vector except through
`Camera.restore`.

---

## ODE physics — `src/js_api/ath_ode.c`

### Creation (plain functions — no `new`)

```js
const world  = ODE.World();
const space  = ODE.Space();
const group  = ODE.JointGroup();
const body   = ODE.Body(world);
```

### Geoms — **space is always the first argument**

```js
ODE.GeomBox(space, x, y, z)
ODE.GeomSphere(space, radius)
ODE.GeomPlane(space, a, b, c, d)          // a*x + b*y + c*z = d
ODE.GeomRay(space, length)
ODE.GeomRenderObject(space, renderObject)  // trimesh
ODE.GeomTransform(space, geom)
```

Passing `null` as the space creates a geom that belongs to no space. It will never be
touched by the solver — this is how the editor implements non-blocking triggers.

> The README shows `ODE.GeomRenderObject(renderObject, space)`. That is backwards.
> `bin/shadows.js:95` uses the correct order.

### Stepping — this is the whole physics loop

```js
world.stepWithContacts(space, jointGroup, stepSize, callback?)
```

Source: `js_world_step_with_contacts`, `ath_ode.c:863`.
It runs `dSpaceCollide`, builds contact joints, calls `dWorldStep`, then empties the joint
group itself. **Do not** also call `space.collide()` — that runs the broad phase a second
time. **Do not** empty the joint group yourself.

The callback receives **one contact object**, not two geoms:

```js
{ position: [x,y,z], normal: [x,y,z], depth: number, geom1, geom2 }
```

The source binding returns JS geom objects in `geom1`/`geom2`, allowing custom properties
to be read back. The shipped release ELF instead returns numeric native geom IDs
(verified in PCSX2 while reproducing the side-scroller jump failure). There is no public
ID lookup binding. The editor detects numeric contacts and, before subsequent steps,
queries event pairs with `ODE.geomCollide` to recover known geom identities. This only
queries contacts; it does not repeat the broad phase or create extra contact joints.
The editor tags geoms with `_name` and `_ctxKey`.
Its event state records `lastHit`, `lastHitNormal` and `lastHitPosition`. The contact
position lets controllers distinguish a floor below the body's centre from a ceiling.

### Contact surface parameters are not settable

`contact_callback` in `ath_ode.c` hardcodes `mu = 0.5`, `bounce = 0.1`,
`bounce_vel = 0.1`, `soft_cfm = 0.01` for every contact. There is no binding for per-body
friction or restitution. Do not add UI for it.

### Triggers are impossible inside the stepped space

`contact_callback` creates a contact joint for every colliding pair. A static geom has no
body, so `dJointAttach(c, body, NULL)` welds the dynamic body to the static environment —
a "trigger" in the space **blocks movement**.

The editor therefore creates trigger geoms with a `null` space and polls them with
`ODE.geomCollide(trigger, otherGeom)` each frame.

### `getRotation()` returns a truncated matrix

`dMatrix3` is `float[4*3]` — a 4-wide stride with a padding lane. The binding copies only
the first **9** elements, so what reaches script is:

```
[R00 R01 R02  pad  R10 R11 R12  pad  R20]
```

`R21` and `R22` never arrive. They are recoverable because a rotation matrix is orthonormal
and right-handed: `row2 = row0 × row1`. ODE is column-vector while AthenaEnv is row-vector,
so the result must also be transposed. See `eulerFromOdeRotation` in `src/core/math.js`,
and `ODE_EULER_RUNTIME` for the version embedded in generated programs.

**`setRotation()` has the mirror-image bug**: it writes 9 floats into a 12-float `dMatrix3`,
leaving the last row uninitialised. It is unsafe. The editor never emits it, and warns when
a dynamic body has a non-zero initial rotation.

### Mass functions take mass, not density

```js
body.setMassBox(mass, lx, ly, lz)
body.setMassSphere(mass, radius)
```

Both call `dMassSetX(&m, 1.0, ...)` then `dMassAdjust(&m, arg0)`, so `arg0` is total mass.

### Trimesh colliders ignore scale

`GeomRenderObject` builds from `ro->obj.data->positions` — the raw mesh vertex buffer, with
no object transform applied. A scaled model gets a 1:1 collider.

---

## Shadows — `src/js_api/ath_shadows.c`, `src/shadows.c`

```js
const p = new Shadows.Projector(image);

p.setSize(width, height)          // world units, on the X/Z plane
p.setGrid(gx, gz)                 // minimum 2; REBUILDS GEOMETRY
p.setUVRect(u0, v0, u1, v1)       // REBUILDS GEOMETRY
p.setColor(r, g, b, a)            // 0.0-1.0 floats
p.setLightDir(x, y, z)            // points TOWARD the light; normalised internally
p.setBias(b)
p.setLightOffset(o)
p.setSlopeLimit(cos)
p.setBlend(Shadows.SHADOW_BLEND_DARKEN | _ALPHA | _ADD)
p.enableRaycast(space, enable, rayLength)
p.setTransform(float[16])
p.position = {x, y, z}            // also .rotation (quaternion, see above) and .scale
p.render()
```

### The decal's texture axes come from the grid indices

`shadow_projector_rebuild_geometry` (`src/shadows.c:406`) walks the grid as `j` over Z and
`i` over X, and takes **U from `i` and V from `j`**. So in the projector's *local* space,
U runs along +X and V along +Z. Whether that is also true in world space depends entirely
on `p->transform`.

### Place a projector with `setTransform`

`setTransform` copies 16 floats directly into `p->transform`. Use the row-vector matrix
below, where `c = cos(phi)`, `s = sin(phi)` and `(x, y, z)` is the world translation:

```js
[ c, 0, s, 0,
  0, 1, 0, 0,
 -s, 0, c, 0,
  x, y, z, 1 ]
```

This keeps translation independent of rotation and avoids the unnormalised quaternion
used by `.rotation`. No angle lookup tables, compensating scale or UV flips are needed.
The property setters rebuild the matrix, so do not mix them with `setTransform`.

**Call `setTransform` after the last geometry rebuild.** A rebuild copies `p->transform`
into `obj.transform`, which VU1 then applies to vertices the projector has already placed
in world space. Assigning a non-identity matrix before rebuilding transforms the decal twice.

Without raycasting, the engine subtracts `lightDir.y` from the transformed Y coordinate,
so the matrix uses `y = groundY + lightDir.y`. X/Z subtract `lightDir * lightOffset`.
The editor updates translation indices 12 and 14 in the same array when following a caster.

### Where the silhouette camera goes, and what the ground does to its image

Put the camera at `caster + L·dist` looking at the caster, `L` pointing toward the light.
With `h = hypot(L.x, L.z)`, the lookat basis above gives

| Image axis | World direction |
|---|---|
| screen-right | `(L.z, 0, −L.x) / h` — horizontal, across the light |
| screen-down (projected to the ground) | `(L.x, 0, L.z) / h` — along the light's azimuth |

Projecting the image onto the ground along `−L`:

- an offset along screen-right is already horizontal and lands **unstretched**;
- an offset `v` along screen-down lands at `(v / L.y)` — **stretched by `1/sin(elevation)`**,
  the ordinary long-shadow-at-sunset factor.

So a square frustum of extent `E` covers `E` across the light and `E / L.y` along it:
`setSize(E, E / L.y)`, turned by `φ = atan2(−L.x, L.z)` so that local +X lies across the
light. `1/L.y` runs away near the horizon and has to be capped.

`bin/shadows.js` skips all of this and looks correct only because its light is `(0, 1, 1)`
— no X component, so `φ` is 0 and there is no azimuth to disagree about. Its
`setUVRect(1.0, 0.0, 0.0, 1.0)` corrects for its camera being *below* the caster
(`position = target − lightDir·dist` with a +Y light), not for anything general.

### Extent and the light camera's frustum are one setting, not two

The decal maps the whole texture onto `setSize`, so the silhouette is 1:1 with the world
only when the decal covers exactly what the light camera saw:

```
extent = 2 * dist * tan(fov / 2)
```

`create_view` (`src/calc_3d.c:264`) writes `1/tan(fov/2)` into `[0]` and `[5]` for a square
viewport, so the frustum is square whatever shape the decal ends up. `fov` is the
**horizontal** field of view: `view_screen[5]` divides by the aspect.

The editor asks for the extent and derives the distance, because two fields that must
satisfy an equation are two fields that will not.

The calculation is shared with the viewport in `src/core/shadowmath.js`.
`tests/shadowmath_test.js` checks transformed corners against independently projected
camera image axes, across light directions and elevations.

### `bias` does nothing without raycasting

`shadow_projector_render` applies `bias` only on the ray-hit path
(`nodes[i] = hit.position - lightDir * bias`). With draping off it is dead. To lift a flat
decal off the floor, move the decal — the editor's Ground Y.

### Call ordering is load-bearing

**`setColor()` must run before the last geometry rebuild.** Vertex colours are baked into
the vertex buffer inside `shadow_projector_rebuild_geometry` (`src/shadows.c:435`).
`setColor` afterwards only updates a field nothing reads again — the shadow silently keeps
the default 65% black.

**`.position` must be assigned after the last rebuild.** A rebuild copies the projector's
current transform into its draw object (`src/shadows.c`, end of `rebuild_geometry`), while
the grid nodes are *already in world space*. Setting position first applies it twice.

Safe order, which is what the editor emits:

```
setSize -> setColor -> setUVRect -> setGrid -> everything else -> enableRaycast -> position
```

`setUVRect` and `setGrid` each rebuild, so anything colour-related has to precede whichever
of them comes last. The editor does not call `setUVRect` at all — the default `(0,0,1,1)`
is already right for a plan-view silhouette, and calling it would only cost a rebuild.

### `enableRaycast(space, enable, rayLength)`

Confirmed at `ath_shadows.c:169`: `argv[0]` space, `argv[1]` enable (int),
`argv[2]` length (float). `bin/shadows.js:76` uses `enableRaycast(space, 4, 12.0)`.

> The README's prose says `(space, rayLength, enable)`. It is wrong.

### `setSlopeLimit` — `-1` disables, `0` does not

`src/shadows.c` enables the filter for `maxSlopeCos > -0.5f`. The engine's default is
`-1.0`. A slope limit of `0` is an *active* filter rejecting anything steeper than 90°.

### The decal's Y is shifted by the light direction

`shadow_projector_render` does:

```c
world[0] -= p->lightDir[0] * p->lightOffset;
world[1] -= p->lightDir[1];                  // NOT scaled by lightOffset
world[2] -= p->lightDir[2] * p->lightOffset;
```

Y is shifted by the full `lightDir.y` regardless of `lightOffset`. To land the decal at a
chosen ground height, assign `position.y = groundY + lightDir.y`. The editor does this.

---

## Offscreen rendering — `src/js_api/ath_screen.c`

The pattern comes from `bin/shadows.js`. The GS has two contexts, each with its own FRAME
and ZBUF registers; you aim context 2 at the render target once and switch to it per frame.

```js
Screen.initBuffers();                                    // once, before any setBuffer
const mainDepth = Screen.getBuffer(Screen.DEPTH_BUFFER);

const rt = new Image();
rt.filter = LINEAR;  rt.renderable = true;  rt.bpp = 32;
rt.texWidth = rt.texHeight = 128;
rt.width = rt.height = 128;
rt.endx = rt.endy = 128;
rt.lock();                                               // pins it in VRAM permanently

Screen.switchContext();                                  // -> context 2
Screen.setBuffer(Screen.DEPTH_BUFFER, mainDepth, 1);     // mask z-writes
Screen.setParam(Screen.DEPTH_TEST_ENABLE, false);
Screen.switchContext();                                  // -> back to context 1
```

Per frame:

```js
const saved = Camera.save();
Screen.switchContext();
Screen.setBuffer(Screen.DRAW_BUFFER, rt);
Draw.rect(0, 0, 128, 128, Color.new(0, 0, 0, 0));        // NOT Screen.clear
Render.setView(fov, near, far, 128, 128);                // 5-arg form sizes the viewport
// ... draw the caster ...
Screen.switchContext();
Camera.restore(saved);
Camera.update();
Render.setView(mainFov, near, far);
```

### Never `Screen.clear()` into a render target

`clearScreen` → `page_clear` (`src/graphics.c:578`) rasterises pages sized from
`gsGlobal->Width/Height` — the **main** framebuffer. Aimed at a 128×128 target it writes
far past the end of it. Clear with `Draw.rect` at the target's own dimensions.

### Aim the offscreen camera with `Camera.target` first

The Camera section above has the detail: `Camera.target()` drags the camera position with
it, so an offscreen pass that sets the position and then the target ends up somewhere else.
It is worst here, because the main camera's target is usually far from the caster.

### `Render.setView(fov, near, far, width?, height?)`

`ath_render.c`, `athena_set_view`. The 5-argument form sets the projection's viewport
dimensions, which is how an offscreen pass gets the right aspect. `fov` is horizontal;
`aspect` is `height/width`.

### VRAM

4 MB total (`getFreeVRAM`, `src/graphics.c:639`). A locked image never returns to the pool.
A 128×128 32bpp target is 64 KB; 256×256 is 256 KB.

---

## Lights — `src/js_api/ath_lights.c`

```js
const id = Lights.new();
Lights.set(id, Lights.DIRECTION, x, y, z);   // toward the light
Lights.set(id, Lights.AMBIENT,  r, g, b);    // 0.0-1.0
Lights.set(id, Lights.DIFFUSE,  r, g, b);
Lights.set(id, Lights.SPECULAR, r, g, b);
```

**Four lights maximum.** Extra ones are created but never applied.

---

## Sound — `src/js_api/ath_sound.c`

Two different objects with two different capability sets, and the difference decides what
the editor can offer.

### `Sound.Stream` — what the editor emits

```
play()  pause()  rewind()  playing()  free()      methods       (ath_sound.c:126-130)
loop    position                                  settable      (ath_sound.c:132-133)
length                                            read-only     (ath_sound.c:134)
```

**There is no per-stream volume.** The only volume control in the module is
`Sound.setVolume(n)` (`ath_sound.c:284`), which is global and takes an int. A per-sound
volume slider therefore cannot work, and the editor had one for a while — it is a project
setting now, emitted once before anything plays.

`loop` IS settable per stream, and the editor did not emit it either, so the Loop checkbox
was equally decorative. Both are covered by tests under "Audio" in `tests/codegen_test.js`.

### `Sound.SFX` — not used by the editor yet

```
volume  pan  loop  pitch                          settable      (ath_sound.c:272-275)
play(channel)  playing(channel)  length  free()                 (ath_sound.c:265-270)
Sound.findChannel()                                             (ath_sound.c:285)
```

SFX is the one with per-instance mixing. If per-sound volume is ever wanted, this is the
route — not a property on Stream that does not exist.

## Colour

`Color.new(r, g, b, a)` takes bytes, but **alpha is 0–128**, where 128 is fully opaque.
This is the GS convention, not a typo. Shadow and light colours are 0.0–1.0 floats instead.

---

## Quick signature table

| Call | Correct form | README |
|---|---|---|
| `world.stepWithContacts` | `(space, group, dt, cb?)` | — |
| `ODE.GeomRenderObject` | `(space, renderObject)` | reversed |
| `ODE.Geom*` | space first, always | ok |
| `space.collide(cb)` | `cb(contact)` — one argument | ambiguous |
| `projector.enableRaycast` | `(space, enable, length)` | reversed |
| `Render.setView` | `(fov, near, far, w?, h?)` — fov is horizontal | partial |
| `body.setMassBox` | `(mass, lx, ly, lz)` | says density |
| `body.getRotation()` | 9 of 12 floats, stride 4 | undocumented |
| `Camera.target` | moves the camera — call it **before** `Camera.position` | undocumented |
| `Shadows.Projector.rotation` | quaternion with `w` stuck at 1: rotates *and* scales by `sqrt(1+4y⁴)` | undocumented |
| projector transform | `world = (local + position) · R·S` — position rotates too | undocumented |
| `projector.setBias` | ignored unless raycasting is on | undocumented |
