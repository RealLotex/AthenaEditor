function EventRulesEditor({rules=[],scene,project,files,onChange,onEnableCollider,ownerId=''}){
  const [actionType,setActionType]=useState('playSequence'),[conditionType,setConditionType]=useState('objectEnabled');
  const objects=exportableObjects(scene.objects||[]),variables=Object.keys(scene.eventVariables||{});
  const mutate=fn=>{const next=deepClone(rules);fn(next);onChange(next);};
  const options=(list,empty='Choose…')=>[{value:'',label:tr(empty)},...list.map(o=>({value:o.id,label:o.name}))];
  const objOptions=options(objects,'Choose object…'),colliders=options(objects.filter(o=>o.components.rigidbody),'Choose collider…');
  const field=(label,node)=><Field label={tr(label)}>{node}</Field>;
  const input=(label,value,change)=><Field label={tr(label)}><TextInput value={value||''} onChange={change}/></Field>;
  const number=(label,value,change)=><Field label={tr(label)}><NumInput value={value} onChange={change} step={.1}/></Field>;
  return <div className="flow-rules">
    {rules.map((r,index)=>{
      const change=(key,value)=>mutate(all=>writePath(all[index],key,value));
      const nodeChange=(list,id,key,value)=>mutate(all=>writePath(all[index][list].find(n=>n.id===id),key,value));
      const e=r.event||{},collider=objects.find(o=>o.id===(e.objectId||ownerId));
      return <article className="flow-rule" key={r.id}>
        <div className="flow-rule-header"><Field label={tr("Rule name")}><TextInput value={r.name} onChange={v=>change('name',v)}/></Field>
          <Checkbox value={r.enabled!==false} label={tr("Enabled")} onChange={v=>change('enabled',v)}/><Checkbox value={r.once} label={tr("Once")} onChange={v=>change('once',v)}/>
          <button className="a-btn a-btn--sm" onClick={()=>mutate(all=>{const copy=deepClone(all[index]);copy.id=uid();copy.name+=' copy';for(const n of [...copy.conditions,...copy.actions])n.id=uid();all.splice(index+1,0,copy);})}>{tr("Duplicate event")}</button>
          <button className="a-btn a-btn--sm" onClick={()=>mutate(all=>all.splice(index,1))}>{tr("Delete event")}</button>
        </div>
        <div className="flow-stage"><strong>{tr("When")}</strong>
          {field('Event',<Select value={e.type} options={localizeEditorOptions(FLOW_EVENTS)} onChange={v=>change('event.type',v)}/>)}
          {e.type==='timer'&&number('Seconds',e.seconds,v=>change('event.seconds',v))}
          {e.type==='custom'&&input('Event name',e.name,v=>change('event.name',v))}
          {e.type==='cinematicFinished'&&field('Cinematic',<Select value={e.sequenceId||''} options={[{value:'',label:tr("Any cinematic")},...(scene.sequences||[]).map(s=>({value:s.id,label:s.name}))]} onChange={v=>change('event.sequenceId',v)}/>)}
          {e.type?.startsWith('on')&&<>
            {field('Collider',<Select value={e.objectId||ownerId} options={colliders} onChange={v=>change('event.objectId',v)}/>)}
            {field('Only with',<Select value={e.otherId||''} options={[{value:'',label:tr("Any collider")},...colliders.slice(1).filter(o=>o.value!==(e.objectId||ownerId))]} onChange={v=>change('event.otherId',v)}/>)}
            {collider&&(!scene.physics?.enabled||!collider.components.rigidbody.collisionEvents)&&<div className="flow-hint">{tr("Enable Generate Collision / Overlap Events on ")}{collider.name}.{onEnableCollider&&<button className="a-btn a-btn--sm" onClick={()=>onEnableCollider(collider.id)}>{tr("Enable collision / overlap events")}</button>}</div>}
          </>}
        </div>
        <div className="flow-stage"><strong>{tr("If all conditions match")}</strong>
          {!r.conditions.length&&<span className="a-dim">{tr("Always")}</span>}
          {r.conditions.map((c,i)=><div className="flow-node" key={c.id}>
            <strong>{i+1}. {tr(FLOW_CONDITIONS.find(t=>t.value===c.type)?.label)}</strong>
            {c.type==='objectEnabled'?<>{field('Object',<Select value={c.objectId} options={objOptions} onChange={v=>nodeChange('conditions',c.id,'objectId',v)}/>)}{field('Expected',<Checkbox value={c.enabled} label={tr("Behaviours enabled")} onChange={v=>nodeChange('conditions',c.id,'enabled',v)}/>)}</>:<>
              {field('Variable',<Select value={c.key} options={[{value:'',label:tr("Choose variable…")},...variables.map(value=>({value,label:value}))]} onChange={v=>nodeChange('conditions',c.id,'key',v)}/>)}
              {field('Comparison',<Select value={c.operator} options={localizeEditorOptions(FLOW_OPERATORS)} onChange={v=>nodeChange('conditions',c.id,'operator',v)}/>)}{number('Value',c.value,v=>nodeChange('conditions',c.id,'value',v))}
            </>}
            <button className="a-btn a-btn--sm" onClick={()=>mutate(all=>all[index].conditions.splice(i,1))}>{tr("Remove condition")}</button>
          </div>)}
          <div className="flow-add"><Select label={tr("Condition to add")} value={conditionType} options={localizeEditorOptions(FLOW_CONDITIONS)} onChange={setConditionType}/><button className="a-btn a-btn--sm" onClick={()=>mutate(all=>all[index].conditions.push(mkFlowCondition(conditionType)))}>{tr("+ Condition")}</button></div>
        </div>
        <div className="flow-stage"><strong>{tr("Then, in this order")}</strong>
          {r.actions.map((a,i)=><div className="flow-node" key={a.id}>
            <div className="flow-node-header"><strong>{i+1}. {tr(FLOW_ACTIONS.find(t=>t.value===a.type)?.label)}</strong>
              <button className="a-btn a-btn--sm" aria-label={tr("Move action earlier")} disabled={i===0} onClick={()=>mutate(all=>{const list=all[index].actions;[list[i-1],list[i]]=[list[i],list[i-1]];})}>↑</button>
              <button className="a-btn a-btn--sm" aria-label={tr("Move action later")} disabled={i===r.actions.length-1} onClick={()=>mutate(all=>{const list=all[index].actions;[list[i+1],list[i]]=[list[i],list[i+1]];})}>↓</button>
              <button className="a-btn a-btn--sm" onClick={()=>mutate(all=>all[index].actions.splice(i,1))}>{tr("Remove action")}</button></div>
            {['moveObject','setGameplayEnabled','setVisible','destroyObject','playAnimation'].includes(a.type)&&field('Object',<Select value={a.objectId} options={['moveObject','setVisible','playAnimation'].includes(a.type)?options(objects.filter(o=>o.components.model)):objOptions} onChange={v=>nodeChange('actions',a.id,'objectId',v)}/>)}
            {a.type==='playSequence'&&<>{field('Cinematic',<Select value={a.sequenceId} options={options(scene.sequences||[],'Choose cinematic…')} onChange={v=>nodeChange('actions',a.id,'sequenceId',v)}/>)}{field('Continue',<Checkbox value={a.wait!==false} label={tr("Wait until cinematic finishes")} onChange={v=>nodeChange('actions',a.id,'wait',v)}/>)}</>}
            {a.type==='emitParticles'&&field('Emitter',<Select value={a.objectId} options={options(objects.filter(o=>o.components.particles),'Choose particle emitter…')} onChange={v=>nodeChange('actions',a.id,'objectId',v)}/>)}
            {a.type==='wait'&&number('Seconds',a.seconds,v=>nodeChange('actions',a.id,'seconds',Math.max(0,v)))}
            {a.type==='moveObject'&&<>{field('World position',<Vec3Input value={a.to} step={.1} onChange={v=>nodeChange('actions',a.id,'to',v)}/>)}{number('Duration',a.duration,v=>nodeChange('actions',a.id,'duration',Math.max(0,v)))}{field('Curve',<Select value={a.curve} options={localizeEditorOptions(CINEMATIC_CURVES.filter(c=>c.value!=='bezier'))} onChange={v=>nodeChange('actions',a.id,'curve',v)}/>)}<span className="a-dim">{tr("Waits for the move to finish. The final position is kept.")}</span></>}
            {a.type==='setGameplayEnabled'&&field('Enabled',<Checkbox value={a.enabled} label={tr("Enable behaviours")} onChange={v=>nodeChange('actions',a.id,'enabled',v)}/>)}
            {a.type==='setVisible'&&field('Visible',<Checkbox value={a.visible} label={tr("Show model")} onChange={v=>nodeChange('actions',a.id,'visible',v)}/>)}
            {['playSound','playAnimation'].includes(a.type)&&field('Asset',<AssetSelect files={files} cat={a.type==='playSound'?'sounds':'models'} value={a.file} onChange={v=>nodeChange('actions',a.id,'file',v)}/>)}
            {a.type==='playAnimation'&&<>{field('Animation',<Select value={a.animation} options={[{value:'',label:tr("Choose animation…")},...cinematicAnimationNames(files.find(f=>f.name===a.file&&f.cat==='models')).map(value=>({value,label:value}))]} onChange={v=>nodeChange('actions',a.id,'animation',v)}/>)}{field('Loop',<Checkbox value={a.loop} onChange={v=>nodeChange('actions',a.id,'loop',v)}/>)}</>}
            {a.type==='changeScene'&&field('Scene',<Select value={a.sceneId} options={options(project?.scenes||[],'Choose scene…')} onChange={v=>nodeChange('actions',a.id,'sceneId',v)}/>)}
            {a.type==='setVariable'&&<>{field('Variable',<Select value={a.key} options={[{value:'',label:tr("Choose variable…")},...variables.map(value=>({value,label:value}))]} onChange={v=>nodeChange('actions',a.id,'key',v)}/>)}{number('Value',a.value,v=>nodeChange('actions',a.id,'value',v))}</>}
            {a.type==='emitEvent'&&input('Event name',a.name,v=>nodeChange('actions',a.id,'name',v))}
          </div>)}
          <div className="flow-add"><Select label={tr("Action to add")} value={actionType} options={localizeEditorOptions(FLOW_ACTIONS)} onChange={setActionType}/><button className="a-btn a-btn--sm" onClick={()=>mutate(all=>all[index].actions.push(mkFlowAction(actionType)))}>{tr("+ Action")}</button></div>
        </div>
      </article>;
    })}
    <button className="a-btn a-btn--primary" onClick={()=>onChange([...rules,mkEventRule()])}>{tr("+ Event")}</button>
  </div>;
}
function EventsPanel({scene,project,files,onEdit,selectedId}){
  const [source,setSource]=useState(selectedId||''),[newVariable,setNewVariable]=useState(''),[error,setError]=useState('');
  useEffect(()=>setSource(selectedId||''),[selectedId,scene.id]);
  const objects=exportableObjects(scene.objects||[]),owner=objects.find(o=>o.id===source),rules=owner?owner.components.events?.rules||[]:scene.eventRules||[];
  return <div className="a-scroll flow-panel"><div className="cin-toolbar"><strong>{tr("Events")}</strong><Field label={tr("Source")}><Select value={owner?.id||''} options={[{value:'',label:tr("Scene")},...objects.map(o=>({value:o.id,label:o.name}))]} onChange={setSource}/></Field></div>
    {owner&&<Field label={tr("At scene start")}><Checkbox label={tr("Behaviours enabled")} value={owner.components.events?.gameplayEnabled!==false} onChange={v=>onEdit(sc=>{const o=findObj(sc.objects,owner.id);o.components.events||=makeComponent('events');o.components.events.gameplayEnabled=v;})}/></Field>}
    <EventRulesEditor scene={scene} project={project} files={files} ownerId={owner?.id||''} rules={rules} onChange={value=>onEdit(sc=>{if(owner){const o=findObj(sc.objects,owner.id);o.components.events||=makeComponent('events');o.components.events.rules=value;}else sc.eventRules=value;})} onEnableCollider={id=>onEdit(sc=>{findObj(sc.objects,id).components.rigidbody.collisionEvents=true;sc.physics.enabled=true;})}/>
    <details className="a-disclosure"><summary>{tr("Scene variables")}</summary>
      {Object.entries(scene.eventVariables||{}).map(([key,value])=>{const references=eventVariableReferences(scene,key);return <div className="flow-variable" key={key}><Field label={tr("Variable name")}><TextInput value={key} onChange={name=>{try{onEdit(sc=>renameEventVariable(sc,key,name));setError('');}catch(e){setError(e.message);}}}/></Field><div className="flow-add"><Field label={tr("Value")}><NumInput value={value} onChange={v=>onEdit(sc=>sc.eventVariables[key]=v)}/></Field><button className="a-btn a-btn--sm" disabled={!!references.length} title={references.length?tr("Remove references in event rules first."):tr("Remove variable")} onClick={()=>onEdit(sc=>delete sc.eventVariables[key])}>{tr("Remove variable")}</button></div>{!!references.length&&<p className="a-dim">{tr('Used by')}: {[...new Set(references.map(r=>r.rule))].join(', ')}</p>}</div>;})}
      <div className="flow-add"><TextInput value={newVariable} placeholder={tr("Variable name")} onChange={setNewVariable}/><button className="a-btn a-btn--sm" onClick={()=>{const key=newVariable.trim();if(!key||Object.hasOwn(scene.eventVariables||{},key)||['__proto__','constructor','prototype'].includes(key)){setError('Choose a unique variable name.');return;}onEdit(sc=>{sc.eventVariables||={};sc.eventVariables[key]=0;});setNewVariable('');setError('');}}>{tr("+ Variable")}</button></div>{error&&<div className="cin-error">{error}</div>}
    </details>
    <p className="a-dim">{tr("Conditions are checked when the event arrives. A running chain ignores repeated triggers. Enable / disable behaviours controls scripts and dynamic body simulation; visibility has its own action.")}</p>
    {eventFlowProblems(scene,files,project).map((p,i)=><div className="cin-error" key={i}>{p.message}</div>)}
  </div>;
}
