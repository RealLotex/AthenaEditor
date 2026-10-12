function emitParticleSetup(e,ir) {
  const models=ir.models.filter(m=>m.particles).sort((a,b)=>(a.particles.sortingFudge||0)-(b.particles.sortingFudge||0));if(!models.length)return;
  e.section('Particles — one draw per emitter, fixed vertex pools, shared sprites');
  for(const fn of [particleCurveSample,particleSpawnSample,initializeParticleModules,notifyParticleSubEmitters,stepParticleModules,updateMeshParticleVertices,updateParticleUVs,createParticleState,stepParticleState,updateParticleVertices])e.w(fn.toString());
  for(const m of models){
    e.w(`const ${m.particleVN}=createParticleState(${JSON.stringify(m.particles)});`);
    e.w(`${m.particleVN}.colors=new Float32Array(${m.rd.dataVN}.vertices.colors);${m.particleVN}.positions=new Float32Array(${m.rd.dataVN}.vertices.positions);`);
    e.w(`if(${m.particleVN}.positions.length<${il(m.particles.count*(m.particles.renderMode==='mesh'?12:24))})throw Error("Particle mesh has too few quads. Use Add / Particle effects.");`);
    // Keep the allocated capacity reusable, but submit only the chosen pool.
    // ath_render.c: material_indices.end is an inclusive corner index.
    e.w(`{const ranges=${m.rd.dataVN}.material_indices;if(ranges.length!==1)throw Error("Particle sprites need one material.");ranges[0].end=${m.particles.renderMode==='mesh'?m.particleVN+'.positions.length/4-1':il(m.particles.count*6-1)};${m.rd.dataVN}.material_indices=ranges;}`);
    if(m.particles.renderMode==='mesh')e.w(`${m.particleVN}.meshTemplate=${m.particleVN}.positions.slice(0,${m.particleVN}.positions.length/${il(m.particles.count)});`);
    e.w(`${m.particleVN}.positions.fill(0);for(let i=3;i<${m.particleVN}.colors.length;i+=4)${m.particleVN}.colors[i]=-1;`);
    e.w(`${m.particleVN}.billboard=new Float64Array(6);${m.particleVN}.corners=new Float64Array([-.5,-.5,.5,-.5,.5,.5,-.5,-.5,.5,.5,-.5,.5]);`);
    if(m.particles.flipbook){
      const image=m.rd.tex?.imageSize||{};
      e.w(`${m.particleVN}.uvs=new Float32Array(${m.rd.dataVN}.vertices.texcoords);${m.particleVN}.particleUVSpan=${m.particles.renderMode==='mesh'?m.particleVN+'.uvs.length/'+il(m.particles.count):'24'};${m.particleVN}.flipbook=createFlipbookUVState(${m.particleVN}.uvs.subarray(0,${m.particleVN}.particleUVSpan),${JSON.stringify(m.particles.animation)},4,false,${il(image.width||0)},${il(image.height||0)});${m.particleVN}.frames=new Int16Array(${il(m.particles.count)});${m.particleVN}.frames.fill(-1);`);
    }
    e.w(`${m.rd.dataVN}.pipeline=Render.PL_NO_LIGHTS;`);
    e.w(`for(let i=0,n=${m.rd.dataVN}.materials.length;i<n;i++)${m.rd.dataVN}.updateMaterial(i,{diffuse:{r:0,g:0,b:0}});`);
  }
  e.w(`let _particleSubEmitBudget=128;function _updateParticleSystems(dt){_particleSubEmitBudget=128;`);e.block(b=>{for(const m of models)b.w(`if(!${m.particleVN}.cinematic){${m.particleVN}.emitter.position=${m.vn}.position;${m.particleVN}.emitter.rotation=${m.vn}.rotation;${m.particleVN}.emitter.scale=${m.vn}.scale;stepParticleState(${m.particleVN},dt);}`);});e.w(`}`);
}

function emitParticleCtx(e,ir) {
  const models=ir.models.filter(m=>m.particles).sort((a,b)=>(a.particles.sortingFudge||0)-(b.particles.sortingFudge||0));if(!models.length)return;
  e.w(`ctx.particles={${models.map(m=>JSON.stringify(m.obj.id)+':'+m.particleVN).join(',')}};`);
  e.w(`ctx.emitParticles=id=>{const state=ctx.particles[id];if(state)state.emit();return !!state;};`);
  for(const m of models){
    e.w(`${m.particleVN}.onSubEmit=(sub,point)=>{if(_particleSubEmitBudget--<=0)return;const target=ctx.particles[sub.objectId];if(target)target.emitAt(point);};`);
    if(m.particles.collisionType==='world'&&ir.physics.enabled){
      e.w(`{const ray=ODE.GeomRay(null,1);ray.raySetClosestHit(true);${m.particleVN}.collide=(from,to)=>{const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z,length=Math.hypot(dx,dy,dz);if(length<.00001)return null;ray.raySetLength(length+.002);ray.raySet(from.x,from.y,from.z,dx/length,dy/length,dz/length);let hit=null,distance=Infinity;`);
      for(const body of ir.physics.bodies.filter(b=>b.obj.id!==m.obj.id&&b.mode!=='trigger'&&b.shape!=='ray'))e.w(`if(!${body.geomVN}._destroyed){const contacts=ODE.geomCollide(ray,${body.geomVN});for(const contact of contacts){const p=contact.position,d=Math.hypot(p[0]-from.x,p[1]-from.y,p[2]-from.z);if(d<distance){distance=d;const n=contact.normal,sign=dx*n[0]+dy*n[1]+dz*n[2]>0?-1:1;hit={point:{x:p[0]+n[0]*sign*.001,y:p[1]+n[1]*sign*.001,z:p[2]+n[2]*sign*.001},normal:{x:n[0]*sign,y:n[1]*sign,z:n[2]*sign}};}}}`);
      e.w(`return hit;};}`);
    }
  }

}

function emitParticleDraws(e,ir,beforeWater=false) {
  const models=ir.models.filter(m=>m.particles&&((m.particles.sortingFudge<0)===beforeWater)).sort((a,b)=>(a.particles.sortingFudge||0)-(b.particles.sortingFudge||0));if(!models.length)return;
  e.w(`Screen.setBuffer(Screen.DEPTH_BUFFER,_mainDepth,1);Screen.setParam(Screen.ALPHA_TEST_REF,0);`);
  e.w(`{const camera=Camera.save();`);
  e.block(b=>{for(const m of models){
    b.w(`if(${m.particleVN}.activeCount>0&&${m.vn}.visible!==false${ir.canDestroy?'&&!'+m.vn+'._destroyed':''}){updateParticleVertices(${m.particleVN},${m.vn}.rotation,${m.vn}.scale,camera);${m.vn}.render();}`);
  }});e.w(`}`);
  e.w(`Screen.setParam(Screen.ALPHA_TEST_REF,${il(ir.project.display?.alphaTest?.ref||0)});Screen.setBuffer(Screen.DEPTH_BUFFER,_mainDepth,0);`);
}
