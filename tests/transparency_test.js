import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { load } from "./_load.js";

const A = await load();

// ═══════════════════════════════════════════════════════════════════════
//  Transparency presets
//
//  The three GS knobs behind transparency — the alpha test's reference,
//  its comparison, and PABE — have no meaning to someone who has not read
//  the GS manual, and the wrong combination silently makes every
//  semi-transparent surface in the program solid. They are presented as
//  three named outcomes instead, with the raw fields kept for anyone who
//  wants them.
// ═══════════════════════════════════════════════════════════════════════

Deno.test("a new project is on the smooth preset", () => {
  const p = A.mkProject();
  assertEquals(A.transparencyPresetOf(p.display), "smooth");
});

Deno.test("smooth means nothing is clipped and PABE is off", () => {
  const p = A.mkProject();
  const AT = p.display.alphaTest;
  assertEquals(AT.ref, 0, "a reference above 0 silently clips faint pixels");
  assertEquals(AT.pixelBlend, false, "PABE on makes every translucent surface solid");
  assertEquals(AT.enabled, true);
});

Deno.test("every preset has a name and an explanation a non-expert can act on", () => {
  for (const preset of A.TRANSPARENCY_PRESETS) {
    assert(preset.id && preset.label, "a preset needs an id and a label");
    assert(preset.help && preset.help.length > 30, `${preset.id} needs a real explanation`);
    // No GS jargon in what the user reads.
    const text = `${preset.label} ${preset.help}`;
    for (const word of ["PABE", "ALPHA_GREATER", "alpha test", "GS ", "register"]) {
      assert(
        !text.toLowerCase().includes(word.toLowerCase().trim()),
        `${preset.id} says "${word}" to the user`,
      );
    }
  }
});

Deno.test("applying a preset sets every field it owns", () => {
  const d = A.mkProject().display;
  A.applyTransparencyPreset(d, "cutout");
  assertEquals(A.transparencyPresetOf(d), "cutout");
  A.applyTransparencyPreset(d, "smooth");
  assertEquals(A.transparencyPresetOf(d), "smooth");
});

Deno.test("hand-edited settings that match no preset read as custom", () => {
  const d = A.mkProject().display;
  d.alphaTest.ref = 37;
  assertEquals(A.transparencyPresetOf(d), "custom");
});

Deno.test("the cutout preset clips, which is the point of it", () => {
  const d = A.mkProject().display;
  A.applyTransparencyPreset(d, "cutout");
  assert(d.alphaTest.ref > 0, "a cutout needs a threshold to cut at");
  assertEquals(d.alphaTest.pixelBlend, false, "even a cutout must not turn PABE on");
});

Deno.test("no preset turns PABE on", () => {
  // There is no outcome a user would ask for that PABE delivers, and every
  // one it breaks is silent. It stays off in all of them.
  for (const preset of A.TRANSPARENCY_PRESETS) {
    assertEquals(preset.settings.pixelBlend, false, `${preset.id} enables PABE`);
  }
});

Deno.test("the alpha reference is capped at the PS2's 128, not 255", () => {
  // The field used to allow 255. Anything above 128 rejects every pixel,
  // because 128 is already fully opaque on this hardware.
  assertEquals(A.ALPHA_REF_MAX, 128);
});

Deno.test("codegen emits a reference of 0 for a default project", () => {
  const p = A.migrateProject(A.mkProject());
  const out = A.generateProject(p, []);
  assertStringIncludes(out.main, "Screen.setParam(Screen.ALPHA_TEST_REF, 0);");
});
