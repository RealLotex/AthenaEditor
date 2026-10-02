import { assert, assertEquals, assertStringIncludes, assertThrows } from "jsr:@std/assert@1";
import { load } from "./_load.js";

// ═══════════════════════════════════════════════════════════════════════
//  ROBUSTNESS — the editor must not lose work, and must not blank out
//
//  Every case here is a defect that was reachable from the UI, not a
//  hypothetical. They share a shape: something the code trusted turned out
//  not to hold, and the failure landed on the user rather than on a message.
// ═══════════════════════════════════════════════════════════════════════

const A = await load([
  "core/util.js", "core/math.js", "core/shadowmath.js", "core/imagesize.js",
  "core/skybox.js",
  "core/components.js", "core/project.js", "core/validate.js", "core/storage.js",
]);

// ── a diagnostic's one-click fix ───────────────────────────────────────
//
// `fix` comes in three shapes and the object one crashed the panel it was
// rendered in: `p.fix?.startsWith(...)` guards null but not an object. Two
// live diagnostics carry it — PABE, and a rigidbody mass over 100.

Deno.test("the shapes of a fix are told apart", () => {
  assert(A.isPathFix({ path: "display.alphaTest.pixelBlend", value: false, label: "Turn it off" }));
  assert(!A.isPathFix("renameDuplicates"));
  assert(!A.isPathFix("add:model"));
  assert(!A.isPathFix(null));
  assert(!A.isPathFix(undefined));
  assert(!A.isPathFix({ value: 5 }), "an object with no path is not a path fix");

  assertEquals(A.fixKey("renameDuplicates"), "renameDuplicates");
  assertEquals(A.fixKey({ path: "x" }), null, "an object must never be used as a FIXES key");
  assertEquals(A.fixKey(null), null);
});

Deno.test("the diagnostics that carry an object fix are the ones that used to crash", () => {
  // PABE on.
  const p = A.migrateProject(A.mkProject());
  p.display.alphaTest.pixelBlend = true;
  const pabe = A.validateScene(p.scenes[0], [], p).find((d) => /Blend Pixels/.test(d.message));
  assert(pabe, "the PABE warning is gone");
  assert(A.isPathFix(pabe.fix), "PABE's fix is the object shape");

  // A mass no contact can carry.
  const q = A.migrateProject(A.mkProject());
  const o = A.mkObject("Boulder");
  o.components.rigidbody = Object.assign(A.makeComponent("rigidbody"), { mode: "dynamic", mass: 200 });
  q.scenes[0].objects.push(o);
  q.scenes[0].physics.enabled = true;
  const heavy = A.validateScene(q.scenes[0], [], q).find((d) => /never comes to rest/.test(d.message));
  assert(heavy, "the runaway-mass error is gone");
  assert(A.isPathFix(heavy.fix));
});

Deno.test("a path fix writes the project setting it names", () => {
  const p = A.migrateProject(A.mkProject());
  p.display.alphaTest.pixelBlend = true;
  const d = A.validateScene(p.scenes[0], [], p).find((x) => /Blend Pixels/.test(x.message));
  assertEquals(A.applyPathFix(d, p, p.activeSceneId), true);
  assertEquals(p.display.alphaTest.pixelBlend, false, "the fix did not take");
});

Deno.test("a path fix writes the component field it names, on the right object", () => {
  const p = A.migrateProject(A.mkProject());
  const o = A.mkObject("Boulder");
  o.components.rigidbody = Object.assign(A.makeComponent("rigidbody"), { mode: "dynamic", mass: 200 });
  p.scenes[0].objects.push(o);
  p.scenes[0].physics.enabled = true;
  const d = A.validateScene(p.scenes[0], [], p).find((x) => /never comes to rest/.test(x.message));
  assertEquals(A.applyPathFix(d, p, p.activeSceneId), true);
  assertEquals(o.components.rigidbody.mass, 5);
});

Deno.test("a path fix refuses a path it does not understand", () => {
  // Better to do nothing than to write somewhere unintended.
  const p = A.migrateProject(A.mkProject());
  const d = { fix: { path: "somewhere.else", value: 1 }, objectId: null };
  assertEquals(A.applyPathFix(d, p, p.activeSceneId), false);
  assertEquals(p.somewhere, undefined);
});

Deno.test("a path fix on a missing object does nothing rather than throwing", () => {
  const p = A.migrateProject(A.mkProject());
  const d = { fix: { path: "components.rigidbody.mass", value: 5 }, objectId: "nope" };
  assertEquals(A.applyPathFix(d, p, p.activeSceneId), false);
});

