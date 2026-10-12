// Keystrokes stay local. One project edit on blur preserves focus, undo grouping
// and the final text without traversing embedded assets on every input event.
function DialogueInput({value,onChange,onSelect,label=tr('Dialogue clip text')}) {
  const [draft,setDraft]=useState(value||''),latest=useRef(value||''),commit=useRef(onChange),dirty=useRef(false),area=useRef(null);
  commit.current=onChange;
  useEffect(()=>{if(!dirty.current){latest.current=value||'';setDraft(latest.current);}},[value]);
  const flush=()=>{if(!dirty.current)return;dirty.current=false;commit.current(latest.current);};
  useEffect(()=>()=>flush(),[]);
  const lines=draft.split('\n').length;
  return <div className="cin-dialogue-editor">
    <textarea ref={area} aria-label={label} value={draft} rows={Math.min(6,Math.max(2,lines))} onPointerDown={e=>{e.stopPropagation();onSelect?.();}}
      onChange={e=>{latest.current=e.target.value;dirty.current=true;setDraft(latest.current);}} onBlur={flush}
      onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();flush();}}}/>
    <span className="cin-dialogue-lines" aria-live="polite">{lines>1?`${lines} ${tr('lines')}`:tr('1 line')}{dirty.current?' · '+tr('Editing'):''}</span>
  </div>;
}
