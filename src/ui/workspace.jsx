// Stable portal hosts keep panel state and WebGL canvases alive while docking.
function PanelSlot({ host, active = true }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const slot = ref.current;
    slot.appendChild(host);
    return () => {
      if (host.parentNode === slot) slot.removeChild(host);
    };
  }, [host]);
  return (
    <div
      ref={ref}
      className="a-panel-slot"
      style={{ display: active ? "flex" : "none" }}
    />
  );
}

// Keep the selected tab in view and expose overflow with two explicit controls.
function DockTabCarousel({active,children}) {
  const strip=useRef(null),[edges,setEdges]=useState({overflow:false,left:false,right:false});
  const measure=()=>{const el=strip.current;if(!el)return;const next={overflow:el.scrollWidth>el.parentElement.clientWidth+1,left:el.scrollLeft>1,right:el.scrollLeft+el.clientWidth<el.scrollWidth-1};setEdges(previous=>Object.keys(next).every(key=>previous[key]===next[key])?previous:next);};
  useLayoutEffect(()=>{const el=strip.current;const observer=new ResizeObserver(measure);observer.observe(el);measure();return()=>observer.disconnect();},[]);
  useLayoutEffect(()=>{const el=strip.current,tab=el.querySelector(`[data-dock-tab="${active}"]`);if(tab){const a=el.getBoundingClientRect(),b=tab.getBoundingClientRect();if(b.left<a.left)el.scrollLeft-=a.left-b.left;else if(b.right>a.right)el.scrollLeft+=b.right-a.right;}measure();},[active]);
  useLayoutEffect(measure,[children]);
  const step=direction=>{const el=strip.current;el.scrollBy({left:direction*Math.max(70,el.clientWidth*.75),behavior:'auto'});measure();};
  return <div className="a-tab-carousel">
    {edges.overflow&&<button className="a-tab-carousel__arrow" aria-label={tr("Previous panels")} disabled={!edges.left} onClick={()=>step(-1)}>‹</button>}
    <div ref={strip} role="tablist" aria-label={tr("Docked panels")} onScroll={measure}>{children}</div>
    {edges.overflow&&<button className="a-tab-carousel__arrow" aria-label={tr("Next panels")} disabled={!edges.right} onClick={()=>step(1)}>›</button>}
  </div>;
}