// ── recognising a project ──────────────────────────────────────────────
//
// migrateProject is permissive on purpose, and permissiveness all the way
// down meant any JSON at all became a project: a package.json loaded as a
// project called "my-app", replacing the real one in memory, in undo, and
// four seconds later in the autosave.

Deno.test("a real project is recognised", () => {
  assert(A.looksLikeProject(A.mkProject()));
  assert(A.looksLikeProject({ version: 3 }), "an old project may predate any scenes");
  assert(A.looksLikeProject({ scenes: [] }), "and a new one may have no version yet");
});

Deno.test("things that are not projects are refused", () => {
  for (const junk of [null, undefined, 42, "text", [1, 2, 3], {}, { name: "my-app", dependencies: {} }]) {
    assertEquals(A.looksLikeProject(junk), false, `${JSON.stringify(junk)} was accepted`);
  }
});

Deno.test("the gate does not reject anything migrateProject can still repair", () => {
  // The point of the gate is recognising the FORMAT, not judging the content.
  const rough = { version: 2, scenes: [{ name: "Level", objects: [{ name: "A" }] }] };
  assert(A.looksLikeProject(rough));
  const migrated = A.migrateProject(rough);
  assertEquals(migrated.version, 3);
  assertEquals(migrated.scenes.length, 1);
});

// ── render paths that must not throw ───────────────────────────────────
//
// These run on every frame for every object. A prefab instance or a template
// never passes through migrateProject, so "the migration repairs it" is not
// a defence.

Deno.test("a transform with null parts still bakes", () => {
  // migrateComponent's backfill only replaces undefined, so a null survives
  // migration and reached matFromTRS, where rotation was the one unguarded
  // term. Export died with "Cannot read properties of null (reading 'x')".
  const m = A.matFromTRS(null, null, null);
  assertEquals(m.length, 16);
  for (const v of m) assert(Number.isFinite(v), "a null transform produced a NaN matrix");
  assertEquals(A.matFromTRS({ x: 1 }, null, null)[12], 1);
});

Deno.test("worldTransform survives an object with no transform at all", () => {
  const o = A.mkObject("Bare");
  delete o.components.transform;
  const t = A.worldTransform(o, []);
  for (const k of ["x", "y", "z"]) assert(Number.isFinite(t.position[k]));
});

Deno.test("the objectRef filters tolerate an object with no components", () => {
  // They run inside the Inspector's render with no boundary between them and
  // the panel, so one componentless object killed the whole Inspector.
  const bare = { id: "x", name: "Bare" };
  for (const key of ["shadow"]) {
    for (const f of COMPONENTS_FIELDS(A, key)) {
      if (f.type !== "objectRef" || !f.filter) continue;
      assertEquals(f.filter(bare), false, `${key}.${f.key} threw or matched a bare object`);
    }
  }
});

function COMPONENTS_FIELDS(A, key) {
  return A.COMPONENTS[key]?.fields || [];
}

Deno.test("validateScene survives a scene full of malformed objects", () => {
  // The Problems panel is where you go when something is wrong; it must not
  // be the thing that breaks.
  const p = A.migrateProject(A.mkProject());
  p.scenes[0].objects.push(
    { id: "a", name: "NoComponents" },
    { id: "b", name: undefined, components: {} },
    { id: "c", name: "NullTransform", components: { transform: { position: null, rotation: null, scale: null } } },
  );
  const out = A.validateScene(p.scenes[0], [], p);
  assert(Array.isArray(out));
});

// ── autosave ───────────────────────────────────────────────────────────
//
// A single slot, written on a pure debounce, with a failure that returned a
// bare boolean nobody looked at. Three separate ways to lose everything.

/** A localStorage that can be told to run out of room. */
function fakeStorage({ limit = Infinity } = {}) {
  const data = new Map();
  return {
    data,
    limit,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem(k, v) {
      const size = [...data].reduce((n, [key, val]) => n + key.length + val.length, 0);
      if (size - (data.get(k)?.length || 0) + v.length > this.limit) {
        throw new DOMException("exceeded the quota", "QuotaExceededError");
      }
      data.set(k, v);
    },
    removeItem: (k) => data.delete(k),
  };
}

function withStorage(store, fn) {
  const real = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", { value: store, configurable: true });
  try { return fn(); } finally {
    if (real === undefined) delete globalThis.localStorage;
    else Object.defineProperty(globalThis, "localStorage", { value: real, configurable: true });
  }
}

Deno.test("a successful save reports ok", () => {
  const store = fakeStorage();
  const r = withStorage(store, () => A.saveAutosave(A.migrateProject(A.mkProject())));
  assertEquals(r.ok, true);
  assert(store.getItem("athena.editor.project"));
});

