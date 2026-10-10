# Coastal scene authoring

The editor provides the scene tools needed for saturated skies, rounded green islands,
animated water, underwater lighting and small particle effects. Architecture and character
models still need to be created or imported; the reference screenshots are visual targets.

## Assemble the scene

1. Open + → World → Background. Choose Tropical blue or Cloud islands.
   The original single_image panoramas are 1774×887; higher source resolution is deferred.
   Start with texture size 512, 4 bits and Remove lower hemisphere for lower VRAM use.
   Larger output settings warn when they only enlarge the source. Choose Linear
   filtering independently. Game camera settings now live in Game, beside its
   active-camera selector; the scene viewport uses a panoramic 100° angle.
2. Open + → Terrain. Sculpt with Hills, then paint grass, dirt and stone. Enable
   Smooth texture transitions and choose atlas resolution/color depth. Soft transitions are baked
   into one atlas after each stroke; the console needs no additional blend pass.
3. Create → Water creates a subdivided plane and indexed procedural textures. Adjust height,
   size, tint, opacity, pattern scale, flow and waves in Properties. Keep the sea floor
   below it. Caustics project onto static floors/platforms when scene physics is enabled; without
   receivers they use a flat plane at the chosen depth. Use translucent water to retain
   visibility of the floor and its shadows. Caustic footprint assumes the generated unit plane.
4. Create → Particle effects → Bubbles, Splash or Fountain. Move the emitter to its source.
   Splash is a short burst; the others loop by default. Disable Play on start for an
   event-driven effect, then choose Events → Play particles and select the emitter.
   Pool size, speed, lifetime, spread, size, color and opacity remain editable.
   A Timeline Particles clip can also select this emitter: its duration controls playback,
   scrubbing samples the effect deterministically, and clip exit restores prior playback.
   Emitter settings stay in Properties; ordinary mesh targets retain the existing pooled
   mesh clip controls. Overlapping clips cannot control the same emitter.
5. Select water or glossy models in Objects. Open Scene → Lighting, choose a reflection
   preset/strength and Apply to selected surfaces. These are camera-dependent environment
   maps, not reflections of nearby objects. Matching maps share one image.
6. In Lighting, enable distance fog and set color/start/end. Native fog supports
   static OBJ surfaces through a geometry overlay. It consumes geometry RAM and one extra
   draw per object, with no texture allocation. Water, particles, animated and dynamic
   models retain their own materials. Browser fog is an approximation and is temporarily disabled in Terrain. Native refreshes are spread across frames; settled static objects reuse their colors. A dense moving view may take about a second to finish a refresh.
7. Set Recesses, Midtones and Highlights colors/strengths independently, then Apply to
   static objects. Choose Draft/Balanced/High bake quality beside Apply. Contact shading uses nearby static geometry; Include baked directional
   lighting optionally freezes ambient/directional illumination. It is off by default so the live Sun continues lighting the baked surfaces. Restore original colors
   reverses the bake. Textures remain assigned and no lightmap is added.
8. Scene → Bake Lighting → Shared shadow blobs generates directional silhouettes for
   selected static OBJ objects. Matching geometry/orientation/relative scale shares a texture,
   including instances with different baked vertex colors. Drape On Geometry is enabled:
   give platforms/floors solid colliders and enable physics so they receive the projection.
   The caster and triggers are excluded. Restore Original Lighting also restores these shadows.

## Memory and preview

| Generated asset | Texture storage including palette |
| --- | ---: |
| Water pattern, 512² at 4 bits | 131,328 bytes per frame (32 shared frames) |
| Ultra-low water, 32² at 4 bits | 768 bytes, one static frame |
| Caustic pattern, 512² at 4 bits | 131,328 bytes |
| Reflection map, 128² at 4 bits | 8,448 bytes |
| Shared silhouette, 128² at 4 bits | 8,448 bytes per distinct profile |
| Particle sprite, 64² at 4 bits | 2,304 bytes per sprite type |
| Landscape atlas, 512² at 4 bits | 131,328 bytes |
| Landscape atlas, 1024² at 4 bits | 524,544 bytes |
| Baked vertex colors / fog | No extra texture VRAM; geometry RAM and draw costs apply |

Water quality offers independent texture size, transparency, pattern animation, panning, mesh waves and caustic controls plus Linear/Nearest filtering. Ultra low removes all five effects and uses one 32² texture and a two-triangle generated plane. Custom meshes keep their authored topology. The cost readout estimates callback cost and reports texture VRAM, frame count, triangles and animation RAM; it is an estimate for one surface at 640 × 448, not a guarantee for every scene.

The 512² pattern is a looping 3D Voronoi field sampled along Z, with 32 frames at 16 FPS. Pattern, panning and wave clocks are independent. Motion controls cap quality; Flow, Wave height and Ripple distortion specify the authored amount. Maximum does not invent wave height or flow. Geometry/UV pose buffers are copied in native code and static receiver caustics are baked once; moved receivers fall back to the live projector. Position/UV caches are bounded to 8 MB and use 128 phases (64 for combined wave/ripple/reflection profiles). This trades fine temporal steps for much less CPU work without changing triangle count. Legacy authored water retains its 15 Hz motion update rate.

Model Texture Animation and particle Flipbook controls support an atlas grid, FPS and loop/hold. They share one image and update UVs only when an object's or particle's frame changes.

Particle pools are capped at 64 and draw once per emitter; each particle has independent
vertex/color storage. Identical indexed images are reused. Problems estimates buffer,
texture and palette pressure against the GS's 4 MB and offers a 16-bit buffer fix. An unlocked working set can exceed VRAM through streaming, which may stall but does not silently reduce texture resolution. A single texture that cannot fit beside locked surfaces blocks export.

Scene and Game preview water and particles without executing exported gameplay scripts
or ODE. Use native Play for event, collision and receiver behavior. The included coastal
fixture passes native execution, but its scene-reload probe still hangs in the bundled
player, including a baseline with these new effects disabled. The editor does not patch
that ELF. See [verification](PRODUCTION-VERIFICATION.md) for evidence and limitations.
