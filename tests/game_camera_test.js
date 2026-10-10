import { assert, assertEquals, assertAlmostEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { load } from './_load.js';
const A=await load();

Deno.test('Game and export share the selected camera, including its parent world transform',()=>{
  const p=A.mkProject(),s=p.scenes[0],first=A.mkObject('First'),parent=A.mkObject('Rig'),active=A.mkObject('Shot');
  first.components.camera=A.makeComponent('camera');active.components.camera=A.makeComponent('camera');
  parent.components.transform.position.x=5;parent.components.transform.scale.x=2;active.components.transform.position.x=2;
  first.components.script={file:'Inactive.js'};active.components.script={file:'Active.js'};p.scripts=[{name:'Inactive.js',content:'export function init(ctx){}'},{name:'Active.js',content:'export function init(ctx){}'}];
  active.components.camera.target={x:3,y:1,z:0};active.components.camera.fov=75;parent.children=[active];s.objects=[first,parent];s.activeCameraId=active.id;
  const camera=A.resolveSceneCamera(s);assertEquals(camera.obj.id,active.id);assertAlmostEquals(camera.position.x,9);assertEquals(camera.target,{x:3,y:1,z:0});
  const ir=A.resolveScene(p,s);assertEquals(ir.camera.obj.id,active.id);
  assertEquals(ir.scripts.bindings.map(b=>b.obj.id),[active.id]);
  const main=A.generateProject(p).main;assertStringIncludes(main,'Camera.position(9, 0, 0)');assertStringIncludes(main,'Camera.target(3, 1, 0)');
  s.objects.reverse();assertEquals(A.resolveSceneCamera(s).obj.id,active.id);
});
Deno.test('legacy scenes choose the first exported camera and invalid explicit selections fail validation',()=>{
  const p=A.mkProject(),s=p.scenes[0],excluded=A.mkObject('Excluded'),first=A.mkObject('First');
  excluded.components.camera=A.makeComponent('camera');excluded.exportEnabled=false;first.components.camera=A.makeComponent('camera');s.objects=[excluded,first];
  assertEquals(A.resolveSceneCamera(s).obj.id,first.id);s.activeCameraId=excluded.id;
  assert(A.validateScene(s,[],p).some(d=>d.level==='error'&&d.component==='camera'&&d.message.includes('active camera')));
});
Deno.test('Game converts horizontal FOV without changing the horizontal framing',()=>{
  for(const aspect of [640/448,1,16/9]){
    const vertical=A.verticalCameraFov(60,aspect);
    assertAlmostEquals(Math.tan(vertical*Math.PI/360)*aspect,Math.tan(Math.PI/6));
  }
});