Deno.test("the previous save is kept as a second slot", () => {
  const store = fakeStorage();
  withStorage(store, () => {
    const p = A.migrateProject(A.mkProject());
    p.name = "First";
    A.saveAutosave(p);
    p.name = "Second";
    A.saveAutosave(p);
  });
  assertStringIncludes(store.getItem("athena.editor.project"), "Second");
  assertStringIncludes(store.getItem("athena.editor.project.prev"), "First");
});

Deno.test("an unreadable newest slot falls back to the previous one", () => {
  const store = fakeStorage();
  const restored = withStorage(store, () => {
    const p = A.migrateProject(A.mkProject());
    p.name = "Good";
    A.saveAutosave(p);
    p.name = "Newer";
    A.saveAutosave(p);
    store.setItem("athena.editor.project", "{ this is not json");
    return A.loadAutosave();
  });
  assertEquals(restored.project.name, "Good");
  assert(restored.recoveredFrom, "the caller must be told it is not the newest");
});

Deno.test("an unreadable autosave with no fallback is reported, not swallowed", () => {
  // Returning null here is what booted a blank editor over the user's work.
  const store = fakeStorage();
  const out = withStorage(store, () => {
    store.setItem("athena.editor.project", "{ truncated");
    return A.loadAutosave();
  });
  assert(out.unreadable, "an unreadable save must not look like an absent one");
  assertStringIncludes(out.unreadable.raw, "truncated");
});

Deno.test("no autosave at all is still simply nothing", () => {
  assertEquals(withStorage(fakeStorage(), () => A.loadAutosave()), null);
});

Deno.test("running out of room drops the backup rather than the save", () => {
  const p = A.migrateProject(A.mkProject());
  const one = JSON.stringify({ at: Date.now(), project: p }).length;
  const store = fakeStorage({ limit: Math.floor(one * 1.6) });   // room for one, not two
  const r = withStorage(store, () => {
    A.saveAutosave(p);
    return A.saveAutosave(p);
  });
  assertEquals(r.ok, true, "the current project must survive a full backup slot");
  assertEquals(store.getItem("athena.editor.project.prev"), null);
});

Deno.test("a save that cannot be written at all says why", () => {
  const store = fakeStorage({ limit: 10 });
  const r = withStorage(store, () => A.saveAutosave(A.migrateProject(A.mkProject())));
  assertEquals(r.ok, false);
  assertEquals(r.reason, "quota");
  assert(r.message, "the reason has to be reportable to the user");
});

Deno.test("the max wait is shorter than a gesture and longer than the debounce", () => {
  // A debounce alone never fires while the user keeps dragging.
  assert(A.AUTOSAVE_MAX_MS > A.AUTOSAVE_MS);
  assert(A.AUTOSAVE_MAX_MS <= 30000, "work must not go unsaved for half a minute");
});

// ── the Inspector's everyday / advanced split ──────────────────────────
//
// The brief was "easier to use, without losing the ability to turn on the
// advanced configuration". So: fewer controls in front of a beginner, and
// not one control fewer overall.

Deno.test("no required field is ever hidden behind the disclosure", () => {
  // A required field behind a fold is a component that cannot be made to work
  // by someone who does not know the fold is there.
  for (const [key, def] of Object.entries(A.COMPONENTS)) {
    for (const f of def.fields || []) {
      assert(!(f.required && f.advanced), `${key}.${f.key} is required AND advanced`);
    }
  }
});

Deno.test("every component still has something to show before you open anything", () => {
  for (const [key, def] of Object.entries(A.COMPONENTS)) {
    const everyday = (def.fields || []).filter((f) => !f.advanced);
    assert(everyday.length > 0, `${key} would render as an empty panel`);
  }
});

Deno.test("the fields that are folded away are the ones with sane defaults", () => {
  // Spot-check the classification against the reasoning behind it: an advanced
  // field must have a default, because the whole premise is that you can leave
  // it alone.
  for (const [key, def] of Object.entries(A.COMPONENTS)) {
    const made = def.make();
    for (const f of (def.fields || []).filter((x) => x.advanced)) {
      const at = f.key.split(".")[0];
      assert(made[at] !== undefined, `${key}.${f.key} is advanced but has no default`);
    }
  }
});

