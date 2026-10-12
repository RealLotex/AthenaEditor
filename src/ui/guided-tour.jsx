function GuidedTourPicker({onStart,onClose}) {
  return <Modal title="Tours guiados" onClose={onClose} width={760}>
    <p>Elegí una práctica. Cada recorrido abre su propia plantilla .atheditor y conserva tu proyecto actual.</p>
    <div className="a-tour-library">{EDITOR_TOURS.map((tour,i)=><button key={tour.id} className="a-tour-choice" onClick={()=>onStart(tour.id)}><strong>{i+1}. {tour.title}</strong><span>{tour.description}</span><small>{tour.steps.length} pasos · {tour.id}.atheditor</small></button>)}</div>
  </Modal>;
}
function GuidedTour({tour,index,busy,error,completed,onNext,onPrevious,onClose,onSave,onFinish,onContinue}) {
  const step=tour.steps[index],card=useRef(null),[bounds,setBounds]=useState(null),[position,setPosition]=useState({left:24,top:90});
  useEffect(()=>{
    if(!step)return;
    let frame=0,highlight=null,disposed=false;
    const update=()=>{
      frame=0;if(disposed)return;
      const panel=document.querySelector(`[data-tour-panel="${step.panel}"]`),visible=node=>node&&node.getBoundingClientRect().width&&node.getBoundingClientRect().height;
      const addClip=step.operation?.type==='clip'?document.querySelector(`[data-tour-add-clip="${step.operation.track}"]`):null;
      let target=visible(addClip)?addClip:step.target?[...document.querySelectorAll(step.target)].find(visible):null;
      if(!target||!visible(target))target=visible(panel)?panel:document.querySelector(`[data-dock-tab="${step.panel}"]`);
      if(target!==highlight){highlight?.classList.remove('a-tour-target');highlight=target;highlight?.classList.add('a-tour-target');if(target&&step.target)target.scrollIntoView({block:'nearest',inline:'nearest'});}
      const r=target?.getBoundingClientRect();
      const next=r?{left:Math.max(0,r.left-3),top:Math.max(0,r.top-3),width:Math.min(innerWidth,r.width+6),height:Math.min(innerHeight,r.height+6)}:null;
      setBounds(prev=>JSON.stringify(prev)===JSON.stringify(next)?prev:next);
      const width=card.current?.offsetWidth||360,height=card.current?.offsetHeight||240;
      let left=r?(r.right+16+width<innerWidth?r.right+16:r.left-width-16):24;
      if(left<12)left=r?Math.max(12,r.left):24;
      let top=r?r.top:90;
      if(r&&left<r.right&&left+width>r.left)top=r.bottom+16;
      const place={left:clamp(left,12,Math.max(12,innerWidth-width-12)),top:clamp(top,12,Math.max(12,innerHeight-height-12))};
      setPosition(prev=>prev.left===place.left&&prev.top===place.top?prev:place);
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
    const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','aria-expanded']});
    window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,true);schedule();
    return ()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();highlight?.classList.remove('a-tour-target');window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);};
  },[tour.id,index,step]);
  if(!step)return <div className="a-tour-card a-tour-finish" role="dialog" aria-label="Tour completo">
    <div className="a-tour-card__header"><span>Tour completo</span><button className="a-btn a-btn--icon a-btn--ghost" aria-label="Cerrar guía y continuar editando" onClick={onContinue}>×</button></div><h2>Completaste {tour.title}</h2><p>La práctica queda abierta para que sigas editándola. Podés guardarla como un proyecto .atheditor.</p>
    <button className="a-btn a-btn--primary" onClick={onContinue}>Continuar editando</button><button className="a-btn" onClick={onSave}>Guardar práctica .atheditor</button><button className="a-btn a-btn--ghost" onClick={onFinish}>Volver a mi proyecto anterior</button>
  </div>;
  return <>
    {bounds&&<div className="a-tour-highlight" aria-hidden="true" style={bounds}/>}
    <aside className="a-tour-card" ref={card} style={position} role="region" aria-label="Guía paso a paso">
      <div className="a-tour-card__header"><span>{tour.title} · {index+1}/{tour.steps.length}</span><button className="a-btn a-btn--icon a-btn--ghost" aria-label="Cerrar tour y volver al proyecto" onClick={onClose}>×</button></div>
      <h2>{step.title}</h2><p>{step.text}</p>
      {completed&&<p className="a-tour-done" role="status">✓ Acción completada</p>}
      {busy&&<p role="status">Preparando el paso…</p>}{error&&<p className="a-error" role="alert">{error}</p>}
      <div className="a-tour-card__footer"><button className="a-btn" disabled={busy||index===0} onClick={onPrevious}>← Anterior</button><button className="a-btn a-btn--primary" disabled={busy} onClick={onNext}>Siguiente →</button></div>
    </aside>
  </>;
}
