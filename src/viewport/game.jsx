// Game is an isolated scene mirror. Playback never writes into project/undo data.
function hasPendingGamePreview(request,sequenceId,consumedId) {
  return !!(request?.sequenceId && request.requestId != null &&
    request.sequenceId===sequenceId && request.requestId!==consumedId);
}
// Live appearance and HUD edits do not require rebuilding meshes or playback.
function gameSceneBuildState(scene) {
  // Reconciliation may reuse branches in this draft, never in project/undo data.
  const state=cloneProjectDraft(scene);
  const visit=list=>{for(const object of list||[]){
    const light=object.components?.light;
    if(light)light.ambient=light.diffuse=light.specular=null;
    visit(object.children);
  }};
  visit(state.objects);
  state.background=state.uiElements=state.environment=null;
  if(state.skybox)state.skybox.rotation=state.skybox.brightness=state.skybox.textureFilter=null;
  return state;
}

function cinematicThreeHandle(root) {
  const handle={root};
  for(const property of ['position','rotation','scale'])Object.defineProperty(handle,property,{
    get:()=>({x:root[property].x,y:root[property].y,z:root[property].z}),
    set:v=>root[property].set(v.x,v.y,v.z),
  });
  Object.defineProperty(handle,'visible',{get:()=>root.visible,set:v=>root.visible=v});
  return handle;
}
function GameViewport({scene,files,request,onTime,onCameraChange,onSceneUpdate,onEditCamera}) {
  const panelActive=useContext(PanelActivityContext),[graphicsError,setGraphicsError]=useState('');
  const stage=useRef(null),engine=useRef(null),requestRef=useRef(request),consumedRequest=useRef(null),onTimeRef=useRef(onTime);
  requestRef.current=request;onTimeRef.current=onTime;
  const [mode,setMode]=useState(request?.sequenceId?'timeline':'scene'),[sequenceId,setSequenceId]=useState(request?.sequenceId||null),[state,setState]=useState({time:0,playing:false,paused:false}),[error,setError]=useState(''),[ready,setReady]=useState(false),[ui,setUI]=useState([]);
  const [visible,setVisible]=useState(false);
  const buildRef=useRef(null);
  const buildState=useMemo(()=>buildRef.current=reuseProjectBranches(buildRef.current,gameSceneBuildState(scene)),[scene]);
  useEffect(()=>{
    const host=stage.current,view=host.ownerDocument.defaultView;
    const observer=new view.IntersectionObserver(entries=>setVisible(entries.some(e=>e.isIntersecting)));
    observer.observe(host);return ()=>observer.disconnect();
  },[]);
  const chosen=(scene.sequences||[]).find(s=>s.id===sequenceId)||(scene.sequences||[]).find(s=>s.id===request?.sequenceId)||(scene.sequences||[])[0];
  const gameCamera=resolveSceneCamera(scene);
  useEffect(()=>{if(request?.sequenceId){setSequenceId(request.sequenceId);setMode('timeline');}},[request]);
  useEffect(()=>{
    setReady(false);setUI([]);setState({time:0,playing:false,paused:false});
    if(!visible||!panelActive||graphicsError)return;
    let disposed=false,raf=null,last=0,stamp=0;
    setReady(false);setError('');setUI([]);
    const host=stage.current,viewWindow=host.ownerDocument.defaultView;
    let renderer;try{renderer=new THREE.WebGLRenderer({antialias:true});}catch(e){setGraphicsError('The graphics view could not start. Close unused editor windows and retry.');return;}
    const lost=e=>{e.preventDefault();setGraphicsError('The graphics view was interrupted. Your project is safe; restore the view to continue.');};renderer.domElement.addEventListener('webglcontextlost',lost);
    renderer.setPixelRatio(viewportPixelRatio(640,448,viewWindow.devicePixelRatio));host.prepend(renderer.domElement);
    const world=new THREE.Scene();
    syncViewportEnvironment(world,scene);
    const objects=exportableObjects(scene.objects||[]),worlds=worldTransforms(scene.objects||[]),cam=resolveSceneCamera(scene);
    const camera=new THREE.PerspectiveCamera(verticalCameraFov(cam.fov||60,640/448),640/448,cam.near||1,cam.far||4000);
    const pos=cam.position,look=cam.target;
    camera.position.set(pos.x,pos.y,pos.z);camera.lookAt(look.x,look.y,look.z);
    let target={...look};
    const lights=objects.filter(o=>o.components.light).slice(0,4);
    const liveLights=new Map();
    for(const o of lights){
      const l=o.components.light;
      const ambient=new THREE.AmbientLight(new THREE.Color(l.ambient.r,l.ambient.g,l.ambient.b),1);world.add(ambient);
      const light=new THREE.DirectionalLight(new THREE.Color(l.diffuse.r,l.diffuse.g,l.diffuse.b),1);
      light.position.set(l.direction.x,l.direction.y,l.direction.z);world.add(light);
      liveLights.set(o.id,{ambient,diffuse:light});
    }
    const sky={three:world,renderer,camera};syncViewportSkybox(sky,scene,files);
    const handles=new Map(),roots=[],animationSources=[],audio=new Map(),pools=new Map(),mixers=new Map(),actions=new Map(),animFiles=new Map();
    async function animationsFor(name){
      if(animFiles.has(name))return animFiles.get(name);
      const file=files.find(f=>f.name===name&&f.cat==='models');if(!file?.dataUrl&&!file?.content)throw new Error('Import animation: '+name);
      const source=await loadGLTF(file.dataUrl||file.content);
      if(disposed){disposeObject(source);return [];}
      animationSources.push(source);const animations=source.userData.editorAnimations||[];animFiles.set(name,animations);return animations;
    }
    const cameraSave=()=>({position:{x:camera.position.x,y:camera.position.y,z:camera.position.z},target:{...target}});
    const cameraSet=(p,t)=>{camera.position.set(p.x,p.y,p.z);target={...t};camera.lookAt(t.x,t.y,t.z);};
    const mixedIds=cinematicMixedClips(mode==='timeline'&&chosen?[chosen]:[]),mixedData=new Map();
    const poseMixer=new CinematicPoseMixer({
      read:m=>{const pose=new Float64Array(m.bones.length*10);for(let i=0;i<m.bones.length;i++){const b=m.bones[i],o=i*10;pose.set([b.position.x,b.position.y,b.position.z,b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w,b.scale.x,b.scale.y,b.scale.z],o);}return pose;},
      write:(m,pose)=>{for(let i=0;i<m.bones.length;i++){const b=m.bones[i],o=i*10;b.position.set(pose[o],pose[o+1],pose[o+2]);b.quaternion.set(pose[o+3],pose[o+4],pose[o+5],pose[o+6]);b.scale.set(pose[o+7],pose[o+8],pose[o+9]);}},
      stop:(m,id)=>{const previous=actions.get(id)||null;previous?.stop();return previous;},resume:(m,previous)=>{previous?.reset().play();},
    });
    const adapter=createCinematicAdapter({
      particleEmitter:id=>handles.get(id)?.root.userData.particlePreview?.state,
      model:id=>handles.get(id), cameraSave,cameraRestore:s=>cameraSet(s.position,s.target),cameraSet,
      sound:c=>audio.get(c.id),particles:c=>pools.get(c.id)||[],
      animate:(m,c)=>{
        if(mixedIds.has(c.id))return {mixed:true,entry:poseMixer.enter(m,c,mixedData.get(c.id))};
        const index=cinematicAnimationNames(files.find(f=>f.cat==='models'&&f.name===c.file)).indexOf(c.animation);
        const mixer=mixers.get(c.objectId),anim=animFiles.get(c.file)?.[index];
        if(!mixer||!anim)throw new Error('Unknown animation: '+c.animation);
        const previous=actions.get(c.objectId)||null;previous?.stop();
        const action=mixer.clipAction(anim).reset();action.setLoop(c.loop?THREE.LoopRepeat:THREE.LoopOnce,c.loop?Infinity:1);action.clampWhenFinished=true;action.play();actions.set(c.objectId,action);
        return {mixer,action,previous,objectId:c.objectId};
      },
      sampleAnimation:(s,age)=>{if(s.mixed)poseMixer.sample(s.entry,age);else{s.action.time=age;s.mixer.update(0);}},
      mixAnimations:()=>poseMixer.flush(),
      restoreAnimation:(m,s)=>{if(s.mixed){poseMixer.exit(s.entry);return;}s.action.stop();if(s.previous)s.previous.reset().play();actions.set(s.objectId,s.previous);},
    });
    const sequences=mode==='timeline'&&chosen?[chosen]:[];
    const player=createCinematicPlayer(sequences,adapter);
    engine.current={player,adapter,sequenceId:chosen?.id,world,sky,liveLights};
    const resize=()=>{const area=host.parentElement,w=Math.min(area.clientWidth,area.clientHeight*640/448),h=w*448/640;if(w&&h){host.style.width=w+'px';host.style.height=h+'px';renderer.setPixelRatio(viewportPixelRatio(w,h,viewWindow.devicePixelRatio));renderer.setSize(w,h,false);}};
    const observer=new viewWindow.ResizeObserver(resize);observer.observe(host.parentElement);resize();
    last=viewWindow.performance.now();
    function frame(now){
      if(disposed)return;
      try{const dt=Math.min(.1,(now-last)/1000);if(player.playing&&!player.paused)for(const mixer of mixers.values())mixer.update(dt);player.update(dt);for(const root of roots){if(!player.paused){advanceWaterPreview(root,dt);advanceFlipbookPreview(root,dt);}advanceParticlePreview(root,player.paused?0:dt,camera);}placeViewportSkybox(sky);if(host.clientWidth&&host.clientHeight)renderer.render(world,camera);}catch(e){player.stop();setError(e.message);}
      last=now;
      if(now-stamp>80){stamp=now;const time=player.time;setState(previous=>previous.time===time&&previous.playing===player.playing&&previous.paused===player.paused?previous:{time,playing:player.playing,paused:player.paused});
        const entries=[...adapter.ui];setUI(previous=>previous.length===entries.length&&previous.every((e,i)=>e===entries[i])?previous:entries);if(mode==='timeline')onTimeRef.current?.(time);}
      raf=viewWindow.requestAnimationFrame(frame);
    }
    raf=viewWindow.requestAnimationFrame(frame);
    async function load(){
      try{
        for(const o of objects){
          if(!o.components.model)continue;
          const prepared=o.components.water?waterPreviewAssets(o.components.model,o.components.water,files):o.components.particles?particlePreviewAssets(o.components.model,o.components.particles,files,o.id):{model:o.components.model,files};const built=await buildModel(prepared.model,prepared.files);
          if(!built)throw new Error('Import model: '+o.components.model.file);
          if(disposed){disposeObject(built.object3d);return;}
          const root=built.object3d,t=worlds.get(o.id);roots.push(root);world.add(root);
          const h=cinematicThreeHandle(root);h.position=t.position;h.rotation=t.rotation;h.scale=t.scale;handles.set(o.id,h);
          if(o.components.water)configureWaterPreview(root,{...o.components.water,textureFilter:prepared.model.textureFilter},prepared.files,()=>scene.physics?.enabled?objects.filter(other=>other.id!==o.id&&!other.components.water&&!other.components.particles).map(other=>handles.get(other.id)?.root).filter(Boolean):[],prepared.model.textureFile);
          if(o.components.particles)configureParticlePreview(root,o.components.particles,files,o.components.model.textureFile,()=>objects.filter(other=>other.id!==o.id&&other.components.rigidbody&&other.components.rigidbody.mode!=='trigger').map(other=>handles.get(other.id)?.root).filter(Boolean),id=>handles.get(id)?.root.userData.particlePreview?.state);
          if(o.components.textureAnimation)configureFlipbookPreview(root,o.components.textureAnimation,files,o.components.model.textureFile);
          if(o.components.reflection)configureReflectionPreview(root,o.components.reflection,files);
          root.traverse(node=>{if(node.isSkinnedMesh&&!h.bones)h.bones=node.skeleton.bones;});
          const mixer=new THREE.AnimationMixer(root);mixers.set(o.id,mixer);
        }
        for(const o of objects){
          const settings=o.components.animator,mixer=mixers.get(o.id);if(!mixer||!settings?.file||!settings.defaultAnim)continue;
          const index=cinematicAnimationNames(files.find(f=>f.cat==='models'&&f.name===settings.file)).indexOf(settings.defaultAnim),animations=await animationsFor(settings.file);
          if(disposed)return;const animation=animations[index];if(!animation)throw new Error('Unknown default animation: '+settings.defaultAnim);
          const action=mixer.clipAction(animation);action.setLoop(settings.loop?THREE.LoopRepeat:THREE.LoopOnce,settings.loop?Infinity:1);action.clampWhenFinished=true;action.play();mixer.update(0);actions.set(o.id,action);
        }
        const problems=cinematicProblems({...scene,sequences},files);if(problems.length)throw new Error(problems[0].message);
        const clips=sequences.flatMap(s=>s.tracks.flatMap(t=>t.clips.map(c=>({type:t.type,c}))));
        for(const {type,c} of clips){
          if(type==='animation'&&mixedIds.has(c.id))mixedData.set(c.id,compileCinematicAnimation(files.find(f=>f.cat==='models'&&f.name===c.file),files.find(f=>f.cat==='models'&&f.name===objects.find(o=>o.id===c.objectId).components.model.file),c.animation));
          if(type==='animation'&&!animFiles.has(c.file)){
            await animationsFor(c.file);if(disposed)return;
          }
          if(['sfx','voice'].includes(type)){
            const file=files.find(f=>f.name===c.file&&f.cat==='sounds');
            const a=new viewWindow.Audio(file?.dataUrl||'');audio.set(c.id,{set loop(v){a.loop=v;},seek:seconds=>a.currentTime=seconds,rewind:()=>a.currentTime=0,pause:()=>a.pause(),play:()=>{a.play().catch(e=>!disposed&&setError('Audio preview: '+e.message));},audio:a});
          }
          if(type==='particles'){
            const source=handles.get(c.objectId)?.root;if(!source||source.userData.particlePreview)continue;
            const pool=Array.from({length:Math.max(1,Math.min(64,c.count||1))},()=>{const p=source.clone(true);p.visible=false;world.add(p);return cinematicThreeHandle(p);});pools.set(c.id,pool);
          }
        }
        if(disposed)return;
        setReady(true);
        const r=requestRef.current;
        if(mode==='timeline'&&hasPendingGamePreview(r,chosen?.id,consumedRequest.current)){consumedRequest.current=r.requestId;player.play(r.sequenceId);}
      }catch(e){if(!disposed)setError(e.message);}
    }
    load();
    return ()=>{disposed=true;if(raf)viewWindow.cancelAnimationFrame(raf);player.dispose();for(const s of audio.values()){s.pause();s.audio.removeAttribute('src');s.audio.load();}observer.disconnect();clearViewportSkybox(sky);for(const mixer of mixers.values())mixer.stopAllAction();for(const root of [...roots,...animationSources])disposeObject(root);renderer.domElement.removeEventListener('webglcontextlost',lost);renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();engine.current=null;};
  },[buildState,files,visible,panelActive,graphicsError,mode,chosen?.id]);
  useEffect(()=>{
    const current=engine.current;if(!current)return;
    syncViewportEnvironment(current.world,scene);syncViewportSkybox(current.sky,scene,files);
    for(const [id,lights] of current.liveLights){const light=findObj(scene.objects,id)?.components.light;if(!light)continue;
      lights.ambient.color.setRGB(light.ambient.r,light.ambient.g,light.ambient.b);
      lights.diffuse.color.setRGB(light.diffuse.r,light.diffuse.g,light.diffuse.b);
    }
  },[scene,files,ready,buildState]);
  useEffect(()=>{
    if(ready&&mode==='timeline'&&hasPendingGamePreview(request,engine.current?.sequenceId,consumedRequest.current)){try{consumedRequest.current=request.requestId;engine.current.player.play(request.sequenceId);setError('');}catch(e){setError(e.message);}}
  },[request,ready,mode]);
  const invoke=fn=>{try{fn(engine.current.player);setError('');}catch(e){setError(e.message);}};
  return <div className="cin-game">
    {onSceneUpdate && <GameCameraOptions scene={scene} onUpdate={onSceneUpdate} onEditCamera={onEditCamera}/>}
    <div className="cin-toolbar"><div className="cin-view-mode" role="group" aria-label={tr("Game view")}>
      <button className={`a-btn a-btn--sm ${mode==='scene'?'a-btn--on':'a-btn--ghost'}`} aria-pressed={mode==='scene'} onClick={()=>setMode('scene')}><EditorIcon name="camera" size={17}/>{tr("Scene camera")}</button>
      <button className={`a-btn a-btn--sm ${mode==='timeline'?'a-btn--on':'a-btn--ghost'}`} aria-pressed={mode==='timeline'} onClick={()=>setMode('timeline')}><EditorIcon name="timeline" size={17}/>{tr("Timeline")}</button>
    </div>
    {mode==='scene'?<><span>{tr("Active camera")}</span>{gameCamera.cameras.length?<Select label={tr("Active camera")} value={gameCamera.obj.id} options={gameCamera.cameras.map(o=>({value:o.id,label:o.name}))} onChange={onCameraChange}/>:<span>{tr("Scene defaults")}</span>}</>:<><Select label={tr("Preview sequence")} value={chosen?.id||''} options={(scene.sequences||[]).map(s=>({value:s.id,label:s.name}))} onChange={id=>setSequenceId(id)}/>
      <button className="a-btn a-btn--sm" disabled={!ready||!chosen} onClick={()=>invoke(p=>{if(p.playing)p.pause(!p.paused);else p.play(chosen.id);})}>{state.playing&&!state.paused?tr("Pause"):tr("Play")}</button>
      <button className="a-btn a-btn--sm" disabled={!ready} onClick={()=>invoke(p=>p.stop())}>{tr("Stop")}</button>
      <button className="a-btn a-btn--sm" disabled={!ready||!chosen} onClick={()=>invoke(p=>p.play(chosen.id))}>{tr("Restart")}</button>
      <span>{state.time.toFixed(2)}s / {chosen?sequenceDuration(chosen).toFixed(2):'0.00'}s</span>
      {state.playing&&<span>{tr("Gameplay paused")}</span>}</>}
    </div>
    {mode==='timeline'&&chosen&&<input aria-label={tr("Timeline preview position")} type="range" min="0" max={Math.max(.1,sequenceDuration(chosen))} step=".01" value={state.time} disabled={!ready} onChange={e=>invoke(p=>{if(!p.playing)p.play(chosen.id);p.seek(+e.target.value);})}/>}
    {mode==='timeline'&&!chosen&&<div className="cin-empty">{tr("Create a sequence in the Timeline panel to preview it here.")}</div>}
    {error&&<div className="cin-error">{error}</div>}
    {graphicsError&&<div className="cin-error" role="alert">{tr(graphicsError)} <button className="a-btn" onClick={()=>setGraphicsError('')}>{tr("Restore view")}</button></div>}
    <div className="cin-game-area"><div className="cin-game-stage" ref={stage}>
      <div className="cin-game-ui">
        {(scene.uiElements||[]).filter(e=>e.visible!==false).sort((a,b)=>(a.zindex||0)-(b.zindex||0)).map(e=><GameHUD key={e.id} element={e} files={files} variables={scene.eventVariables||{}}/>)}
        {['panel','portrait','dialogue','fade'].flatMap(type=>ui.filter(e=>e.type===type)).map(({type,clip:c,opacity})=><GameCinematicUI key={c.id} type={type} clip={c} opacity={opacity} files={files}/>)}
      </div>
    </div></div>
    <div className="cin-notes">{mode==='timeline'?tr("Cinematic preview"):tr("Active scene camera")} · 640 × 448{mode==='timeline'?tr(" · Gameplay suspended"):''}</div>
  </div>;
}
function gameUIStyle(c) {
  return {position:'absolute',left:`${c.x/640*100}%`,top:`${c.y/448*100}%`,width:`${c.width/640*100}%`,height:`${c.height/448*100}%`,overflow:'hidden'};
}
function GameCinematicUI({type,clip:c,opacity=1,files}) {
  const style={...gameUIStyle(c),opacity:Math.max(0,Math.min(1,opacity))};
  if(type==='fade'){const col=c.color;return <div style={{position:'absolute',inset:0,background:`rgb(${col.r},${col.g},${col.b})`,opacity:Math.max(0,Math.min(1,opacity))}}/>;}
  if(type==='panel'){const col=c.color;return <div style={{...style,background:`rgba(${col.r},${col.g},${col.b},${col.a/128})`}}/>;}
  if(type==='portrait')return <img alt={c.name} src={files.find(f=>f.cat==='textures'&&f.name===c.file)?.dataUrl} style={style}/>;
  return <div style={{...style,color:'#fff',fontSize:`${c.fontSize/640*100}cqw`,lineHeight:1.2,whiteSpace:'pre-wrap'}}>{c.speaker&&<>{c.speaker}:{'\n'}</>}{c.text}</div>;
}
function GameHUD({element,files,variables={}}) {
  const [time,setTime]=useState(0);
  useEffect(()=>{if(!element.animation?.enabled)return;const started=performance.now();let raf;const tick=()=>{setTime((performance.now()-started)/1000);raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);return ()=>cancelAnimationFrame(raf);},[element.animation]);
  const e={...element,...hudMotionValues(element,time,variables)};if(e.visible===false)return null;
  const style=gameUIStyle(e),color=c=>`rgba(${c?.r||0},${c?.g||0},${c?.b||0},${(c?.a??128)/128})`;
  if(e.type==='Image')return <img alt={e.name} style={style} src={files.find(f=>f.name===e.image&&f.cat==='textures')?.dataUrl}/>;
  return <div style={{...style,background:['Panel','Button','ProgressBar'].includes(e.type)?color(e.bgColor||e.barBgColor):undefined,color:color(e.textColor),fontSize:`${(e.fontSize||14)/640*100}cqw`,whiteSpace:'pre-wrap'}}>
    {e.type==='ProgressBar'?<div style={{width:`${(e.progress??.6)*100}%`,height:'100%',background:color(e.barColor)}}/>:e.text}
  </div>;
}
