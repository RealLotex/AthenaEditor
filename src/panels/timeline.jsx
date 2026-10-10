function TimelinePanel({scene,files,project,selectedObjectId,onEdit,onProjectEdit,onPreview,onSelectClip,playhead=0}) {
  const [sequenceId,setSequenceId]=useState(null),[selection,setLocalSelection]=useState(null),[trackType,setTrackType]=useState("dialogue"),[zoom,setZoom]=useState(90);
  const drag=useRef(null);
  const scroll=useRef(null),[snapStep,setSnapStep]=useState(.1);
  const [libraryOpen,setLibraryOpen]=useState(false),[libraryId,setLibraryId]=useState(''),[bindings,setBindings]=useState({}),[libraryError,setLibraryError]=useState('');
  const library=project?.sequenceLibrary||[],preset=library.find(s=>s.id===libraryId)||library[0];
  const sequence=(scene.sequences||[]).find(s=>s.id===sequenceId)||(scene.sequences||[])[0];
  const setSelection=value=>{setLocalSelection(value);onSelectClip?.(value?{sequenceId:sequence?.id,...value}:null);};
  const channelRows=useMemo(()=>new Map((sequence?.tracks||[]).map(t=>{
    const ends=[],rows=new Map();
    for(const c of [...t.clips].sort((a,b)=>a.start-b.start)){
      let row=t.type==='animation'?ends.findIndex(end=>end<=c.start):0;
      if(row<0)row=ends.length;ends[row]=c.start+c.duration;rows.set(c.id,row);
    }
    return [t.id,{rows,count:Math.max(1,ends.length)}];
  })),[sequence]);
  const track=sequence?.tracks.find(t=>t.id===selection?.trackId),clip=track?.clips.find(c=>c.id===selection?.clipId);
  useEffect(()=>{if(selection?.clipId){const el=[...scroll.current?.querySelectorAll('[data-clip-id]')||[]].find(el=>el.dataset.clipId===selection.clipId);el?.scrollIntoView({block:'nearest',inline:'nearest'});if(scroll.current?.ownerDocument.activeElement?.classList.contains('cin-clip'))el?.focus({preventScroll:true});}},[selection?.clipId]);
  const newClip=(type,time)=>targetNewCinematicClip(type,mkCinematicClip(type,time),scene,selectedObjectId,files);
  const update=(fn,tag=null)=>onEdit(sc=>{const s=sc.sequences.find(s=>s.id===sequence.id);if(s)fn(s);},tag);
  const changeClip=(key,value)=>update(s=>{const c=s.tracks.find(t=>t.id===track.id).clips.find(c=>c.id===clip.id);if(key==='duration')stretchCinematicClip(c,value);else c[key]=value;},`timeline:${clip.id}:${key}`);
  const objects=exportableObjects(scene.objects||[]);
  const problems=cinematicProblems(scene,files);
  const rulerDuration=Math.max(10,sequence?sequenceDuration(sequence)+2:10),rulerStep=Math.max(1,Math.ceil(rulerDuration/200));
  const previewProblems=sequence?cinematicProblems({...scene,sequences:[sequence]},files):[];
  const colliderOptions=[{value:"",label:tr("Choose collider…")},...objects.filter(o=>o.components.rigidbody).map(o=>({value:o.id,label:o.name}))];
  function startDrag(e,t,c,mode) {
    e.stopPropagation(); e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);e.currentTarget.closest('.cin-clip')?.focus({preventScroll:true});
    setSelection({trackId:t.id,clipId:c.id});drag.current={x:e.clientX,start:c.start,duration:c.duration,mode,trackId:t.id,clipId:c.id,tag:`timeline-drag:${uid()}`};
  }
  function moveDrag(e) {
    const d=drag.current;if(!d)return;
    const delta=snapCinematicTime(Math.abs(e.clientX-d.x)/zoom,e.altKey?0:snapStep)*Math.sign(e.clientX-d.x);
    update(s=>{const c=s.tracks.find(t=>t.id===d.trackId)?.clips.find(c=>c.id===d.clipId);if(!c)return;
      if(d.mode==='move')c.start=Math.max(0,d.start+delta);
      else if(d.mode==='end')stretchCinematicClip(c,Math.max(.1,d.duration+delta));
      else {const start=Math.max(0,Math.min(d.start+d.duration-.1,d.start+delta));c.start=start;stretchCinematicClip(c,d.start+d.duration-start);}
    },d.tag);
  }
  const field=(label,node)=><label className="cin-field"><span>{tr(label)}</span>{node}</label>;
  const keyboard=e=>{
    if(!clip||e.target.closest('input,textarea,select,[contenteditable=true]'))return;
    const duplicate=(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d';
    if(!duplicate&&!['Delete','Backspace','ArrowLeft','ArrowRight','Escape'].includes(e.key))return;
    e.preventDefault();e.stopPropagation();
    if(e.key==='Escape'){setSelection(null);return;}
    if(duplicate){let copy;update(s=>copy=duplicateCinematicClip(s,track.id,clip.id));setSelection({trackId:track.id,clipId:copy.id});}
    else if(['Delete','Backspace'].includes(e.key)){update(s=>{const t=s.tracks.find(t=>t.id===track.id);t.clips=t.clips.filter(c=>c.id!==clip.id);});setSelection(null);}
    else changeClip('start',Math.max(0,clip.start+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?1:e.altKey ? .01 : (snapStep||.1))));
  };
  return <div className="cin-timeline" onKeyDown={keyboard}>
    <div className="cin-toolbar">
      <strong>{tr("Timeline")}</strong>
      <Select value={sequence?.id||""} options={(scene.sequences||[]).map(s=>({value:s.id,label:s.name}))} onChange={id=>{setSequenceId(id);setSelection(null);}}/>
      <button className="a-btn a-btn--sm" onClick={()=>{const s=mkSequence();onEdit(sc=>{sc.sequences||=[];sc.sequences.push(s);});setSequenceId(s.id);}}>{tr("+ Sequence")}</button>
      {onProjectEdit&&<button className="a-btn a-btn--sm" onClick={()=>{setLibraryError('');setLibraryId(library[0]?.id||'');setBindings(library[0]?defaultSequenceBindings(library[0],scene):{});setLibraryOpen(true);}}>{tr("Sequence library…")}</button>}
      {sequence&&onProjectEdit&&<button className="a-btn a-btn--sm" onClick={()=>onProjectEdit((p,sc)=>saveSequencePreset(p,sc,sc.sequences.find(s=>s.id===sequence.id)))}>{tr("Save reusable sequence")}</button>}
      {sequence&&<><button className="a-btn a-btn--sm" disabled={previewProblems.length>0} onClick={()=>onPreview(sequence.id)}>{tr("▶ Preview in Game")}</button><button className="a-btn a-btn--sm" onClick={()=>{onEdit(sc=>sc.sequences=sc.sequences.filter(s=>s.id!==sequence.id));setSelection(null);}}>{tr("Delete sequence")}</button></>}
    </div>
    {!sequence?<div className="cin-empty">{tr("Create a sequence, choose its start event, then add channels and clips.")}</div>:<>
      <div className="cin-toolbar">
        {field("Sequence",<input value={sequence.name} onChange={e=>update(s=>s.name=e.target.value,`sequence-name:${sequence.id}`)}/>)}
        {field("Start event",<Select value={sequence.event.type} options={localizeEditorOptions(CINEMATIC_EVENTS)} onChange={type=>update(s=>{s.event.type=type;s.event.objectId="";s.event.otherId="";})}/>)}
        {sequence.event.type==='timer'&&field("Seconds",<NumInput value={sequence.event.seconds} min={0} onChange={v=>update(s=>s.event.seconds=v)}/>)}
        {sequence.event.type==='custom'&&field("Event name",<input value={sequence.event.name} onChange={e=>update(s=>s.event.name=e.target.value,`event-name:${sequence.id}`)}/>)}
        {sequence.event.type.startsWith('on')&&<>
          {field("Collider",<Select value={sequence.event.objectId} options={colliderOptions} onChange={id=>onEdit(sc=>{sc.sequences.find(s=>s.id===sequence.id).event.objectId=id;const o=findObj(sc.objects,id);if(o){o.components.rigidbody.collisionEvents=true;sc.physics.enabled=true;}})}/>)}
          {field("Only with",<Select value={sequence.event.otherId||""} options={[{value:"",label:tr("Any collider")},...colliderOptions.slice(1).filter(o=>o.value!==sequence.event.objectId)]} onChange={id=>update(s=>s.event.otherId=id)}/>)}
        </>}
      </div>
      <div className="cin-toolbar"><Select value={trackType} options={CINEMATIC_TRACKS.map(t=>({value:t.id,label:tr(t.label)}))} onChange={setTrackType}/>
        <button className="a-btn a-btn--sm" onClick={()=>update(s=>s.tracks.push(mkCinematicTrack(trackType)))}>{tr("+ Channel")}</button>
        <span>{tr("Drag clips to move · Drag edges to resize · Seconds")}</span>
        <label>{tr("Zoom ")}<input aria-label={tr("Timeline zoom")} type="range" min="5" max="180" value={zoom} onChange={e=>setZoom(+e.target.value)}/></label>
        <button className="a-btn a-btn--sm" onClick={()=>setZoom(clamp((scroll.current.clientWidth-200)/Math.max(10,sequenceDuration(sequence)+2),5,180))}>{tr("Fit sequence")}</button>
        <Select label={tr("Timeline snapping")} value={snapStep} options={[{value:0,label:tr("Free")},{value:.01,label:'0.01 s'},{value:.1,label:'0.1 s'},{value:1,label:'1 s'}]} onChange={setSnapStep}/>
      </div>
      <div className="cin-scroll" ref={scroll}><div style={{minWidth:180+Math.max(10,sequenceDuration(sequence)+2)*zoom}}>
        <div className="cin-ruler" style={{marginLeft:180}}>{Array.from({length:Math.ceil(rulerDuration/rulerStep)},(_,i)=><span key={i} style={{left:i*rulerStep*zoom}}>{i*rulerStep}s</span>)}</div>
        {sequence.tracks.map(t=><div className="cin-track" key={t.id}>
          <div className="cin-track-label"><input aria-label={tr("Channel name")} value={t.name} onChange={e=>update(s=>s.tracks.find(x=>x.id===t.id).name=e.target.value,`track-name:${t.id}`)}/>
            <button title={tr("Add clip")} onClick={()=>{const c=newClip(t.type,Math.max(0,...t.clips.map(c=>c.start+c.duration)));update(s=>s.tracks.find(x=>x.id===t.id).clips.push(c));setSelection({trackId:t.id,clipId:c.id});}}>+</button>
            <button title={tr("Delete channel")} onClick={()=>{update(s=>s.tracks=s.tracks.filter(x=>x.id!==t.id));setSelection(null);}}>×</button>
          </div>
          <div className="cin-lane" style={{minHeight:channelRows.get(t.id).count*65}} onDoubleClick={e=>{if(e.target!==e.currentTarget)return;const r=e.currentTarget.getBoundingClientRect();const c=newClip(t.type,snapCinematicTime((e.clientX-r.left)/zoom,snapStep));update(s=>s.tracks.find(x=>x.id===t.id).clips.push(c));setSelection({trackId:t.id,clipId:c.id});}}>
            <div className="cin-playhead" style={{left:playhead*zoom}}/>
            {t.clips.map(c=><div className={`cin-clip cin-clip--${t.type} ${selection?.clipId===c.id?'is-selected':''}`} key={c.id} data-clip-id={c.id} role="button" tabIndex={0} aria-label={c.name} aria-pressed={selection?.clipId===c.id} style={{top:5+channelRows.get(t.id).rows.get(c.id)*65,left:c.start*zoom,width:Math.max(12,c.duration*zoom)}} onPointerDown={e=>startDrag(e,t,c,'move')} onPointerMove={moveDrag} onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null}>
              <span className="cin-edge cin-edge--left" onPointerDown={e=>startDrag(e,t,c,'start')}/>
              <div className="cin-clip-title">{c.name} · {c.start.toFixed(1)}s</div>
              {c.keys?.map(key=><span key={key.id} className="cin-key-marker" style={{left:`${key.time/c.duration*100}%`}} title={`Keyframe ${key.time.toFixed(2)}s`}>◆</span>)}
              {t.type==='dialogue'?<textarea aria-label={tr("Dialogue clip text")} value={c.text} onPointerDown={e=>{e.stopPropagation();setSelection({trackId:t.id,clipId:c.id});}} onChange={e=>update(s=>s.tracks.find(x=>x.id===t.id).clips.find(x=>x.id===c.id).text=e.target.value,`dialogue:${c.id}`)}/>:<span>{c.duration.toFixed(1)}s</span>}
              <span className="cin-edge cin-edge--right" onPointerDown={e=>startDrag(e,t,c,'end')}/>
            </div>)}
          </div>
        </div>)}
      </div></div>
      {clip&&!onSelectClip&&<TimelineClipProperties scene={scene} files={files} selection={{sequenceId:sequence.id,...selection}} onEdit={onEdit} onSelect={value=>setSelection(value)}/> }
      <div className="cin-notes">{tr("Gameplay and physics pause during playback. Clips restore controlled properties when they end. UI coordinates: 640 × 448. Mesh clips control visibility of the selected model.")}</div>
      {problems.map((p,i)=><div className="cin-error" key={i}>{p.message}</div>)}
    </>}
    {libraryOpen&&<Modal title={tr("Reusable sequences")} onClose={()=>setLibraryOpen(false)} width={520} footer={<><button className="a-btn" onClick={()=>setLibraryOpen(false)}>{tr("Cancel")}</button><button className="a-btn a-btn--primary" disabled={!preset} onClick={()=>{try{let added;onProjectEdit((p,sc)=>added=instantiateSequencePreset(p.sequenceLibrary.find(s=>s.id===preset.id),sc,bindings));setSequenceId(added.id);setSelection(null);setLibraryOpen(false);}catch(e){setLibraryError(e.message);}}}>{tr("Add to scene")}</button></>}>
      {!preset?<Empty>{tr("Save a sequence from the timeline to reuse it.")}</Empty>:<>
        <Field label={tr("Sequence")}><Select value={preset.id} options={library.map(s=>({value:s.id,label:s.name}))} onChange={id=>{setLibraryId(id);setBindings(defaultSequenceBindings(library.find(s=>s.id===id),scene));setLibraryError('');}}/></Field>
        <p>{tr("Choose the objects this sequence will control in the current scene.")}</p>
        {(preset.bindings||[]).map(slot=><Field key={slot.id} label={slot.label}><Select value={bindings[slot.id]||''} options={[{value:'',label:tr("Choose object…")},...sequenceBindingCandidates(slot,scene).map(o=>({value:o.id,label:o.name}))]} onChange={id=>setBindings({...bindings,[slot.id]:id})}/></Field>)}
        <button className="a-btn a-btn--danger" onClick={()=>{onProjectEdit(p=>p.sequenceLibrary=p.sequenceLibrary.filter(s=>s.id!==preset.id));setLibraryId('');setBindings({});}}>{tr("Remove from library")}</button>
      </>}
      {libraryError&&<p className="a-error" role="alert">{libraryError}</p>}
    </Modal>}
  </div>;
}
function TimelineCurve({value,bezier,onCurve,onBezier}) {
  return <div className="cin-key-curve"><Field label={tr("Interpolation")}><Select value={value||'linear'} options={localizeEditorOptions(CINEMATIC_CURVES)} onChange={onCurve}/></Field>
    {value==='bezier'&&['X1','Y1','X2','Y2'].map((axis,i)=><Field key={axis} label={axis}><NumInput value={(bezier||[.25,.1,.25,1])[i]} min={i%2?undefined:0} max={i%2?undefined:1} onChange={v=>{const copy=[...(bezier||[.25,.1,.25,1])];copy[i]=v;onBezier(copy);}}/></Field>)}
  </div>;
}
function TimelineKeyframes({type,clip,onChange}) {
  const [time,setTime]=useState(clip.duration/2),[error,setError]=useState('');
  const apply=fn=>{try{const copy=deepClone(clip);fn(copy);onChange(copy.keys);setError('');}catch(e){setError(e.message);}};
  const change=(id,key,value)=>apply(c=>{const frame=c.keys.find(k=>k.id===id);if(key==='time'&&c.keys.some(k=>k.id!==id&&Math.abs(k.time-value)<1e-6))throw Error('There is already a keyframe at this time.');frame[key]=value;c.keys.sort((a,b)=>a.time-b.time);});
  return <div className="cin-keyframes">
    {!clip.keys?.length?<button className="a-btn a-btn--sm" onClick={()=>apply(c=>enableCinematicKeyframes(type,c))}>{tr("Enable keyframes")}</button>:<>
      <div className="cin-toolbar"><strong>{tr("Keyframes")}</strong><Field label={tr("New key time")}><NumInput value={time} min={0} max={clip.duration} onChange={setTime}/></Field><button className="a-btn a-btn--sm" onClick={()=>apply(c=>addCinematicKeyframe(type,c,time))}>{tr("+ Keyframe")}</button></div>
      {clip.keys.map((key,i)=><div className="cin-keyframe" key={key.id} role="group" aria-label={`Keyframe ${i+1}`}>
        <Field label={tr("Time")}><NumInput value={key.time} min={0} max={clip.duration} onChange={v=>change(key.id,'time',v)}/></Field>
        {type==='fade'?<Field label={tr("Opacity")}><NumInput value={key.value} min={0} max={128} onChange={v=>change(key.id,'value',v)}/></Field>
          :type==='transform'?<Field label={tr("Value")}><Vec3Input value={key.value} onChange={v=>change(key.id,'value',v)}/></Field>
          :<><Field label={tr("Position")}><Vec3Input value={key.value.position} onChange={v=>change(key.id,'value',{...key.value,position:v})}/></Field><Field label={tr("Target")}><Vec3Input value={key.value.target} onChange={v=>change(key.id,'value',{...key.value,target:v})}/></Field></>}
        <TimelineCurve value={key.curve} bezier={key.bezier} onCurve={v=>change(key.id,'curve',v)} onBezier={v=>change(key.id,'bezier',v)}/>
        <button className="a-btn a-btn--ghost a-btn--sm" disabled={clip.keys.length<=2} onClick={()=>apply(c=>c.keys=c.keys.filter(k=>k.id!==key.id))}>{tr("Delete keyframe")}</button>
      </div>)}
    </>}
    {error&&<p className="a-error" role="alert">{error}</p>}
  </div>;
}
function TimelineClipProperties({scene,files,selection,onEdit,onSelect}) {
  const [open,setOpen]=useState({});
  const sequence=(scene.sequences||[]).find(s=>s.id===selection?.sequenceId),track=sequence?.tracks.find(t=>t.id===selection?.trackId),clip=track?.clips.find(c=>c.id===selection?.clipId);
  if(!clip)return <Empty>{tr("Select a clip in Timeline.")}</Empty>;
  const objects=exportableObjects(scene.objects||[]),objectOptions=[{value:'',label:tr("Choose object…")},...objects.filter(o=>o.components.model).map(o=>({value:o.id,label:o.name}))];
  const update=(fn,tag=null)=>onEdit(sc=>{const s=sc.sequences.find(s=>s.id===sequence.id);if(s)fn(s);},tag);
  const setSelection=value=>onSelect?.(value?{sequenceId:sequence.id,...value}:null);
  const changeClip=(key,value)=>update(s=>{const c=s.tracks.find(t=>t.id===track.id)?.clips.find(c=>c.id===clip.id);if(!c)return;if(key==='duration')stretchCinematicClip(c,value);else c[key]=value;},'timeline:'+clip.id+':'+key);
  const field=(label,node)=><Field label={tr(label)}>{node}</Field>,text=key=><TextInput value={clip[key]||''} onChange={v=>changeClip(key,v)}/>,number=(key,min=0)=><NumInput value={clip[key]} min={min} step={.1} onChange={v=>changeClip(key,v)}/>,vector=key=><Vec3Input value={clip[key]} onChange={v=>changeClip(key,v)} step={.1}/>;
  const section=(title,children)=><Section title={tr(title)} open={open[title]!==false} onToggle={()=>setOpen(o=>({...o,[title]:o[title]===false}))}>{children}</Section>;
  return <><PanelHeader title={clip.name||'Clip'}/><div className="a-scroll cin-properties">
    {section('Timing',<>
        {field("Clip",text('name'))}{field("Start",number('start'))}{field("Duration",number('duration',.1))}
</>)}
    {['transform','animation','mesh','particles'].includes(track.type)&&section('Target',<>        {['transform','animation','mesh','particles'].includes(track.type)&&field("Object",<Select value={clip.objectId} options={objectOptions} onChange={v=>changeClip('objectId',v)}/>)}
</>)}
    {['portrait','sfx','voice','animation'].includes(track.type)&&section('Asset',<>        {['portrait','sfx','voice','animation'].includes(track.type)&&field("Asset",<AssetSelect value={clip.file} files={files} cat={track.type==='portrait'?'textures':track.type==='animation'?'models':'sounds'} onChange={v=>changeClip('file',v)}/>)}
</>)}
    {['dialogue','portrait','panel'].includes(track.type)&&section('Layout and appearance',<>        {['dialogue','portrait','panel'].includes(track.type)&&<>{field("X",number('x'))}{field("Y",number('y'))}{field("Width",number('width',1))}{field("Height",number('height',1))}{field('Fade in',number('fadeIn'))}{field('Fade out',number('fadeOut'))}</>}
        {track.type==='dialogue'&&<>{field("Speaker",text('speaker'))}{field("Font size",number('fontSize',1))}</>}
        {track.type==='panel'&&field("Color",<Color255Input value={clip.color} alpha onChange={v=>changeClip('color',v)}/>)}
</>)}
    {['transform','camera','fade'].includes(track.type)&&section('Motion',<>        {track.type==='transform'&&<>{field("Component property",<Select value={clip.property} options={['position','rotation','scale'].map(value=>({value,label:value==='rotation'?'Rotation (radians)':value}))} onChange={v=>changeClip('property',v)}/>)}{!clip.keys?.length&&<>{field("From",vector('from'))}{field("To",vector('to'))}</>}</>}
        {track.type==='camera'&&<>{field('Transition in',number('transitionIn'))}{!clip.keys?.length&&<>{field("From position",vector('position'))}{field("From target",vector('target'))}{field("To position",vector('toPosition'))}{field("To target",vector('toTarget'))}</>}</>}
        {track.type==='fade'&&<>{field('Color',<Color255Input value={clip.color} onChange={v=>changeClip('color',v)}/>)}{!clip.keys?.length&&<>{field('From opacity',<NumInput value={clip.fromAlpha} min={0} max={128} onChange={v=>changeClip('fromAlpha',v)}/>)}{field('To opacity',<NumInput value={clip.toAlpha} min={0} max={128} onChange={v=>changeClip('toAlpha',v)}/>)}</>}</>}
        {['transform','camera','fade'].includes(track.type)&&<>
          {!clip.keys?.length&&<TimelineCurve value={clip.curve} bezier={clip.bezier} onCurve={v=>changeClip('curve',v)} onBezier={v=>changeClip('bezier',v)}/>}
          <TimelineKeyframes key={clip.id} type={track.type} clip={clip} onChange={keys=>changeClip('keys',keys)}/>
        </>}
</>)}
    {['animation','sfx','voice','mesh','particles'].includes(track.type)&&section('Playback',<>        {track.type==='animation'&&field("Animation",<Select value={clip.animation} options={[{value:'',label:tr("Choose animation…")},...cinematicAnimationNames(files.find(f=>f.cat==='models'&&f.name===clip.file)).map(value=>({value,label:value}))]} onChange={v=>changeClip('animation',v)}/>)}
        {track.type==='animation'&&<>{field('Weight',<NumInput value={clip.weight??1} min={0} max={1} step={.05} onChange={v=>changeClip('weight',v)}/>)}{field('Blend in',number('blendIn'))}{field('Blend out',number('blendOut'))}{field('Blend curve',<Select value={clip.curve||'linear'} options={localizeEditorOptions(CINEMATIC_CURVES.filter(c=>c.value!=='bezier'))} onChange={v=>changeClip('curve',v)}/>)}</>}
        {['animation','sfx','voice'].includes(track.type)&&field("Loop",<Checkbox value={clip.loop} onChange={v=>changeClip('loop',v)}/>)}
        {track.type==='mesh'&&field("Visible",<Checkbox value={clip.visible} onChange={v=>changeClip('visible',v)}/>)}
        {track.type==='particles'&&(objects.find(o=>o.id===clip.objectId)?.components.particles?<span>{tr("Plays this emitter during the clip. Adjust its effect in Properties.")}</span>:<>{field("Instances (1–64)",<NumInput value={clip.count} min={1} max={64} integer onChange={v=>changeClip('count',v)}/>)}{field("Speed",number('speed'))}{field("Size",number('size',.001))}<span>{tr("Uses the selected Model as a pooled particle mesh.")}</span></>)}</>)}
    <div className="a-toolbar">        <button className="a-btn a-btn--sm" onClick={()=>{let copy;update(s=>copy=duplicateCinematicClip(s,track.id,clip.id));setSelection({trackId:track.id,clipId:copy.id});}}>{tr("Duplicate clip")}</button>
        <button className="a-btn a-btn--sm" onClick={()=>{update(s=>{const t=s.tracks.find(t=>t.id===track.id);t.clips=t.clips.filter(c=>c.id!==clip.id);});setSelection(null);}}>{tr("Delete clip")}</button>
</div>
  </div></>;
}
