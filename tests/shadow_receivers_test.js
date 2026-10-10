import {assert, assertAlmostEquals, assertEquals, assertStringIncludes} from 'jsr:@std/assert@1';
import {load} from './_load.js';
const A = await load();
const object = (name, shape='box', mode='static') => {
  const o=A.mkObject(name);o.components.rigidbody={...A.makeComponent('rigidbody'),shape,mode,autoFit:false};return o;
};
Deno.test('new shadows drape by default and expose the control without advanced settings',()=>{
  assert(A.makeComponent('shadow').raycast);
  assert(!A.COMPONENTS.shadow.fields.find(f=>f.key==='raycast').advanced);
});
Deno.test('shadow receivers exclude the caster actor, child colliders, triggers and rays',()=>{
  const actor=object('Player','sphere','dynamic'),model=A.mkObject('Body'),child=object('Feet'),sibling=object('Weapon');
  model.children=[child];actor.children=[model,sibling];
  const floor=object('Floor','plane'),platform=object('Platform'),trigger=object('Zone','box','trigger'),ray=object('Probe','ray');
  const bodies=[actor,child,sibling,floor,platform,trigger,ray].map(obj=>({obj,shape:obj.components.rigidbody.shape,isTrigger:obj.components.rigidbody.mode==='trigger'}));
  assertEquals(A.shadowReceiverBodies([actor,floor,platform,trigger,ray],bodies,model.id).map(b=>b.obj.id),[floor.id,platform.id]);
});
Deno.test('native drape rays follow the caster height and start at its silhouette, including high platforms',()=>{
  for(const light of [{x:0,y:1,z:0},{x:1,y:1,z:-1}])for(const y of [1,22,100]){
    const proj=A.shadowProjection({source:'rendertarget',size:{x:2,z:2}},light),caster={x:7,y,z:-3},length=12;
    const m=A.shadowRayMatrixFor(proj,caster,length);
    const start=[m[12]+proj.L.x*length/2,m[13]-proj.L.y+proj.L.y*length/2,m[14]+proj.L.z*length/2];
    for(let i=0;i<3;i++)assertAlmostEquals(start[i],[caster.x,caster.y,caster.z][i],1e-6);
  }
});
Deno.test('receiver spaces share identical sets, follow moving colliders and release rays before spaces',()=>{
  const p=A.mkProject(),s=p.scenes[0];s.objects=[];s.physics.enabled=true;
  const hero=object('Hero','sphere','dynamic');hero.components.model={...A.makeComponent('model'),file:'hero.obj'};
  const floor=object('Floor','plane'),platform=object('Platform'),moving=object('Moving','box','dynamic');
  const shadow=name=>{const o=A.mkObject(name);o.components.shadow={...A.makeComponent('shadow'),caster:'Hero'};return o;};
  s.objects=[hero,floor,platform,moving,shadow('Shadow'),shadow('OtherShadow')];
  const ir=A.resolveScene(p,s,[]);assertEquals(ir.shadowReceivers.length,1);
  assertEquals(ir.shadows[0].receivers,ir.shadows[1].receivers);
  assertEquals(ir.shadowReceivers[0].bodies.map(b=>b.body.obj.id),[floor.id,platform.id,moving.id]);
  const {main}=A.generateProject(p);
  assertStringIncludes(main,'shadow_moving_receiver.setBody(moving_body)');
  assertStringIncludes(main,'const p = platform_geom.getPosition()');
  assertStringIncludes(main,'shadow_shadowmatrix[13] = _c.y');
  const dispose=main.slice(main.indexOf('function _disposeShadows()'),main.indexOf('function _shadowPass()')>main.indexOf('function _disposeShadows()')?main.indexOf('function _shadowPass()'):main.indexOf('const ctx'));
  assert(dispose.indexOf('_releaseShadowProjectors();')<dispose.indexOf('std.gc();'));
  assert(dispose.indexOf('std.gc();')<dispose.indexOf('shadow_shadowspace.free();'));
});
