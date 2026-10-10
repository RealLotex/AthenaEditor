// Small shared SVG vocabulary. Icons are decorative; their controls retain labels.
function EditorIcon({name='cube',size=20,className=''}) {
  const shapes={
    cube:<><path d="m12 2 9 5-9 5-9-5z" fill="#43b4ff"/><path d="m3 7 9 5v10l-9-5z" fill="#238fff"/><path d="m12 12 9-5v10l-9 5z" fill="#1260dc"/><path d="m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10"/></>,
    assets:<><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 4 16 4 16 0V5M4 12v6c0 4 16 4 16 0v-6"/></>,
    camera:<><rect x="3" y="6" width="12" height="12" rx="2"/><path d="m15 10 6-4v12l-6-4z"/></>,
    game:<><path d="M7 6h10c4 0 6 13 3 13-2 0-3-4-5-4H9c-2 0-3 4-5 4C1 19 3 6 7 6z"/><path d="M8 9v5m-2.5-2.5h5M16 10h.01M18 13h.01"/></>,
    sun:<><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>,
    move:<><path d="M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3m14-6 3 3-3 3"/></>,
    rotate:<><path d="M20 8a8 8 0 1 0 .4 7M20 3v5h-5"/></>,
    scale:<><rect x="6" y="6" width="12" height="12"/><path d="M3 3h6M3 3v6m18 12h-6m6 0v-6M3 3l5 5m13 13-5-5"/></>,
    select:<path d="m5 3 14 9-7 1-3 7z" fill="currentColor"/>,
    globe:<><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></>,
    grid:<><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18m6-18v18M3 9h18M3 15h18"/></>,
    focus:<path d="M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6"/>,
    search:<><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>,
    filter:<path d="M3 4h18l-7 8v7l-4 2v-9z"/>,
    plus:<path d="M12 4v16M4 12h16"/>,
    chevron:<path d="m6 9 6 6 6-6"/>,
    play:<path d="m8 4 12 8-12 8z" fill="currentColor"/>,
    stop:<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor"/>,
    export:<><path d="M12 16V3m-5 5 5-5 5 5M4 14v6h16v-6"/></>,
    save:<><path d="M4 3h13l3 3v15H4zM8 3v6h8V3M8 21v-7h8v7"/></>,
    undo:<path d="m8 4-5 5 5 5M3 9h10a6 6 0 0 1 0 12"/>,
    redo:<path d="m16 4 5 5-5 5M21 9H11a6 6 0 0 0 0 12"/>,
    settings:<><path d="m9 3 1-2h4l1 2 3 2 2 1 2 4-1 2 1 2-2 4-2 1-3 2-1 2h-4l-1-2-3-2-2-1-2-4 1-2-1-2 2-4 2-1z"/><circle cx="12" cy="12" r="3"/></>,
    wrench:<path d="M14 3a6 6 0 0 0-7 7L2 15a3 3 0 0 0 4 4l5-5a6 6 0 0 0 7-7l-4 4-3-3z"/>,
    timeline:<><path d="M3 5h18M5 2v6m5-6v6m5-6v6m5-6v6"/><rect x="4" y="11" width="7" height="4" rx="1"/><rect x="12" y="17" width="8" height="4" rx="1"/></>,
    terrain:<path d="m2 20 7-16 5 11 3-7 5 12z"/>,
    more:<><circle cx="4" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="20" cy="12" r="1"/></>,
    folder:<path d="M2 6V4h8l2 3h10l-2 13H2z"/>,
  };
  return <svg className={`a-icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{shapes[name]||shapes.cube}</svg>;
}
const PANEL_ICONS={viewport:'cube',game:'game',timeline:'timeline',events:'play',outliner:'cube',assets:'assets',inspector:'wrench',sceneSettings:'globe',environment:'sun',controls:'settings',projectSettings:'settings',terrain:'terrain',hud:'grid',uv:'grid',scripts:'folder',prefabs:'cube',problems:'settings'};
const COMPONENT_ICONS={events:'play',transform:'move',model:'cube',animator:'play',light:'sun',camera:'camera',sound:'assets',script:'folder',rigidbody:'cube',shadow:'globe'};
