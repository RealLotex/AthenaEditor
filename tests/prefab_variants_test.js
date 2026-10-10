import {assert,assertEquals,assertThrows} from 'jsr:@std/assert@1';
import {load} from './_load.js';
const A=await load();

function doors(){
  const p=A.mkProject(),s=p.scenes[0],source=A.mkObject('Door');
  source.components.model={...A.makeComponent('model'),file:'door.obj',textureFile:'base.png'};
  source.components.sound={...A.makeComponent('sound'),file:'open.wav'};
  const handle=A.mkObject('Handle');handle.components.model={...A.makeComponent('model'),file:'handle.obj'};source.children.push(handle);s.objects.push(source);
  const base=A.savePrefab(p,source),candidate=A.placePrefab(base,s.objects);s.objects.push(candidate);
  candidate.components.model.textureFile='red.png';
  const variant=A.createPrefabVariant(p,candidate,'Red Door');
  const instance=A.placePrefab(variant,s.objects);s.objects.push(instance);
  return {p,s,source,base,variant,candidate,instance};
}

Deno.test('base changes reach variants and instances while preserving model, sound and local placement overrides',()=>{
  const {p,s,source,variant,instance}=doors();
  instance.components.sound.file='quiet.wav';instance.components.transform.position.x=12;
  source.components.model.file='new-door.obj';source.components.sound.file='new-open.wav';
  source.children[0].components.model.file='new-handle.obj';source.children.push(A.mkObject('Lock'));
  A.savePrefab(p,source);
  assertEquals(variant.components.model.file,'new-door.obj');assertEquals(variant.components.model.textureFile,'red.png');
  assertEquals(variant.components.sound.file,'new-open.wav');
  assertEquals(instance.components.model.file,'new-door.obj');assertEquals(instance.components.sound.file,'quiet.wav');assertEquals(instance.components.transform.position.x,12);
  assertEquals(instance.children.length,2);assertEquals(instance.children[0].components.model.file,'new-handle.obj');
  const ids=A.allObjects(s.objects).map(o=>o.id);assertEquals(new Set(ids).size,ids.length);
});

Deno.test('a variant of a variant inherits changes in order across scenes and survives serialization',()=>{
  const {p,s,source,variant}=doors();
  const second=A.placePrefab(variant,s.objects);second.components.sound.file='rusty.wav';
  const nested=A.createPrefabVariant(p,second,'Rusty Red Door');
  const level=A.mkScene('Next');p.scenes.push(level);const instance=A.placePrefab(nested,[]);level.objects.push(instance);
  source.components.model.file='better.obj';A.savePrefab(p,source);
  assertEquals(instance.components.model.file,'better.obj');assertEquals(instance.components.model.textureFile,'red.png');assertEquals(instance.components.sound.file,'rusty.wav');
  const restored=A.migrateProject(JSON.parse(JSON.stringify(p)));
  const original=A.findObj(restored.scenes[0].objects,source.id);original.components.model.file='final.obj';A.savePrefab(restored,original);
  assertEquals(restored.scenes[1].objects[0].components.model.file,'final.obj');
  assertEquals(A.prefabInheritanceProblems(restored),[]);
});

Deno.test('removing a base materializes its variants without losing their instances or descendants',()=>{
  const {p,base,variant,instance}=doors();A.deletePrefab(p,base._pid);
  assertEquals(variant._variantParentId,undefined);assertEquals(instance._prefabId,variant._pid);assertEquals(instance.components.model.textureFile,'red.png');
  assertEquals(A.prefabInheritanceProblems(p),[]);
  const variantInstance=A.findObj(p.scenes[0].objects,instance.id);variantInstance.components.sound.file='changed.wav';A.savePrefab(p,variantInstance);
  assertEquals(p.prefabs.find(f=>f._pid===variant._pid).components.sound.file,'changed.wav');
});

Deno.test('variant rebase merges individual event conditions and remaps object references per instance',()=>{
  const {p,s,source,base}=doors();
  source.components.events={rules:[{id:'r',event:{type:'onTriggerEnter',objectId:source.id},conditions:[{id:'c',objectId:source.children[0].id,value:true}],actions:[{id:'a',type:'setActive',objectId:source.children[0].id,value:true}]}]};
  A.savePrefab(p,source);
  const candidate=A.placePrefab(p.prefabs.find(f=>f._pid===base._pid),s.objects);s.objects.push(candidate);
  candidate.components.events.rules[0].conditions[0].value=false;
  const variant=A.createPrefabVariant(p,candidate),instance=A.placePrefab(variant,s.objects);s.objects.push(instance);
  const rule=instance.components.events.rules[0];assertEquals(rule.event.objectId,instance.id);assertEquals(rule.actions[0].objectId,instance.children[0].id);
  source.components.events.rules[0].actions[0].value=false;A.savePrefab(p,source);
  assertEquals(instance.components.events.rules[0].conditions[0].value,false);assertEquals(instance.components.events.rules[0].actions[0].value,false);
  assertEquals(instance.components.events.rules[0].actions[0].objectId,instance.children[0].id);
});

Deno.test('circular or missing bases fail before propagating changes',()=>{
  const {p,base,variant,instance}=doors();base._variantParentId=variant._pid;
  const before=JSON.stringify(instance);
  assertThrows(()=>A.propagatePrefabChanges(p,base._pid),Error,'circular');assertEquals(JSON.stringify(instance),before);
  delete base._variantParentId;variant._variantParentId='missing';assert(A.prefabInheritanceProblems(p)[0].includes('missing base'));
});

Deno.test('saving a renamed instance retains its prefab name and variant identity',()=>{
  const {p,variant,instance}=doors();instance.name='Door in hallway';instance.components.sound.file='hallway.wav';
  const saved=A.savePrefab(p,instance);assertEquals(saved.name,'Red Door');assertEquals(saved._pid,variant._pid);assertEquals(saved._variantParentId,variant._variantParentId);
});
