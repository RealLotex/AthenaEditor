// ═══════════════════════════════════════════════════════════════════════
//  SCAFFOLD — what a brand new project folder contains
//
//  New Project used to replace the in-memory project and leave the user to
//  assemble a runnable folder by hand: copy athena.elf and athena.ini out of a
//  release, make five directories with exactly the right names, find meshes
//  for whatever the template refers to, then export. Miss one and the program
//  does not boot, usually with no message.
//
//  This module decides the contents; core/fsaccess.js writes them. Keeping the
//  decision here means it is testable without the File System Access API,
//  which cannot be driven from a test.
//
//  main.js is deliberately NOT part of the plan. The normal export path
//  already knows how to write it safely, so scaffolding hands over to it and
//  there is only one place that can overwrite generated code.
// ═══════════════════════════════════════════════════════════════════════

/**
 * The default athena.ini, byte for byte what the release ships.
 * `default_script` is what the ELF runs at boot, so it has to name main.js.
 */
const ATHENA_INI = `boot_logo = false
dark_mode = true
default_script = "main.js"

# IOP module loading
audsrv = true
`;

/**
 * Plan a new project folder.
 *
 * Returns the directories to create, the text files to write, and the asset
 * entries the editor should hold in memory for them. Nothing here touches
 * disk, and nothing overwrites: fsScaffoldProject skips paths that already
 * exist, so pointing this at a folder that is already a game cannot destroy it.
 */
function planScaffold(project, template) {
  const dirs = [...new Set(Object.values(project.dirs || {}).filter(Boolean))];

  const files = [{ path: "athena.ini", text: ATHENA_INI }];

  // Placeholder meshes for whatever the template refers to by convention, so
  // the scene is not a list of missing-asset errors on the first render.
  const meshes = templateAssetFiles(project, templateAssetNames(template));
  for (const f of meshes) files.push(f);

  // The behaviour scripts a template carries. Export writes these too; having
  // them on disk first means the folder is complete even if the user never
  // exports, and the two agree so no overwrite prompt appears.
  const scriptDir = project.dirs?.scripts || "scripts";
  for (const s of project.scripts || []) {
    files.push({ path: `${scriptDir}/${s.name}`, text: s.content });
  }

  // The project file records the assets, so it is built last and from the same
  // entries the editor adopts — otherwise the file on disk claims the folder
  // is empty until the next save.
  const assets = meshes.map(assetEntry);
  files.push({ path: projectFileName(project), text: projectToJSON(project, assets) });

  return { dirs, files, assets };
}

/**
 * A scaffolded file as an asset entry, shaped exactly like the ones a picked
 * folder produces — export resolves meshes through `files`, so a freshly
 * scaffolded project must generate without missing-asset warnings before the
 * folder has ever been read back.
 */
function assetEntry(file) {
  const name = file.path.split("/").pop();
  return {
    id: uid(),
    name,
    cat: categorize(name),
    folder: file.path.split("/")[0],
    size: file.text.length,
    content: file.text,
  };
}

/** Project JSON uses AthEditor's own file association; legacy JSON still opens. */
const projectFileName = (project) => `${ident(project.name, "project")}${PROJECT_EXTENSION}`;

function createEditorProject(template,name) {
  const project=template.make();project.name=name.trim()||"My Project";
  for(const asset of planScaffold(project,template).assets)putProjectAsset(project,asset);
  for(const asset of [paletteEditorAsset(),...prototypeTextureAssets()])putProjectAsset(project,asset);
  return project;
}

/**
 * Mesh names a template expects, taken from its `needs` list so the two cannot
 * drift: `needs` is also what the New Project dialog shows.
 */
function templateAssetNames(template) {
  return (template?.needs || []).map((p) => p.split("/").pop());
}
