function resolveCinematics(ir, names, files=[]) {
  const sequences=ir.scene.sequences||[];
  const resources=new Map(), pools=[];
  for(const s of sequences)for(const t of s.tracks)for(const c of t.clips){
    if(t.type==='animation'&&c.file&&!ir.anims.some(a=>a.file===c.file))ir.anims.push({file:c.file,vn:names.take('cinematic_anims','anims')});
    if(['sfx','voice'].includes(t.type)&&c.file){
      let sound=ir.sounds.find(s=>s.sound.file===c.file&&s.eventOnly);
      if(!sound){sound={obj:{id:c.id},vn:names.take('cinematic_sound','sound'),sound:{file:c.file},eventOnly:true};ir.sounds.push(sound);}
      resources.set(c.id,sound.vn);
    }
    if(t.type==='portrait'&&c.file){
      // Reuse mesh textures as well: no duplicate uploads to PS2 VRAM.
      let tex=ir.textures.find(t=>t.file===c.file);
      if(!tex){tex={file:c.file,filter:'LINEAR',vn:names.take('cinematic_image','image')};ir.textures.push(tex);}
      resources.set(c.id,tex.vn);
    }
    if(t.type==='particles'){
      const model=ir.models.find(m=>m.obj.id===c.objectId);
      if(model&&!model.particles)pools.push({clip:c,model,vn:names.take('cinematic_particles','particles')});
    }
  }
  const mixedIds=cinematicMixedClips(sequences),mixedData={};
  for(const s of sequences)for(const t of s.tracks)if(t.type==='animation')for(const c of t.clips)if(mixedIds.has(c.id)){
    try{mixedData[c.id]=compileCinematicAnimation(files.find(f=>f.cat==='models'&&f.name===c.file),files.find(f=>f.cat==='models'&&f.name===ir.models.find(m=>m.obj.id===c.objectId)?.obj.components.model.file),c.animation);}
    catch(error){ir.diagnostics.push({level:'error',component:'timeline',message:`Timeline "${s.name}": ${error.message}`});}
  }
  const methods={};
  for(const [role,type] of [['player',CinematicPlayer],['adapter',CinematicAdapter],['events',SceneEvents]]){
    methods[role]={};for(const method of Object.getOwnPropertyNames(type.prototype))if(method!=='constructor')methods[role][method]=names.take(`_cinematic_${role}_${method}`,'timeline_method');
  }
  return {sequences,resources,pools,methods,mixedData,enabled:sequences.length>0};
}
// Emit shared methods against scene-owned state; compile boundaries in the
// editor so the console only visits due boundaries and currently active clips.
function emitCinematicMethods(e,ir,role,type,state){
  for(const [method,vn] of Object.entries(ir.cinematics.methods[role])){
    const source=type.prototype[method].toString();
    e.w(...(`function ${vn}${source.slice(source.indexOf('('))}`.replace(/\bthis\b/g,state)).split('\n'));
    e.w(`${state}.${method} = ${vn};`);
  }
}
function emitSceneEventsRuntime(e,ir){
  const events=new SceneEvents(ir.cinematics.sequences||[],null);
  e.w(`const _sceneEventsState = {player:${ir.cinematics.enabled?'ctx.cinematics':'null'},listeners:${JSON.stringify(events.listeners)},handlers:Object.create(null),timers:${JSON.stringify(events.timers)},elapsed:0,numberBuffer:new Float64Array(1)};`);
  emitCinematicMethods(e,ir,'events',SceneEvents,'_sceneEventsState');
  e.w(`for(let i=0;i<_sceneEventsState.timers.length;i++)_sceneEventsState.timers[i].at=_sceneEventsState.number(_sceneEventsState.timers[i].at);`);
  e.w(`function createSceneEvents() { return _sceneEventsState; }`);
  e.w(`ctx.events = createSceneEvents([]);`);
}
function emitCinematics(e,ir) {
  const cine=ir.cinematics;if(!cine?.enabled)return;
  e.section('Cinematics — resources, timeline and scene events');
  e.w(`const _cinematicModels = {${ir.models.map(m=>`"${jsStr(m.obj.id)}":${m.vn}`).join(',')}};`);
  e.w(`const _cinematicSounds = {${[...cine.resources].filter(([id])=>cine.sequences.some(s=>s.tracks.some(t=>['sfx','voice'].includes(t.type)&&t.clips.some(c=>c.id===id)))).map(([id,vn])=>`"${jsStr(id)}":${vn}`).join(',')}};`);
  e.w(`const _cinematicImages = {${[...cine.resources].filter(([id])=>cine.sequences.some(s=>s.tracks.some(t=>t.type==='portrait'&&t.clips.some(c=>c.id===id)))).map(([id,vn])=>`"${jsStr(id)}":${vn}`).join(',')}};`);
  e.w(`const _cinematicAnims = {${ir.anims.map(a=>`"${jsStr(a.file)}":${a.vn}`).join(',')}};`);
  e.w(`const _cinematicDefaults = {${ir.models.map(m=>`"${jsStr(m.obj.id)}":{file:"${jsStr(m.obj.components.animator?.file||'')}",clip:"${jsStr(m.anim?.clip||'')}",loop:${!!m.anim?.loop}}`).join(',')}};`);
  for(const p of cine.pools){
    e.w(`const ${p.vn} = [];`);
    e.w(`for (let i=0; i<${il(clamp(p.clip.count||1,1,64))}; i++) ${p.vn}.push({visible:false,position:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}});`);
  }
  e.w(`const _cinematicPools = {${cine.pools.map(p=>`"${jsStr(p.clip.id)}":${p.vn}`).join(',')}};`);
  const dialogueLines={};for(const s of cine.sequences)for(const t of s.tracks)if(t.type==='dialogue')for(const c of t.clips)dialogueLines[c.id]=cinematicDialogueLines(c);
  e.w(`const _cinematicDialogueLines = ${JSON.stringify(dialogueLines)};`);
  e.w(`const _cinematicFont = ${ir.project.display?.frameCounter!==false||ir.project.display?.debugHUD ? 'font' : ir.ui.some(u=>['Text','Button'].includes(u.el.type)&&(!u.el.fontFile||u.el.fontFile==='default'))?'_hudDefaultFont':'new Font("default")'};`);
  e.w(...cinematicLerp.toString().split('\n'));
  for(const helper of [cinematicCurve,cinematicValueLerp,cinematicKeyframeValue,cinematicClipOpacity])e.w(...helper.toString().split('\n'));
  const hasMix=Object.keys(cine.mixedData).length>0;
  if(hasMix)emitCinematicPoseMixing(e,ir);
  e.w(`const _cinematicAdapter = {platform:{`);
  e.block(b=>{
    // The shipped rewind binding dereferences the global current stream, not
    // its receiver. Select the stream with play() before rewinding it.
    b.w(`model: id=>_cinematicModels[id], sound:c=>{const s=_cinematicSounds[c.id];let reset=false;return {set loop(value){s.loop=value;},rewind:()=>reset=true,pause:()=>s.pause(),play:()=>{s.pause();s.play();if(reset){s.rewind();reset=false;}}};}, particles:c=>_cinematicPools[c.id] || [],`);
    b.w(`particleEmitter:id=>ctx.particles?.[id],cameraSave:()=>Camera.save(), cameraRestore:s=>{Camera.target(s.target.x,s.target.y,s.target.z);Camera.position(s.position.x,s.position.y,s.position.z);},`);
    b.w(`capture:()=>{const sounds=[${ir.sounds.filter(s=>!s.eventOnly).map(s=>s.vn).join(',')}].filter(s=>s.playing());if(sounds.length)sounds[0].pause();return {camera:Camera.save(),sounds};},`);
    b.w(`restore:s=>{Camera.target(s.camera.target.x,s.camera.target.y,s.camera.target.z);Camera.position(s.camera.position.x,s.camera.position.y,s.camera.position.z);for(const sound of s.sounds)sound.play();},`);
    b.w(`cameraSet:(p,t)=>{Camera.target(t.x,t.y,t.z);Camera.position(p.x,p.y,p.z);},`);
    b.w(`animate:(m,c)=>{${hasMix?'if(_cinematicMixData[c.id])return {mixed:true,entry:_cinematicPoseMixer.enter(m,c,_cinematicMixData[c.id])};':''}const anim=_cinematicAnims[c.file][c.animation]; if(!anim)throw new Error("Unknown animation: "+c.animation); m.playAnim(anim,c.loop);return _cinematicDefaults[c.objectId];},`);
    // Native playAnim converts 0 to a null current animation pointer (ath_render.c).
    // Returning to the configured idle clip avoids leaving a cutscene loop running.
    b.w(`restoreAnimation:(m,s)=>{${hasMix?'if(s.mixed){_cinematicPoseMixer.exit(s.entry);return;}':''}if(m&&!m._destroyed)m.playAnim(s.clip?_cinematicAnims[s.file][s.clip]:0,s.loop);},`);
    if(hasMix)b.w(`sampleAnimation:(s,age)=>{if(s.mixed)_cinematicPoseMixer.sample(s.entry,age);},mixAnimations:()=>_cinematicPoseMixer.flush(),`);
    b.w(`complete:id=>ctx.events.emit("cinematicFinished", {sequenceId:id}),`);
  });e.w(`},ui:[],sounds:[]};`);
  emitCinematicMethods(e,ir,'adapter',CinematicAdapter,'_cinematicAdapter');
  const compiled=new CinematicPlayer(cine.sequences,null).compiled;
  e.w(`const _cinematicPlayerState = {adapter:_cinematicAdapter,compiled:${JSON.stringify(compiled)},active:[],numberBuffer:new Float64Array(1),current:null,time:0,cursor:0,snapshot:null,playing:false,paused:false,id:null};`);
  emitCinematicMethods(e,ir,'player',CinematicPlayer,'_cinematicPlayerState');
  e.w(`for(let i=0;i<_cinematicPlayerState.compiled.length;i++){const s=_cinematicPlayerState.compiled[i];s.duration=_cinematicPlayerState.number(s.duration);for(let j=0;j<s.boundaries.length;j++)s.boundaries[j].time=_cinematicPlayerState.number(s.boundaries[j].time);}`);
  e.w(`ctx.cinematics = _cinematicPlayerState;`);
  emitSceneEventsRuntime(e,ir);
  e.w(`let _cinematicExitPending = false;`);
  e.w(`function _cinematicDrawParticles() {`);
  e.block(b=>{
    // Borrow the source draw handle, restore it after the pass, and share its
    // uploaded mesh. Extra native RenderObjects own unsafe Matrix4 wrappers
    // in the bundled release; plain pooled transforms avoid that reload crash.
    for(const p of cine.pools){
      b.w(`{const model=${p.model.vn};if(!model._destroyed){const position=model.position,scale=model.scale;for(let i=0;i<${p.vn}.length;i++){const p=${p.vn}[i];if(p.visible){model.position=p.position;model.scale=p.scale;model.render();}}model.position=position;model.scale=scale;}}`);
    }
  });e.w(`}`);
  e.w(`function _cinematicDrawUI() {`);
  e.block(b=>{
    // Layers are stable independent of the order in which clips entered.
    b.w(`for(const type of ["panel","portrait","dialogue","fade"])for(let i=0;i<_cinematicAdapter.ui.length;i++){const entry=_cinematicAdapter.ui[i];`);
    b.block(x=>{
      x.w(`if(entry.type!==type)continue;const c=entry.clip;`);
      x.w(`const sx=canvas.width/640,sy=canvas.height/448;`);
      x.w(`const opacity=Math.max(0,Math.min(1,entry.opacity));`);
      x.w(`if(type==="panel"){const col=c.color;Draw.rect(c.x*sx,c.y*sy,c.width*sx,c.height*sy,Color.new(col.r,col.g,col.b,Math.round(col.a*opacity)));}`);
      x.w(`if(type==="portrait"){const image=_cinematicImages[c.id];if(image){const color=image.color;image.color=Color.new(128,128,128,Math.round(128*opacity));image.width=c.width*sx;image.height=c.height*sy;image.draw(c.x*sx,c.y*sy);image.color=color;}}`);
      x.w(`if(type==="fade"){const col=c.color;Draw.rect(0,0,canvas.width,canvas.height,Color.new(col.r,col.g,col.b,Math.round(128*opacity)));}`);
      x.w(`if(type==="dialogue"){_cinematicFont.scale=(c.fontSize/14)*0.6*sy;_cinematicFont.color=Color.new(255,255,255,Math.round(128*opacity));`);
      x.w(`const lines=_cinematicDialogueLines[c.id];for(let j=0;j<lines.length;j++)if(lines[j])_cinematicFont.print(c.x*sx,(c.y+j*c.fontSize*1.2)*sy,lines[j]);}`);
    });b.w(`}`);
  });e.w(`}`);
}

