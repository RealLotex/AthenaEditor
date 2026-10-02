import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { load } from "./_load.js";

const A = await load();

// ═══════════════════════════════════════════════════════════════════════
//  PABE — the register that made every translucent surface opaque
//
//  `Screen.setParam(PIXEL_ALPHA_BLEND_ENABLE, ...)` does not enable alpha
//  blending. It writes the GS PABE register (graphics.c:479), which ps2sdk
//  documents as "Alpha blending control in units of pixels"
//  (GS_REG_PABE 0x49). Its meaning is the opposite of what the name
//  suggests:
//
//      PABE 0 - blending follows the primitive's ABE bit, ie normal
//      PABE 1 - blending happens ONLY where the source alpha's MSB is set
//
//  PS2 alpha stores 128 as fully opaque, so with PABE on the only alpha
//  that blends is the one that is already opaque; every translucent value
//  is written straight through. Measured on PCSX2: with PABE on, alpha is
//  all-or-nothing; with it off, darkening tracks alpha 1:1 (10/25/50/75/
//  100% at alpha 0.10/0.25/0.50/0.75/1.00). See docs/HARDWARE-NOTES.md.
//
//  ABE itself is on by default (gsGlobal->PrimAlphaEnable, render.c:383),
//  so turning PABE off is all that is needed.
// ═══════════════════════════════════════════════════════════════════════

Deno.test("a new project does not turn PABE on", () => {
  const p = A.mkProject();
  assertEquals(
    p.display.alphaTest.pixelBlend,
    false,
    "PABE on makes every translucent surface in the project opaque",
  );
});

Deno.test("a migrated legacy project has PABE turned off too", () => {
  // v2 projects carried the old default; leaving it would keep their
  // shadows and HUD opaque for no reason the user could see.
  const legacy = A.mkProject();
  legacy.display.alphaTest.pixelBlend = true;
  const migrated = A.migrateProject(legacy);
  assertEquals(migrated.display.alphaTest.pixelBlend, false);
});

Deno.test("codegen emits PABE off for a default project", () => {
  const p = A.migrateProject(A.mkProject());
  const out = A.generateProject(p, []);
  assertStringIncludes(out.main, "Screen.setParam(Screen.PIXEL_ALPHA_BLEND_ENABLE, false);");
});

const problemsFor = (p) => A.validateScene(p.scenes[0], [], p);

Deno.test("turning PABE back on is reported as a problem", () => {
  const p = A.migrateProject(A.mkProject());
  p.display.alphaTest.pixelBlend = true;
  const hit = problemsFor(p).find((d) => /blend pixels|PABE/i.test(d.message || ""));
  assert(hit, "expected a problem about PABE");
  assertStringIncludes(hit.message.toLowerCase(), "opaque");
});

Deno.test("the PABE problem offers a one-click fix", () => {
  const p = A.migrateProject(A.mkProject());
  p.display.alphaTest.pixelBlend = true;
  const hit = problemsFor(p).find((d) => /blend pixels|PABE/i.test(d.message || ""));
  assertEquals(hit.fix?.path, "display.alphaTest.pixelBlend");
  assertEquals(hit.fix?.value, false);
});

Deno.test("a default project raises no PABE problem", () => {
  const p = A.migrateProject(A.mkProject());
  assert(
    !problemsFor(p).some((d) => /blend pixels|PABE/i.test(d.message || "")),
    "the default must be clean",
  );
});
