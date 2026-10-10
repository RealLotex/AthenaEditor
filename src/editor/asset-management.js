// One reference inventory serves deletion, missing-file diagnostics and clipboard.
function objectAssetReferences(objects, visit) {
  walk(objects, object => {
    for(const backup of [object._lightingBake,object._environmentBake]){
      if(backup?.model?.file)visit(backup.model,'file','models',object,'original model');
      if(backup?.model?.textureFile)visit(backup.model,'textureFile','textures',object,'original texture');
    }
    if(object._shadowBake?.shadow?.texture)visit(object._shadowBake.shadow,'texture','textures',object,'original shadow');
    for(const [index,name] of (object._terrain?.textures||[]).entries())if(name)visit(object._terrain.textures,index,'textures',object,'terrain layer');
    for (const [key, component] of Object.entries(object.components || {})) {
      for (const field of COMPONENTS[key]?.fields || []) {
        if (field.type === 'asset' && component[field.key]) visit(component, field.key, field.cat, object, key);
      }
      for (const rule of component.rules || []) for (const action of rule.actions || []) {
        if (action.file && ['playSound', 'playAnimation'].includes(action.type)) visit(action, 'file', action.type === 'playSound' ? 'sounds' : 'models', object, key);
      }
    }
  });
}

function hudAssetReferences(elements, visit) {
  for (const element of elements || []) {
    if (element.image) visit(element, 'image', 'textures', element, 'hud');
    if (element.fontFile && element.fontFile !== 'default') visit(element, 'fontFile', 'fonts', element, 'hud');
    if (element.script?.file) visit(element.script, 'file', 'scripts', element, 'hud');
  }
}

function projectAssetReferences(project) {
  const references = [];
  const visit = (context, sceneId) => (holder, key, cat, object, component) => {
    const name = holder[key];
    if (!name || cat === 'fonts' && name === 'default') return;
    references.push({name, cat, sceneId, objectId: object?.id, component,
      label: `${context}${object ? ' / ' + object.name : ''} / ${component || key}`});
  };
  const sequences = (items, context, sceneId) => {
    for (const item of items || []) for (const track of (item.sequence || item).tracks || []) for (const clip of track.clips || []) {
      const sequence=item.sequence || item;
      const cat = track.type === 'portrait' ? 'textures' : ['sfx', 'voice'].includes(track.type) ? 'sounds' : track.type === 'animation' ? 'models' : null;
      if (cat && clip.file) references.push({name: clip.file, cat, sceneId, component: 'timeline',
        label: `${context} / ${sequence.name} / ${track.name} / ${clip.name}`});
    }
  };
  for (const scene of project.scenes || []) {
    objectAssetReferences(scene.objects, visit(scene.name, scene.id));
    hudAssetReferences(scene.uiElements, visit(scene.name, scene.id));
    if (scene.skybox?.texture) visit(scene.name, scene.id)(scene.skybox, 'texture', 'textures', null, 'skybox');
    for (const [index] of (scene.skybox?.tiles || []).entries()) visit(scene.name, scene.id)(scene.skybox.tiles, index, 'textures', null, 'skybox');
    sequences(scene.sequences, scene.name, scene.id);
    for (const rule of scene.eventRules || []) for (const action of rule.actions || []) {
      if (action.file && ['playSound', 'playAnimation'].includes(action.type)) visit(scene.name, scene.id)(action, 'file', action.type === 'playSound' ? 'sounds' : 'models', null, 'events');
    }
  }
  for (const prefab of project.prefabs || []) objectAssetReferences([prefab], visit(`Prefab ${prefab.name}`));
  sequences(project.sequenceLibrary, 'Sequence library');
  return references;
}

function assetUsage(project, asset) {
  return projectAssetReferences(project).filter(ref => ref.name === asset.name && ref.cat === asset.cat);
}

function missingAssetReferences(project, files) {
  const available = new Set(files.filter(f => !f.error && (f.content !== undefined || f.dataUrl)).map(f => `${f.cat}/${f.name}`));
  return projectAssetReferences(project).filter(ref => !available.has(`${ref.cat}/${ref.name}`));
}

function normalizeLibraryFolder(folder) {
  const path = String(folder).trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!path || path.split('/').some(part => !part.trim() || part === '.' || part === '..' || /[<>:"|?*\u0000-\u001f]/.test(part))) throw Error('Enter a folder name without empty parts or special characters.');
  if (!Object.values(ASSET_CATEGORY_LABELS).includes(path.split('/')[0])) throw Error('Choose an asset type for this folder.');
  return path;
}

function createAssetFolder(project, folder) {
  const path = normalizeLibraryFolder(folder);
  project.assetFolders ||= [];
  if (!project.assetFolders.includes(path)) project.assetFolders.push(path);
  return path;
}

function moveAssetToFolder(project, asset, folder) {
  const path = normalizeLibraryFolder(folder);
  if (path.split('/')[0] !== ASSET_CATEGORY_LABELS[asset.cat]) throw Error('The folder must match the asset type.');
  createAssetFolder(project, path);
  const libraryFolder = path.split('/').slice(1).join('/');
  const existing = (project.assets || []).find(f => f.name === asset.name);
  if (existing) existing.libraryFolder = libraryFolder;
  else (project.assets ||= []).push({name: asset.name, cat: asset.cat, id: asset.id, owned: false, libraryFolder});
  // Embedded scripts win over folder copies, so their library metadata lives here too.
  const script = (project.scripts || []).find(s => s.name === asset.name);
  if (script && asset.cat === 'scripts') script.libraryFolder = libraryFolder;
}

function replaceProjectAsset(project, asset, replacement) {
  const extension = name => name.split('.').at(-1).toLowerCase();
  if (asset.cat !== replacement.cat || extension(asset.name) !== extension(replacement.name)) throw Error(`Choose a .${extension(asset.name)} file to replace ${asset.name}.`);
  const result = putProjectAsset(project, {...replacement, name: asset.name, id: asset.id,
    libraryFolder: asset.libraryFolder, sourceName: asset.sourceName});
  if (asset.cat === 'scripts' && project.scripts?.some(s => s.name === asset.name)) saveEditorScript(project, asset.name, result.content);
  return result;
}

function removeProjectAsset(project, asset) {
  project.assets = (project.assets || []).filter(f => f.name !== asset.name);
  if (asset.cat === 'scripts') project.scripts = (project.scripts || []).filter(s => s.name !== asset.name);
  // Hides external copies without deleting the user's disk files. Undo restores it.
  project.hiddenAssets = [...new Set([...(project.hiddenAssets || []), asset.name])];
}