function emitCinematicPoseMixing(e,ir){
  for(const fn of [cinematicAnimationWeight,cinematicQuaternionLerp,sampleCinematicPose,CinematicPoseMixer])e.w(...fn.toString().split('\n'));
  e.w(`const _cinematicMixData=${JSON.stringify(ir.cinematics.mixedData)};`);
  // RenderObject.bones contains reference-backed Vector4 values (ath_render.c
  // 1259–1275). Change their components, retain the wrappers, and suspend the
  // native single-clip player while skin_math.c builds matrices from the pose.
  e.w(`const _cinematicPoseMixer=new CinematicPoseMixer({`);
  e.block(b=>{
    b.w(`read:m=>{const pose=new Float64Array(m.bones.length*10);for(let i=0;i<m.bones.length;i++){const b=m.bones[i],p=b.position,r=b.rotation,s=b.scale,o=i*10;pose[o]=p.x;pose[o+1]=p.y;pose[o+2]=p.z;pose[o+3]=r.x;pose[o+4]=r.y;pose[o+5]=r.z;pose[o+6]=r.w;pose[o+7]=s.x;pose[o+8]=s.y;pose[o+9]=s.z;}return pose;},`);
    b.w(`write:(m,pose)=>{if(m._destroyed)return;for(let i=0;i<m.bones.length;i++){const b=m.bones[i],p=b.position,r=b.rotation,s=b.scale,o=i*10;p.x=pose[o];p.y=pose[o+1];p.z=pose[o+2];r.x=pose[o+3];r.y=pose[o+4];r.z=pose[o+5];r.w=pose[o+6];s.x=pose[o+7];s.y=pose[o+8];s.z=pose[o+9];}},`);
    b.w(`stop:(m,id)=>{m.playAnim(0,false);return _cinematicDefaults[id];},resume:(m,s)=>{if(!m._destroyed)m.playAnim(s.clip?_cinematicAnims[s.file][s.clip]:0,s.loop);}`);
  });e.w(`});`);
}