Deno.test("every field a component stores has a control somewhere", () => {
  // rtBpp existed in make(), was emitted into main.js and was counted in the
  // VRAM budget, with no way to change it from the editor at all.
  const exempt = new Set(["type"]);
  for (const [key, def] of Object.entries(A.COMPONENTS)) {
    const stored = Object.keys(def.make()).filter((k) => !exempt.has(k));
    const reachable = new Set((def.fields || []).map((f) => f.key.split(".")[0]));
    for (const k of stored) {
      assert(reachable.has(k), `${key}.${k} is stored and emitted but has no Inspector control`);
    }
  }
});

// ── a number field must not destroy the value it is showing ────────────

Deno.test("a value too small to round still shows its real magnitude", () => {
  // formatNum rounded to 4 decimals, so the physics CFM default of 1e-5 was
  // displayed as "0" — and NumInput commits what it displays on blur. Clicking
  // into the field and out of it silently set CFM to zero.
  assertEquals(A.formatNum ? A.formatNum(1e-5) : "1e-5", "0.00001");
});

// ── a diagnostic you cannot act on is half a diagnostic ────────────────
//
// Being told what is wrong, in a panel, with no way to reach the thing and no
// way to repair it, is most of the work with none of the payoff.

const sceneWith = (build) => {
  const p = A.migrateProject(A.mkProject());
  const s = p.scenes[0];
  s.physics.enabled = true;
  const mk = (name, comps) => {
    const o = A.mkObject(name);
    for (const [k, v] of Object.entries(comps)) o.components[k] = Object.assign(A.makeComponent(k), v);
    s.objects.push(o);
    return o;
  };
  build(mk, s, p);
  return { p, s };
};

Deno.test("every rigidbody diagnostic offers the repair it is describing", () => {
  const cases = [
    [{ mode: "dynamic", shape: "plane" }, "static"],
    [{ mode: "dynamic", shape: "mesh" }, "box"],
    [{ mode: "dynamic", mass: 40 }, 5],
    [{ mode: "dynamic", mass: 200 }, 5],
  ];
  for (const [rb, expected] of cases) {
    const { p, s } = sceneWith((mk) => mk("Body", { model: { file: "a.obj" }, rigidbody: rb }));
    const d = A.validateScene(s, [], p).find((x) => x.component === "rigidbody" && x.fix);
    assert(d, `no fix offered for ${JSON.stringify(rb)}`);
    assert(A.isPathFix(d.fix), `the fix for ${JSON.stringify(rb)} is not a path fix`);
    assertEquals(d.fix.value, expected);
    // ...and it has to actually repair it.
    assertEquals(A.applyPathFix(d, p, p.activeSceneId), true);
    assertEquals(A.validateScene(s, [], p).filter((x) => x.level === "error" && x.component === "rigidbody").length, 0);
  }
});

Deno.test("a warning and an error about the same thing offer the same button", () => {
  // Mass 40 warns, mass 200 errors, and for a while only one of them offered
  // the repair — which teaches people the button is arbitrary.
  const fixFor = (mass) => {
    const { p, s } = sceneWith((mk) => mk("B", { rigidbody: { mode: "dynamic", mass } }));
    return A.validateScene(s, [], p).find((x) => x.component === "rigidbody" && x.fix)?.fix;
  };
  assertEquals(fixFor(40)?.value, fixFor(200)?.value);
});

Deno.test("the light budget points at the light that is being ignored", () => {
  // "7 lights, 4 are used" is not actionable until you know which to delete.
  const { p, s } = sceneWith((mk, scene) => {
    // A fresh project already ships a Sun, and counting it would make the
    // answer depend on the template rather than on the rule.
    scene.objects = [];
    for (let i = 0; i < 7; i++) mk(`L${i}`, { light: {} });
  });
  const d = A.validateScene(s, [], p).find((x) => /Light components/.test(x.message));
  assert(d, "the light budget warning is gone");
  assertEquals(d.objectName, "L4", "it must name the FIRST light past the limit of 4");
  assert(d.objectId, "with no objectId the panel cannot jump to it");
});

Deno.test("a mesh collider with no Model offers to add one", () => {
  const { p, s } = sceneWith((mk) => mk("Level", { rigidbody: { shape: "mesh" } }));
  const d = A.validateScene(s, [], p).find((x) => /Mesh collider needs a Model/.test(x.message));
  assertEquals(d.fix, "add:model");
});

Deno.test("a mesh collider that already has a Model does not offer to add one", () => {
  // The mesh is missing, not the component — offering "Add Model" would do
  // nothing visible and look broken.
  const { p, s } = sceneWith((mk) => mk("Level", { model: { file: "" }, rigidbody: { shape: "mesh" } }));
  const d = A.validateScene(s, [], p).find((x) => /Mesh collider needs a Model/.test(x.message));
  assertEquals(d.fix, undefined);
});
