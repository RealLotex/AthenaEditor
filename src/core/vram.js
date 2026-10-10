const GS_VRAM_CAPACITY = 4 * 1024 * 1024;
const PSM_PRESETS = {
  CT32_Z32: ["Screen.CT32", "Screen.Z32"],
  CT32_Z24: ["Screen.CT32", "Screen.Z24"],
  CT16S_Z16S: ["Screen.CT16S", "Screen.Z16S"],
};

// Codegen inherits Screen.getMode()'s buffer dimensions (not the TV's output
// resolution). Boot is 640x448 NTSC or 640x512 PAL: graphics.c:1356. The PAL
// budget is also useful for games intended to run on both kinds of console.
function sceneVRAMBudget(scene, files, project, dimensions) {
  const display = project?.display || {}, formats = display.psm === "custom"
    ? [display.psmCustomColor || "Screen.CT16S", display.psmCustomDepth || "Screen.Z16S"]
    : PSM_PRESETS[display.psm] || PSM_PRESETS.CT16S_Z16S;
  const width = dimensions?.width || 640, height = dimensions?.height || (display.mode === "PAL" ? 512 : 448);
  const framebuffers = gsSurfaceBytes(width, height, formats[0]) * 2 + gsSurfaceBytes(width, height, formats[1]);
  const uploads = new Map(), unknown = [], assets = new Map(files.filter(f => f.cat === "textures").map(f => [f.name, f]));
  let renderTargets = 0;
  const use = (name, filter = "LINEAR", locked = false, owner = "", instance = "") => {
    if (!name) return;
    const key = `${name}|${filter}|${instance}`, previous = uploads.get(key);
    if (previous) { previous.locked ||= locked; return; }
    const bytes = textureVRAMBytes(assets.get(name));
    if (bytes == null) unknown.push(name);
    else uploads.set(key, { name, filter, bytes, locked, owner });
  };
  const objects = exportableObjects(scene.objects || []);
  for (const object of objects) {
    const model = object.components?.model, shadow = object.components?.shadow;
    const water=object.components?.water?normalizedWater(object.components.water):null,waterTexture=water?waterTextureForQuality(assets.get(model?.textureFile),water,files):null,filter=water?.textureFilter||model?.textureFilter||'LINEAR';
    if(waterTexture)assets.set(waterTexture.name,waterTexture);
    if (model?.texture_mapping !== false) use(waterTexture?.name||model?.textureFile?.trim(),filter,false,object.name);
    if(water && model?.texture_mapping!==false)for(const frame of waterFrameAssets(waterTexture,files)){
      assets.set(frame.name,frame);use(frame.name,filter,false,object.name);
    }
    if(object.components?.reflection)use(object.components.reflection.texture,object.components.reflection.filter||'LINEAR',false,object.name);
    if (shadow) {
      if ((shadow.source || "rendertarget") === "rendertarget") {
        const caster = shadow.caster?.trim() ? objects.find(o => o.name === shadow.caster.trim() && o.components?.model) : model;
        if (caster) { const size = clamp(shadow.rtSize || 128, 32, 512); renderTargets += gsSurfaceBytes(size, size, shadow.rtBpp === 16 ? "CT16" : "CT32"); }
      } else use(shadow.texture?.trim(), "LINEAR", true, object.name);
    }
    if(water?.caustics)use(water.causticTexture,"LINEAR",true,object.name);
  }
  const sky = normalizedSkybox(scene.skybox);
  if (sky.enabled) for (const name of sky.tiles.length ? sky.tiles : [sky.texture]) use(name, sky.textureFilter, false, "Skybox");
  for (const el of scene.uiElements || []) if (el.visible !== false && el.type === "Image") use(el.image, el.imageFilter || "LINEAR", false, el.name);
  for (const sequence of scene.sequences || []) for (const track of sequence.tracks || []) if (track.type === "portrait") {
    for (const clip of track.clips || []) {
      const existing = [...uploads.values()].find(u => u.name === clip.file);
      use(clip.file, existing?.filter || "LINEAR", false, sequence.name);
    }
  }
  const textures = [...uploads.values()].reduce((sum, u) => sum + u.bytes, 0);
  const lockedTextures = [...uploads.values()].filter(u => u.locked).reduce((sum, u) => sum + u.bytes, 0);
  const largest = [...uploads.values()].filter(u => !u.locked).reduce((big, u) => !big || u.bytes > big.bytes ? u : big, null);
  const fixed = framebuffers + renderTargets + lockedTextures;
  return { capacity: GS_VRAM_CAPACITY, width, height, formats: formats.map(f => f.replace(/^Screen\./, "")), framebuffers, renderTargets, textures,
    lockedTextures, fixed, total: framebuffers + renderTargets + textures, peak: fixed + (largest?.bytes || 0), largest, uploads: [...uploads.values()], unknown: [...new Set(unknown)] };
}

function sceneVRAMProblems(scene, files, project) {
  const budget = sceneVRAMBudget(scene, files, project);
  const details = `Estimated VRAM: ${fmtBytes(budget.total)} / 4.0 MB — ${budget.formats.join(" + ")} buffers ${fmtBytes(budget.framebuffers)} (${budget.width}×${budget.height}), textures ${fmtBytes(budget.textures)}, shadow targets ${fmtBytes(budget.renderTargets)}.`;
  const remedy = ` Reduce sky texture size / color depth, remove the lower sky hemisphere, or reduce shadow targets.${project?.display?.psm !== "CT16S_Z16S" ? " CT16S + Z16S leaves more room for textures." : ""}`;
  const out = [];
  // An unlocked texture pool can stream between draws; report total pressure
  // as a warning. One image that cannot fit alongside locked surfaces is fatal.
  if (budget.peak > budget.capacity && (budget.fixed > budget.capacity || budget.largest?.bytes <= GS_VRAM_CAPACITY)) out.push({ level: "error", component: "vram", message: `${details} ${budget.fixed > budget.capacity ? "The locked surfaces alone exceed VRAM." : `"${budget.largest.name}" cannot fit alongside the locked surfaces.`}${remedy}` });
  else if (budget.total > budget.capacity) out.push({ level: "warn", component: "vram", message: `${details} The working set exceeds VRAM by ${fmtBytes(budget.total - budget.capacity)}; texture streaming can cause stalls.${remedy}` });
  else if (budget.total > budget.capacity * .9) out.push({ level: "warn", component: "vram", message: `${details} Less than 10% remains for fonts and other runtime resources.${remedy}` });
  if (budget.unknown.length && budget.total > budget.capacity * .8) out.push({ level: "info", component: "vram", message: `VRAM estimate excludes ${budget.unknown.length} texture(s) without image data and native font textures. Import their image data for a complete texture estimate.` });
  if (project && displayFormatNeeds16BitFix(project.display)) for (const issue of out) if (issue.level !== "info") issue.fix = { path: "display.psm", value: "CT16S_Z16S", label: "Use 16-bit buffers" };
  return out;
}

function displayFormatNeeds16BitFix(display) {
  return display?.psm !== "CT16S_Z16S" && !(display?.psm === "custom" && /CT16S?$/.test(display.psmCustomColor) && /Z16S?$/.test(display.psmCustomDepth));
}
