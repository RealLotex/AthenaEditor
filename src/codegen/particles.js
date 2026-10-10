function emitParticleSetup(e,ir) {
  const models=ir.models.filter(m=>m.particles);if(!models.length)return;
  e.section('Particles — one draw per emitter, fixed vertex pools, shared sprites');
  for(const fn of [createParticleState,stepParticleState,updateParticleVertices])e.w(fn.toString());
  for(const m of models){
    e.w(`const ${m.particleVN}=createParticleState(${JSON.stringify(m.particles)});`);
    e.w(`${m.particleVN}.colors=new Float32Array(${m.rd.dataVN}.vertices.colors);${m.particleVN}.positions=new Float32Array(${m.rd.dataVN}.vertices.positions);`);
    e.w(`if(${m.particleVN}.positions.length<${il(m.particles.count*24)})throw Error("Particle mesh has too few quads. Use Add / Particle effects.");`);
    // Keep the allocated capacity reusable, but submit only the chosen pool.
    // ath_render.c: material_indices.end is an inclusive corner index.
    e.w(`{const ranges=${m.rd.dataVN}.material_indices;if(ranges.length!==1)throw Error("Particle sprites need one material.");ranges[0].end=${il(m.particles.count*6-1)};${m.rd.dataVN}.material_indices=ranges;}`);
    e.w(`${m.particleVN}.positions.fill(0);for(let i=3;i<${m.particleVN}.colors.length;i+=4)${m.particleVN}.colors[i]=-1;`);
    e.w(`${m.particleVN}.billboard=new Float64Array(6);${m.particleVN}.corners=new Float64Array([-.5,-.5,.5,-.5,.5,.5,-.5,-.5,.5,.5,-.5,.5]);`);
    if(m.particles.flipbook){
      const image=m.rd.tex?.imageSize||{};
      e.w(`${m.particleVN}.uvs=new Float32Array(${m.rd.dataVN}.vertices.texcoords);${m.particleVN}.flipbook=createFlipbookUVState(${m.particleVN}.uvs.subarray(0,24),${JSON.stringify(m.particles.animation)},4,false,${il(image.width||0)},${il(image.height||0)});${m.particleVN}.frames=new Int16Array(${il(m.particles.count)});${m.particleVN}.frames.fill(-1);`);
    }
    e.w(`${m.rd.dataVN}.pipeline=Render.PL_NO_LIGHTS;`);
    e.w(`for(let i=0,n=${m.rd.dataVN}.materials.length;i<n;i++)${m.rd.dataVN}.updateMaterial(i,{diffuse:{r:0,g:0,b:0}});`);
  }
  e.w(`function _updateParticleSystems(dt){`);e.block(b=>{for(const m of models)b.w(`if(!${m.particleVN}.cinematic)stepParticleState(${m.particleVN},dt);`);});e.w(`}`);
}

function emitParticleCtx(e,ir) {
  const models=ir.models.filter(m=>m.particles);if(!models.length)return;
  e.w(`ctx.particles={${models.map(m=>JSON.stringify(m.obj.id)+':'+m.particleVN).join(',')}};`);
  e.w(`ctx.emitParticles=id=>{const state=ctx.particles[id];if(state)state.emit();return !!state;};`);
}

function emitParticleDraws(e,ir) {
  const models=ir.models.filter(m=>m.particles);if(!models.length)return;
  e.w(`Screen.setBuffer(Screen.DEPTH_BUFFER,_mainDepth,1);Screen.setParam(Screen.ALPHA_TEST_REF,0);`);
  e.w(`{const camera=Camera.save();`);
  e.block(b=>{for(const m of models){
    b.w(`if(${m.particleVN}.activeCount>0&&${m.vn}.visible!==false${ir.canDestroy?'&&!'+m.vn+'._destroyed':''}){updateParticleVertices(${m.particleVN},${m.vn}.rotation,${m.vn}.scale,camera);${m.vn}.render();}`);
  }});e.w(`}`);
  e.w(`Screen.setParam(Screen.ALPHA_TEST_REF,${il(ir.project.display?.alphaTest?.ref||0)});Screen.setBuffer(Screen.DEPTH_BUFFER,_mainDepth,0);`);
}
