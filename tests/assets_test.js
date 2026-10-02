import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { load } from "./_load.js";

// ═══════════════════════════════════════════════════════════════════════
//  ASSET REFRESH
//
//  The symptom was "sometimes I have to switch to the HUD tab and back for a
//  model I changed to reload". Switching tabs unmounts the viewport, so
//  everything rebuilds — which is what made it look intermittent rather than
//  broken. Two layers were at fault and either one alone reproduces it:
//
//   1. mergeAssets only re-took a file's payload when its SIZE changed, and a
//      mesh re-exported from Blender very often has the identical byte count.
//      The new bytes never entered the editor at all.
//   2. The viewport cached a built mesh against the asset's `id`, which
//      mergeAssets deliberately holds constant so component references keep
//      resolving. Same id, same key, early return, stale geometry.
// ═══════════════════════════════════════════════════════════════════════

const A = await load(["core/util.js", "core/storage.js"]);

const file = (patch = {}) => ({
  id: "a1", name: "hero.glb", cat: "models", size: 100, mtime: 1000,
  dataUrl: "data:x;base64,AAA", ...patch,
});

// ── assetChanged ───────────────────────────────────────────────────────

Deno.test("a different size is a change", () => {
  assert(A.assetChanged(file(), file({ size: 101 })));
});

Deno.test("a re-export of the same size is still a change", () => {
  // This is the one that mattered: Blender writing the same mesh again lands
  // on the same byte count more often than you would think.
  assert(A.assetChanged(file(), file({ mtime: 2000 })));
});

Deno.test("the same file read twice is not a change", () => {
  assert(!A.assetChanged(file(), file()));
});

Deno.test("with no timestamps, the payload decides", () => {
  // Entries restored from an autosave, or written by the scaffolder, have no
  // mtime. Assuming "unchanged" there would resurrect the bug for them.
  const a = file({ mtime: undefined });
  const b = file({ mtime: undefined, dataUrl: "data:x;base64,BBB" });
  assert(A.assetChanged(a, b));
  assert(!A.assetChanged(a, file({ mtime: undefined })));
});

Deno.test("a missing side counts as changed", () => {
  assert(A.assetChanged(null, file()));
  assert(A.assetChanged(file(), null));
});

// ── assetRevision ──────────────────────────────────────────────────────

Deno.test("the revision token moves when the content moves", () => {
  assertNotEquals(A.assetRevision(file()), A.assetRevision(file({ mtime: 2000 })));
  assertNotEquals(A.assetRevision(file()), A.assetRevision(file({ size: 101 })));
  assertNotEquals(A.assetRevision(file()), A.assetRevision(file({ dataUrl: "data:x;base64,AAAA" })));
});

Deno.test("the revision token is stable for an unchanged file", () => {
  assertEquals(A.assetRevision(file()), A.assetRevision(file()));
});

Deno.test("the revision token ignores bounds", () => {
  // The viewport writes bounds back onto the file entry after a mesh loads.
  // If that moved the token, every load would invalidate its own cache entry
  // and the viewport would rebuild in a loop.
  assertEquals(A.assetRevision(file()), A.assetRevision(file({ bounds: { size: { x: 1, y: 2, z: 3 } } })));
});

Deno.test("a missing asset has its own token, distinct from any file", () => {
  assertEquals(A.assetRevision(null), "missing");
  assertEquals(A.assetRevision(undefined), "missing");
  assertNotEquals(A.assetRevision(file()), "missing");
});

// ── mergeAssets ────────────────────────────────────────────────────────

Deno.test("a changed file keeps its id but takes the new payload", () => {
  // The id has to survive: components refer to assets by name, and the rest of
  // the editor tracks selection by id.
  const before = [file()];
  const after = A.mergeAssets(before, [file({ id: "fresh", mtime: 2000, dataUrl: "data:x;base64,ZZZ" })]);
  assertEquals(after.length, 1);
  assertEquals(after[0].id, "a1", "the id must stay stable");
  assertEquals(after[0].dataUrl, "data:x;base64,ZZZ", "the new bytes must win");
});

Deno.test("a same-size re-export is not discarded", () => {
  // The exact defect: `next.size !== f.size` threw this away.
  const after = A.mergeAssets([file()], [file({ id: "fresh", mtime: 9999, dataUrl: "data:x;base64,NEW" })]);
  assertEquals(after[0].dataUrl, "data:x;base64,NEW");
});

Deno.test("a changed file drops the bounds fitted to the old one", () => {
  const before = [file({ bounds: { size: { x: 1, y: 1, z: 1 } } })];
  const after = A.mergeAssets(before, [file({ mtime: 2000 })]);
  assertEquals(after[0].bounds, undefined, "a Rigidbody would auto-fit to the old mesh");
});

Deno.test("an unchanged file is kept by identity, so nothing downstream rebuilds", () => {
  const before = [file({ bounds: { size: { x: 1, y: 1, z: 1 } } })];
  const after = A.mergeAssets(before, [file()]);
  assertEquals(after[0], before[0]);
  assert(after[0].bounds, "re-reading an unchanged folder must not throw away measured bounds");
});

Deno.test("an unchanged legacy asset gains its folder path without losing geometry bounds",()=>{
  const before=file({bounds:{size:{x:1,y:1,z:1}}});
  const [after]=A.mergeAssets([before],[file({id:"new",sourcePath:"characters/hero.glb"})]);
  assertEquals(after.id,before.id);assertEquals(after.bounds,before.bounds);assertEquals(after.sourcePath,"characters/hero.glb");assertEquals(A.assetRevision(after),A.assetRevision(before));
});

Deno.test("new files are appended and vanished ones are dropped", () => {
  const after = A.mergeAssets([file(), file({ id: "b", name: "gone.glb" })], [file(), file({ id: "c", name: "new.glb" })]);
  assertEquals(after.map((f) => f.name).sort(), ["hero.glb", "new.glb"]);
});

Deno.test("a changed file produces a token the viewport will see as new", () => {
  // The two halves of the fix have to agree: merging must produce an entry
  // whose revision differs, or the cache still holds the old mesh.
  const before = [file()];
  const merged = A.mergeAssets(before, [file({ id: "fresh", mtime: 2000, dataUrl: "data:x;base64,ZZZ" })]);
  assertNotEquals(A.assetRevision(merged[0]), A.assetRevision(before[0]));
});