function DockWorkspace({ layout, onChange, panels, onActive, projectName, onKeyDown, onCopy, onPaste, onWindowFocus, onError, resetWindowsKey, uiAnimations=false }) {
  const root = useRef(null),
    hosts = useRef(null),
    gesture = useRef(null),
    current = useRef(layout);
  current.current = layout;
  useDetailsPopovers(root, ".a-dock-options, .a-panel-picker");
  const parking = useRef(null), windows = useRef(new Map()), callbacks = useRef({});
  callbacks.current = { onKeyDown, onCopy, onPaste, onWindowFocus, onError,uiAnimations };
  const [external, setExternal] = useState([]);
  const releaseWindow = (id) => {
    const frame = windows.current.get(id);
    if (!frame) return;
    windows.current.delete(id);
    parking.current?.appendChild(hosts.current[id]);
    notifyPanelWindow(hosts.current[id]);
    frame.dispose();
    setExternal([...windows.current.keys()]);
  };
  const detachWindow = (id) => {
    const existing = windows.current.get(id);
    if (existing && !existing.window.closed) { existing.window.focus(); return; }
    try {
      const frame = openPanelWindow(window, document, id, `${projectName} — ${tr(DOCK_PANELS[id])} — AthEditor`, {
        onClose: () => releaseWindow(id),
        onKey: (event) => callbacks.current.onKeyDown?.(event),
        onCopy: (event) => callbacks.current.onCopy?.(event),
        onPaste: (event) => callbacks.current.onPaste?.(event),
        onFocus: () => {
          const view = windows.current.get(id)?.window;
          if (view) callbacks.current.onWindowFocus?.(view);
          onActive?.(id);
        },
        onError: (error) => callbacks.current.onError?.(error),
      });
      windows.current.set(id, frame);
      frame.window.document.body.classList.add('a-app');
      for(const name of ['click','change'])frame.window.document.body.addEventListener(name,event=>{if(callbacks.current.uiAnimations)animateEditorAction(event);});
      frame.slot.appendChild(hosts.current[id]);
      notifyPanelWindow(hosts.current[id]);
      setExternal([...windows.current.keys()]);
      callbacks.current.onWindowFocus?.(frame.window);
    } catch (error) { callbacks.current.onError?.(error); }
  };
  useEffect(() => {
    for (const id of [...windows.current.keys()]) releaseWindow(id);
  }, [resetWindowsKey]);
  useEffect(() => {
    for (const [id, frame] of windows.current) {
      frame.window.document.title = `${projectName} — ${tr(DOCK_PANELS[id])} — AthEditor`;
      frame.window.document.documentElement.setAttribute("data-theme", document.documentElement.getAttribute("data-theme"));
      frame.window.document.body.classList.toggle('a-app--motion',uiAnimations);
    }
  });
  useEffect(() => {
    const close = () => { for (const frame of windows.current.values()) frame.dispose(); windows.current.clear(); };
    window.addEventListener("pagehide", close);
    return () => { window.removeEventListener("pagehide", close); close(); };
  }, []);
  if (!hosts.current) {
    hosts.current = Object.fromEntries(
      Object.keys(DOCK_PANELS).map((id) => {
        const host = document.createElement("div");
        host.className = "a-panel-surface";
        host.dataset.panel = id;
        return [id, host];
      }),
    );
  }
  const [bounds, setBounds] = useState({ width: 1200, height: 800 }),
    [drag, setDrag] = useState(null);
  useLayoutEffect(() => {
    const resize = () => {
      const r = root.current.getBoundingClientRect();
      setBounds({ width: Math.max(1, r.width), height: Math.max(1, r.height) });
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  const change = (fn) => onChange(fn(current.current));
  const activate = (id) => {
    if (windows.current.has(id)) { windows.current.get(id).window.focus(); onActive?.(id); return; }
    change((l) => activateDockPanel(l, id));
    onActive?.(id);
  };
  const targetAt = (x, y, floating = false) => {
    for (
      const group of root.current.querySelectorAll(".a-dock-group[data-group]")
    ) {
      const r = group.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const header = group.querySelector(".a-dock-tabs"),
        hr = header.getBoundingClientRect();
      let edge = "center", index;
      if (y <= hr.bottom) {
        const tabs = [...header.querySelectorAll("[data-dock-tab]")];
        index = tabs.findIndex((tab) =>
          x <
            tab.getBoundingClientRect().left +
              tab.getBoundingClientRect().width / 2
        );
        if (index < 0) index = tabs.length;
      } else {
        const dx = (x - r.left) / r.width, dy = (y - r.top) / r.height;
        const threshold = floating ? .08 : .22;
        if (dx < threshold) edge = "left";
        else if (dx > 1 - threshold) edge = "right";
        else if (dy < threshold) edge = "top";
        else if (dy > 1 - threshold) edge = "bottom";
        else if (floating) continue;
      }
      const base = root.current.getBoundingClientRect();
      return {
        id: group.dataset.group,
        edge,
        index,
        x: r.left - base.left,
        y: r.top - base.top,
        width: r.width,
        height: r.height,
      };
    }
    return null;
  };
  const start = (e, panel, type = "panel", floating = null) => {
    if (windows.current.has(panel)) { e.preventDefault(); activate(panel); return; }
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = root.current.getBoundingClientRect();
    const box = e.currentTarget.closest(".a-floating-panel,.a-dock-group")
      .getBoundingClientRect();
    gesture.current = {
      panel,
      type,
      floating,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - box.left,
      offsetY: e.clientY - box.top,
      width: Math.min(620, box.width),
      height: Math.min(480, box.height),
      rootX: r.left,
      rootY: r.top,
    };
    activate(panel);
  };
  const move = (e) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.startX, dy = e.clientY - g.startY;
    if (g.type === "resize") {
      const next = deepClone(current.current),
        floating = next.floating.find((f) => f.panel === g.panel);
      if (floating) {
        Object.assign(
          floating,
          fitFloatingPanel({
            ...floating,
            width: g.floating.width + dx,
            height: g.floating.height + dy,
          }, bounds),
        );
      }
      next.preset = "Custom";
      onChange(next);
      return;
    }
    if (!drag && Math.hypot(dx, dy) < 6) return;
    setDrag({
      panel: g.panel,
      target: e.altKey ? null : targetAt(e.clientX, e.clientY, !!g.floating),
      x: e.clientX - g.rootX + 14,
      y: e.clientY - g.rootY + 14,
      rect: g.floating
        ? fitFloatingPanel({
          ...g.floating,
          x: e.clientX - g.rootX - g.offsetX,
          y: e.clientY - g.rootY - g.offsetY,
        }, bounds)
        : null,
    });
  };
  const end = (e) => {
    const g = gesture.current;
    if (!g) return;
    if (drag && g.type === "panel") {
      const target = e.altKey
        ? null
        : targetAt(e.clientX, e.clientY, !!g.floating);
      const rect = drag.rect || fitFloatingPanel({
        x: e.clientX - g.rootX - Math.min(g.offsetX, 160),
        y: e.clientY - g.rootY - 16,
        width: g.floating?.width || Math.max(320, g.width),
        height: g.floating?.height || Math.max(240, g.height),
      }, bounds);
      change((l) =>
        moveDockPanel(l, g.panel, target?.id, target?.edge, {
          ...rect,
          index: target?.index,
        })
      );
    }
    gesture.current = null;
    setDrag(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };
  const cancel = () => {
    gesture.current = null;
    setDrag(null);
  };
  const events = {
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: cancel,
  };
  const options = (panel, group, floating = false) => (
    <details
      className="a-dock-options"
      onToggle={(e) => {
        const menu = e.currentTarget.querySelector('[role="menu"]');
        if (!e.currentTarget.open || !menu) return;
        const r = e.currentTarget.getBoundingClientRect(),
          frame = root.current.getBoundingClientRect();
        const below = frame.bottom - r.bottom, above = r.top - frame.top;
        const up = below < menu.scrollHeight && above > below;
        e.currentTarget.dataset.up = String(up);
        menu.style.maxHeight = `${Math.max(60, (up ? above : below) - 8)}px`;
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <summary
        aria-label={`Panel options for ${DOCK_PANELS[panel]}`}
        title={tr("Panel options")}
      >
        ⋯
      </summary>
      <div
        role="menu"
        onClick={(e) => {
          e.currentTarget.closest("details").open = false;
        }}
      >
        {external.includes(panel)
          ? <button onClick={() => releaseWindow(panel)}>{tr("Return to editor")}</button>
          : <button onClick={() => detachWindow(panel)}>{tr("Open in window")}</button>}
        {floating
          ? (
            <button
              onClick={() => { releaseWindow(panel); change((l) => redockPanel(l, panel)); }}
            >
              {tr("Dock")}</button>
          )
          : (
            <button onClick={() => { releaseWindow(panel); change((l) => moveDockPanel(l, panel)); }}>
              {tr("Undock")}</button>
          )}
        {[
          ["left", "Dock left"],
          ["right", "Dock right"],
          ["top", "Dock above"],
          ["bottom", "Dock below"],
        ].map(([edge, label]) => (
          <button
            key={edge}
            onClick={() =>
              { releaseWindow(panel); change((l) =>
                moveDockPanel(l, panel, l.tree?.id || "work", edge)
              ); }}
          >
            {tr(label)}
          </button>
        ))}
        {!floating && (
          <button
            onClick={() =>
              change((l) =>
                updateDockNode(l, group.id, { collapsed: !group.collapsed })
              )}
          >
            {group.collapsed ? tr("Expand") : tr("Collapse")}
          </button>
        )}
        <button onClick={() => { releaseWindow(panel); change((l) => closeDockPanel(l, panel)); }}>
          {tr("Close panel")}</button>
      </div>
    </details>
  );
  const node = (n) => {
    if (!n) {
      return (
        <div className="a-dock-empty">
          {tr("Open a panel from View → Panels, or choose a layout preset.")}</div>
      );
    }
    if (n.type === "split") {
      const aCollapsed = n.children[0].type === "group" &&
        n.children[0].collapsed;
      const bCollapsed = n.children[1].type === "group" &&
        n.children[1].collapsed;
      const fixed = n.axis === "column" && (aCollapsed || bCollapsed);
      return (
        <div className={`a-dock-split a-dock-split--${n.axis}`} key={n.id}>
          <div
            className="a-dock-branch"
            style={fixed
              ? { flex: aCollapsed ? "0 0 40px" : "1" }
              : { flex: `${n.ratio} 1 0` }}
          >
            {node(n.children[0])}
          </div>
          <SplitHandle
            node={n}
            root={root}
            onChange={(ratio) =>
              change((l) => updateDockNode(l, n.id, { ratio }))}
          />
          <div
            className="a-dock-branch"
            style={fixed
              ? { flex: bCollapsed ? "0 0 40px" : "1" }
              : { flex: `${1 - n.ratio} 1 0` }}
          >
            {node(n.children[1])}
          </div>
        </div>
      );
    }
    return (
      <section
        className={`a-dock-group${
          n.collapsed ? " a-dock-group--collapsed" : ""
        }`}
        key={n.id}
        data-group={n.id}
        aria-label={`${DOCK_PANELS[n.active]} panel group`}
        onPointerDown={() => onActive?.(n.active)}
      >
        <div className="a-dock-tabs">
          <DockTabCarousel active={n.active}>
            {n.tabs.map((id) => (
              <button
                key={id}
                data-dock-tab={id}
                role="tab"
                aria-selected={n.active === id && !n.collapsed}
                aria-label={id==='sceneSettings'?tr("World"):undefined}
                tabIndex={n.active === id ? 0 : -1}
                className={`a-dock-tab${
                  n.active === id ? " a-dock-tab--active" : ""
                }`}
                title={`${tr("Drag to dock")} ${tr(DOCK_PANELS[id])}; ${tr("Alt-drag to float")}`}
                onClick={() => activate(id)}
                onKeyDown={(e) => {
                  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
                  e.preventDefault(); e.stopPropagation();
                  const at = n.tabs.indexOf(id);
                  const next = e.key === "Home" ? 0 : e.key === "End" ? n.tabs.length - 1 :
                    (at + (e.key === "ArrowRight" ? 1 : -1) + n.tabs.length) % n.tabs.length;
                  const target = n.tabs[next];
                  activate(target);
                  e.currentTarget.parentElement.querySelector(`[data-dock-tab="${target}"]`)?.focus();
                }}
                onPointerDown={(e) => start(e, id)}
                {...events}
              >
                <EditorIcon name={PANEL_ICONS[id]} size={20}/>{tr(DOCK_PANELS[id])}
              </button>
            ))}
          </DockTabCarousel>
          {n.tabs.some(id=>['viewport','game','timeline','terrain','hud','uv','scripts'].includes(id))&&<details className="a-panel-picker">
            <summary aria-label={tr("Open editor panel")} title={tr("Open editor panel")}><EditorIcon name="plus" size={19}/></summary>
            <div className="a-panel-picker__pop">
              {Object.entries(DOCK_PANELS).map(([id,label])=><button key={id} className="a-menu__item" onClick={e=>{e.currentTarget.closest('details').open=false;activate(id);}}><EditorIcon name={PANEL_ICONS[id]} size={18}/>{tr(label)}</button>)}
            </div>
          </details>}
          {options(n.active, n)}
        </div>
        {n.tabs.map((id) => (
          external.includes(id)
            ? (id === n.active && !n.collapsed && <div key={id} className="a-dock-empty">
              {tr(DOCK_PANELS[id])} {tr("is open in another window.")}<button className="a-btn" onClick={() => releaseWindow(id)}>{tr("Return to editor")}</button>
            </div>)
            : <PanelSlot key={id} host={hosts.current[id]} active={id === n.active && !n.collapsed} />
        ))}
      </section>
    );
  };
  return (
    <div className="a-docking-workspace" ref={root}>
      {node(layout.tree)}
      {layout.floating.map((floating, index) => {
        const f = drag?.panel === floating.panel && drag.rect
          ? drag.rect
          : fitFloatingPanel(floating, bounds);
        return (
          <section
            className="a-floating-panel"
            role="region"
            aria-label={`Floating ${tr(DOCK_PANELS[f.panel])}`}
            key={f.panel}
            style={{
              left: f.x,
              top: f.y,
              width: f.width,
              height: f.height,
              zIndex: 40 + index,
              opacity: drag?.panel === f.panel ? .75 : 1,
            }}
            onPointerDown={() => {
              activate(f.panel);
            }}
          >
            <div
              className="a-floating-title"
              onPointerDown={(e) => start(e, f.panel, "panel", f)}
              {...events}
            >
              <span>{tr(DOCK_PANELS[f.panel])}</span>
              <span className="a-grow" />
              {options(f.panel, null, true)}
              <button
                aria-label={`Dock ${tr(DOCK_PANELS[f.panel])}`}
                title={tr("Dock")}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => { releaseWindow(f.panel); change((l) => redockPanel(l, f.panel)); }}
              >
                ↙
              </button>
              <button
                aria-label={`Close ${tr(DOCK_PANELS[f.panel])} panel`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => { releaseWindow(f.panel); change((l) => closeDockPanel(l, f.panel)); }}
              >
                ×
              </button>
            </div>
            {external.includes(f.panel)
              ? <div className="a-dock-empty"><button className="a-btn" onClick={() => releaseWindow(f.panel)}>{tr("Return to editor")}</button></div>
              : <PanelSlot host={hosts.current[f.panel]} />}
            <div
              className="a-floating-resize"
              role="separator"
              aria-label={`Resize ${tr(DOCK_PANELS[f.panel])}`}
              onPointerDown={(e) => start(e, f.panel, "resize", f)}
              {...events}
            />
          </section>
        );
      })}
      <div style={{ display: "none" }} ref={parking}>
        {layout.hidden.map((id) => (
          !external.includes(id) && <PanelSlot key={id} host={hosts.current[id]} />
        ))}
      </div>
      {Object.entries(panels).map(([id, panel]) => {
        const active=external.includes(id)||layout.floating.some(f=>f.panel===id)||dockGroups(layout.tree).some(g=>g.active===id&&!g.collapsed);
        return ReactDOM.createPortal(<PanelActivityContext.Provider value={active}>{panel}</PanelActivityContext.Provider>,hosts.current[id],id);
      })}
      {drag && (
        <>
          <div
            className="a-dock-drag-label"
            style={{ left: drag.x, top: drag.y }}
          >
            {tr(DOCK_PANELS[drag.panel])}
          </div>
          {drag.target && <DockDropPreview target={drag.target} />}
        </>
      )}
    </div>
  );
}

function DockDropPreview({ target }) {
  let { x, y, width, height, edge } = target;
  if (edge === "left" || edge === "right") {
    if (edge === "right") x += width * .7;
    width *= .3;
  }
  if (edge === "top" || edge === "bottom") {
    if (edge === "bottom") y += height * .7;
    height *= .3;
  }
  return (
    <div
      className="a-dock-drop-preview"
      style={{ left: x, top: y, width, height }}
    >
      <span>{edge === "center" ? tr("Group as tabs") : `Dock ${edge}`}</span>
    </div>
  );
}

function SplitHandle({ node, onChange }) {
  const start = useRef(null);
  return (
    <div
      className={`a-dock-divider a-dock-divider--${node.axis}`}
      role="separator"
      tabIndex="0"
      aria-label={tr("Resize docked panels")}
      aria-orientation={node.axis === "row" ? "vertical" : "horizontal"}
      aria-valuemin={12}
      aria-valuemax={88}
      aria-valuenow={Math.round(node.ratio * 100)}
      onPointerDown={(e) => {
        const r = e.currentTarget.parentNode.getBoundingClientRect();
        start.current = { r };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const r = start.current.r;
        onChange(clamp(
          node.axis === "row"
            ? (e.clientX - r.left) / r.width
            : (e.clientY - r.top) / r.height,
          .12,
          .88,
        ));
      }}
      onPointerUp={(e) => {
        start.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
      onDoubleClick={() => onChange(.5)}
      onKeyDown={(e) => {
        if (
          ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"].includes(e.key)
        ) {
          e.preventDefault();
          onChange(
            clamp(
              node.ratio +
                (["ArrowLeft", "ArrowUp"].includes(e.key) ? -.03 : .03),
              .12,
              .88,
            ),
          );
        }
      }}
    />
  );
}
