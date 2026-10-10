import {load,shutdown} from '../tests/_load.js';
try{
  const A=await load(),path=Deno.args[0]||'C:/Users/Marcos/Documents/my_game.atheditor',project=A.migrateProject(JSON.parse(await Deno.readTextFile(path))),files=A.editorAssets(project);
  const scenes=project.scenes.map(scene=>{
    const ir=A.resolveScene(project,scene,files);
    return {name:scene.name,physics:scene.physics.enabled,sky:scene.skybox,models:ir.models.map(m=>{const asset=files.find(f=>f.name===m.rd.model.file),mesh=asset?.content&&/\.obj$/i.test(asset.name)?A.readMeshOBJ(asset.content):null;return {name:m.obj.name,file:m.rd.model.file,triangles:mesh?.faces.length,model:m.rd.model,water:!!m.rd.water,shadow:m.obj.components.shadow,rigidbody:m.obj.components.rigidbody,world:m.world};}),fogModels:ir.fogModels.length,shadowPasses:ir.shadowPasses.length,shadowReceivers:ir.shadows.map(s=>({name:s.obj?.name,grid:s.shadow?.grid,receivers:s.receivers?.bodies?.length})),vram:A.sceneVRAMBudget(scene,files,project),diagnostics:ir.diagnostics};
  });
  const summary={path,display:project.display,assets:files.length,scenes};
  await Deno.writeTextFile('.verification/project-performance-summary.json',JSON.stringify(summary,null,2));
  console.log(JSON.stringify({assets:files.length,scenes:scenes.map(s=>({name:s.name,models:s.models.map(m=>({name:m.name,triangles:m.triangles,accurateClipping:m.model.accurate_clipping,water:m.water,shadow:!!m.shadow,shape:m.rigidbody?.shape})),fogModels:s.fogModels,shadowPasses:s.shadowPasses,shadowReceivers:s.shadowReceivers,totalVRAM:s.vram.total,diagnostics:s.diagnostics}))},null,2));
}finally{await shutdown();}
