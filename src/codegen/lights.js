// ═══════════════════════════════════════════════════════════════════════
//  LIGHTS — Lights.new() / Lights.set()
//
//  AthenaEnv exposes four hardware lights. Directions point TOWARD the light
//  source, matching the engine's own examples ((0, 1, 1) = sun up and behind).
// ═══════════════════════════════════════════════════════════════════════

function emitLights(e, ir) {
  if (!ir.lights.length) return;
  e.section("Lights");
  ir.lights.forEach((l, i) => {
    const c = l.light;
    if (i === 4) e.comment("Beyond the engine's 4-light budget — created but never applied.");
    e.w(`const ${l.vn} = Lights.new();`);
    e.w(`Lights.set(${l.vn}, Lights.DIRECTION, ${f3(c.direction.x)}, ${f3(c.direction.y)}, ${f3(c.direction.z)});`);
    e.w(`Lights.set(${l.vn}, Lights.AMBIENT,   ${f3(c.ambient.r)}, ${f3(c.ambient.g)}, ${f3(c.ambient.b)});`);
    e.w(`Lights.set(${l.vn}, Lights.DIFFUSE,   ${f3(c.diffuse.r)}, ${f3(c.diffuse.g)}, ${f3(c.diffuse.b)});`);
    e.w(`Lights.set(${l.vn}, Lights.SPECULAR,  ${f3(c.specular.r)}, ${f3(c.specular.g)}, ${f3(c.specular.b)});`);
    e.nl();
  });
}
