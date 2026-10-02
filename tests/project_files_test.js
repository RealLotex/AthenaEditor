import { fileStorage } from "./_file_storage.js";
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";

const source = (await Promise.all(
  ["core/util.js", "core/fsaccess.js"].map((path) =>
    Deno.readTextFile(new URL(`../src/${path}`, import.meta.url))
  ),
)).join("\n");

function filesAPI(indexedDB, window = {}) {
  return new Function(
    "indexedDB",
    "window",
    source + `\nreturn {
    fsSaveProjectFile, fsLoadProjectFile, fsForgetProjectFile,
    fsPickProjectFile, fsPickProjectSave, isProjectFilePickerSupported,
    fsSaveHandle, fsLoadHandle, fsEnsurePermission, fsPermissionState,
    fsLoadRecentProjects, fsRememberRecentProject
  };`,
  )(indexedDB, window);
}

Deno.test("remembered project files restore only for the matching autosaved project and keep folder storage separate", async () => {
  const storage = fileStorage(), api = filesAPI(storage.indexedDB);
  const handle = { kind: "file", name: "chosen.json" },
    folder = { kind: "directory", name: "assets" };
  await api.fsSaveHandle(folder);
  await api.fsSaveProjectFile(handle, "project-a");
  assertEquals(await api.fsLoadProjectFile("project-a"), handle);
  assertEquals(await api.fsLoadProjectFile("project-b"), null);
  assertEquals(await api.fsLoadHandle(), folder);
  await api.fsForgetProjectFile();
  assertEquals(await api.fsLoadProjectFile("project-a"), null);
  assertEquals(await api.fsLoadHandle(), folder);
  assertEquals(
    storage.closes,
    8,
    "every completed transaction closes its database connection",
  );
});

Deno.test("recent projects keep exact handles and folder ownership, deduplicate IDs and serialize concurrent updates", async () => {
  const storage = fileStorage(), api = filesAPI(storage.indexedDB);
  const folder = { kind: "directory", name: "Assets" };
  await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      api.fsRememberRecentProject(
        { kind: "file", name: `${i}.atheditor` },
        { id: `id-${i}`, name: `Project ${i}` },
        folder,
      )),
  );
  let recent = await api.fsLoadRecentProjects();
  assertEquals(recent.length, 8);
  assertEquals(recent[0].projectId, "id-9");
  assertEquals(recent.at(-1).projectId, "id-2");
  const changed = { kind: "file", name: "renamed.atheditor" };
  await api.fsRememberRecentProject(changed, { id: "id-5", name: "Renamed" });
  recent = await api.fsLoadRecentProjects();
  assertEquals(recent.length, 8);
  assertEquals(recent[0].handle, changed);
  assertEquals(recent[0].folder, null);
  assertEquals(recent.filter((entry) => entry.projectId === "id-5").length, 1);
  assertEquals(recent[1].folder, folder);
});

Deno.test("remembered folders belong to their project and unowned legacy handles cannot leak into another autosave", async () => {
  const storage = fileStorage(), api = filesAPI(storage.indexedDB);
  const folder = { kind: "directory", name: "Project A" };
  await api.fsSaveHandle(folder, "a");
  assertEquals(await api.fsLoadHandle("a"), folder);
  assertEquals(await api.fsLoadHandle("b"), null);
  await api.fsSaveHandle(folder);
  assertEquals(await api.fsLoadHandle(), folder);
  assertEquals(await api.fsLoadHandle("b"), null);
});

Deno.test("reading assets uses read access and querying startup permissions never prompts", async () => {
  const api = filesAPI(undefined), queries = [], requests = [];
  const folder = {
    queryPermission: ({ mode }) => {
      queries.push(mode);
      return Promise.resolve(mode === "read" ? "granted" : "prompt");
    },
    requestPermission: ({ mode }) => {
      requests.push(mode);
      return Promise.resolve("granted");
    },
  };
  assertEquals(await api.fsPermissionState(folder), "prompt");
  assertEquals(await api.fsPermissionState(folder, "read"), "granted");
  assertEquals(await api.fsEnsurePermission(folder, "read"), true);
  assertEquals(requests, []);
  assertEquals(queries, ["readwrite", "read", "read"]);
  assertEquals(await api.fsEnsurePermission(folder), true);
  assertEquals(requests, ["readwrite"]);
});

Deno.test("file pickers run immediately from the command and preserve the suggested filename and directory", async () => {
  const calls = [], handle = { kind: "file", name: "Existing.json" };
  const api = filesAPI(undefined, {
    showOpenFilePicker(options) {
      calls.push(options);
      return Promise.resolve([handle]);
    },
    showSaveFilePicker(options) {
      calls.push(options);
      return Promise.resolve(handle);
    },
  });
  assert(api.isProjectFilePickerSupported("open"));
  const opening = api.fsPickProjectFile();
  assertEquals(
    calls.length,
    1,
    "no asynchronous work before displaying the picker",
  );
  assertEquals(await opening, handle);
  const saving = api.fsPickProjectSave("New.athena.json", handle);
  assertEquals(calls.length, 2);
  assertEquals(await saving, handle);
  assertEquals(calls[1].startIn, handle);
  assertEquals(calls[1].suggestedName, "New.athena.json");
  assertEquals(calls[1].types[0].description, "AthEditor project");
});

Deno.test("persisted permissions are reused and unavailable storage never restores an unrelated file", async () => {
  const api = filesAPI({
    open() {
      throw Error("Storage disabled");
    },
  });
  let requested = false;
  assertEquals(
    await api.fsEnsurePermission({
      queryPermission: async () => "granted",
      requestPermission: async () => {
        requested = true;
        return "granted";
      },
    }),
    true,
  );
  assertEquals(requested, false);
  assertEquals(await api.fsLoadProjectFile("a"), null);
  await assertRejects(
    () => api.fsSaveProjectFile({ kind: "file" }, "a"),
    Error,
    "Storage disabled",
  );
});
