// ═══════════════════════════════════════════════════════════════════════
//  VIEWPORT — Three.js scene mirroring the project state
//
//  The Three scene mirrors the object hierarchy one-to-one, so moving a
//  parent moves its children exactly as the baked export will. Gizmo edits
//  are converted back into the selected object's LOCAL transform before
//  they reach the project.
//
//  This is an approximation of layout only. It does not emulate the GS or
//  the VU pipeline — lighting here will not match hardware.
// ═══════════════════════════════════════════════════════════════════════

function Viewport({
  scene, files, selectedIds, activeId,
  onSelect, onTransform, onMeshBounds,
  gizmoMode, gizmoSpace, snap, snapSize, showOverlays, shaded,
  onFrameRequest,
  onCaptureRequest,
  terrainTool, onTerrainStroke,
}) {
  const mountRef = useRef(null);
  const G = useRef(null);          // long-lived Three state
  const propsRef = useRef({});
  propsRef.current = { scene, selectedIds, activeId, gizmoMode, gizmoSpace, snap, snapSize, onSelect, onTransform, terrainTool, onTerrainStroke };

  const [ready, setReady] = useState(false);
  const [hoverAxis, setHoverAxis] = useState(null);
  useEffect(() => {
    if (!onCaptureRequest || !ready) return;
    const capture = () => {
      const g = G.current;
      if (!g || !mountRef.current?.clientWidth || !mountRef.current?.clientHeight) throw Error("Open the Scene panel before capturing it.");
      placeViewportSkybox(g);
      // Render and request encoding in this task: WebGL clears its buffer after
      // presentation. ClipboardItem can accept the resulting Promise<Blob>.
      g.renderer.render(g.three, g.camera);
      return new Promise((resolve, reject) => g.renderer.domElement.toBlob((blob) => blob ? resolve(blob) : reject(Error("The scene image could not be captured.")), "image/png"));
    };
    onCaptureRequest.current = capture;
    return () => { if (onCaptureRequest.current === capture) onCaptureRequest.current = null; };
  }, [onCaptureRequest, ready]);

  // ── one-time setup ───────────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || typeof THREE === "undefined") return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(mount.ownerDocument.defaultView.devicePixelRatio, 2));
    renderer.setClearColor(terrainTool?0x537dc0:0x070b11, 1);
    renderer.shadowMap.enabled=!!terrainTool;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    if(terrainTool)renderer.outputEncoding=THREE.sRGBEncoding;
    // The canvas is sized by CSS (absolute, inset 0) and only its backing store
    // is set from JS. setSize() writes inline width/height styles by default,
    // which pinned the canvas at whatever size the panel happened to be on the
    // first frame: closing a panel or resizing the window then left the
    // viewport rendering into a stale rectangle.
    renderer.domElement.className = "a-viewport__canvas";
    mount.appendChild(renderer.domElement);

    const three = new THREE.Scene();
    const camera = terrainTool?new THREE.OrthographicCamera(-20,20,20,-20,.05,8000):new THREE.PerspectiveCamera(55, 1, 0.05, 8000);
    camera.position.set(9, terrainTool?10:7, 12);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.screenSpacePanning = false;
    // Match a PS2 dev pad: left orbit, right pan, wheel dolly.
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN,
    };

    const grid = new THREE.GridHelper(60, 60, 0x2c3c52, 0x18222f);
    grid.material.transparent = true;
    grid.material.opacity = 0.65;
    three.add(grid);
    const axes = new THREE.AxesHelper(2.2);
    axes.material.depthTest = false;
    three.add(axes);

    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    const key = new THREE.DirectionalLight(0xffffff, 0.85);
    key.position.set(5, 10, 7);
    if(terrainTool){key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.bias=-.002;key.shadow.normalBias=.1;}
    const fill = new THREE.DirectionalLight(0x88aaff, 0.3);
    fill.position.set(-6, 3, -5);
    three.add(ambient, key, fill);

    const content = new THREE.Group();      // everything from the project
    const helpers = new THREE.Group();      // selection boxes + gizmo
    three.add(content, helpers);

    G.current = {
      renderer, three, camera, controls, content, helpers, grid, axes,
      ambient, key, fill,
      nodes: new Map(),      // object id -> { group, holder, overlays[] }
      loadToken: 0,
      gizmo: null,
      drag: null,
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(),
      selBoxes: [],
    };

    const resize = () => {
      const w = mount.clientWidth || 1, h = mount.clientHeight || 1;
      renderer.setPixelRatio(Math.min(mount.ownerDocument.defaultView.devicePixelRatio, 2));
      renderer.setSize(w, h, false);   // false: leave the CSS size to the class
      if(camera.isOrthographicCamera) {
        const half=G.current?.orthoHalf||20;
        camera.left=-half*w/h;camera.right=half*w/h;camera.top=half;camera.bottom=-half;
      }else camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    // ResizeObserver does not fire for a devicePixelRatio change on its own —
    // dragging the window to a display with a different scale would otherwise
    // leave the backing store at the old resolution.
    let frameWindow = mount.ownerDocument.defaultView;
    frameWindow.addEventListener("resize", resize);

    let raf = 0;
    const tick = () => {
      raf = frameWindow.requestAnimationFrame(tick);
      // Docked tabs stay mounted to preserve the camera; hidden tabs need no draw.
      if (!mount.clientWidth || !mount.clientHeight) return;
      controls.update();
      const g = G.current;
      placeViewportSkybox(g);
      if(g?.terrainDrag && performance.now()-g.terrainDrag.lastTick >= 60) {
        const d=g.terrainDrag, P=propsRef.current;
        if(P.terrainTool?.mode==="hills") P.onTerrainStroke?.(d.point,"edit",d.reverse);
        d.lastTick=performance.now();
      }
      if (g?.gizmo) scaleGizmoToView(g.gizmo, camera, 92, mount.clientHeight || 600);
      renderer.render(three, camera);
    };
    tick();
    const surface = mount.closest(".a-panel-surface");
    const changeWindow = () => {
      frameWindow.cancelAnimationFrame(raf);
      frameWindow.removeEventListener("resize", resize);
      frameWindow = mount.ownerDocument.defaultView;
      frameWindow.addEventListener("resize", resize);
      resize();
      tick();
    };
    surface?.addEventListener("atheditor-window-change", changeWindow);
    setReady(true);

    return () => {
      frameWindow.cancelAnimationFrame(raf);
      ro.disconnect();
      frameWindow.removeEventListener("resize", resize);
      surface?.removeEventListener("atheditor-window-change", changeWindow);
      controls.dispose();
      clearViewportSkybox(G.current);
      disposeObject(three);
      renderer.dispose();
      renderer.domElement.remove();
      G.current = null;
    };
  }, []);

  useEffect(() => {
    if (G.current && scene) syncViewportSkybox(G.current, scene, files);
  }, [scene?.skybox, scene?.background, files, ready]);

  // Mesh bounds are discovered asynchronously as models load; the app stores
  // them on the asset entry so Rigidbody auto-fit has real numbers to use.
  useEffect(() => {
    if (G.current) G.current.onBounds = onMeshBounds;
  }, [onMeshBounds, ready]);

  // ── viewport lighting mode ───────────────────────────────────────────
  useEffect(() => {
    const g = G.current;
    if (!g) return;
    g.ambient.intensity = shaded ? 0.32 : 0.85;
    g.key.intensity = shaded ? 1.0 : 0.85;
    g.fill.intensity = shaded ? 0.35 : 0.3;
  }, [shaded, ready]);

  // ── rebuild the scene graph when the project changes ─────────────────
  useEffect(() => {
    const g = G.current;
    if (!g || !scene) return;
    const token = ++g.loadToken;
    let cancelled = false;

    const wanted = new Set();
    const build = (list, parentGroup) => {
      for (const obj of list || []) {
        wanted.add(obj.id);
        let node = g.nodes.get(obj.id);
        if (!node) {
          const group = new THREE.Group();
          const holder = new THREE.Group();  // the visual, kept separate from children
          group.add(holder);
          node = { group, holder, overlays: [], modelKey: null, bounds: null };
          g.nodes.set(obj.id, node);
        }
        if (node.group.parent !== parentGroup) parentGroup.add(node.group);

        const t = obj.components.transform || makeComponent("transform");
        node.group.matrixAutoUpdate = false;
        node.group.matrix.fromArray(matFromTRS(t.position, t.rotation, t.scale));
        node.group.matrixWorldNeedsUpdate = true;
        node.group.visible = obj.visible !== false;
        node.group.userData.objectId = obj.id;

        syncVisual(g, obj, node, files, token, () => cancelled);


        build(obj.children, node.group);
      }
    };
    build(scene.objects, g.content);
    g.content.updateMatrixWorld(true);
    const worlds = worldTransforms(scene.objects);
    g.refreshOverlays = () => walk(scene.objects, (obj, parents) => {
      syncOverlays(g, obj, g.nodes.get(obj.id), scene,
        showOverlays && obj.visible !== false && parents.every((p) => p.visible !== false), worlds);
    });
    g.refreshOverlays();

    // Drop nodes for deleted objects.
    for (const [id, node] of [...g.nodes]) {
      if (wanted.has(id)) continue;
      node.group.parent?.remove(node.group);
      for (const overlay of node.overlays) { overlay.parent?.remove(overlay); disposeObject(overlay); }
      disposeObject(node.group);
      g.nodes.delete(id);
    }

    return () => { cancelled = true; };
  }, [scene, files, showOverlays, ready]);

  // ── selection outlines + gizmo placement ─────────────────────────────
  useEffect(() => {
    const g = G.current;
    if (!g) return;
    g.grid.visible = !terrainTool;
    g.axes.visible = !terrainTool;

    // Camera/light markers are guides too. Keep their children and scene data
    // intact, and show the marker when its object is selected in the Outliner.
    walk(scene?.objects || [], (obj) => {
      const node=g.nodes.get(obj.id);
      if(node)node.holder.visible=!!obj.components.model?.file ||
        !(obj.components.light || obj.components.camera) || showOverlays || selectedIds.includes(obj.id);
    });

    for (const b of g.selBoxes) { b.parent?.remove(b); b.geometry?.dispose(); }
    g.selBoxes = [];

    for (const id of terrainTool ? [] : selectedIds || []) {
      const node = g.nodes.get(id);
      if (!node || !isViewportVisible(node.group)) continue;
      const box = buildSelectionBox(node.group, id === activeId);
      if (box) { g.helpers.add(box); g.selBoxes.push(box); }
    }

    if (g.gizmo) { g.helpers.remove(g.gizmo); disposeObject(g.gizmo); g.gizmo = null; }
    const active = activeId ? g.nodes.get(activeId) : null;
    if (active && isViewportVisible(active.group) && !terrainTool) {
      const gz = buildGizmo(gizmoMode);
      active.group.getWorldPosition(gz.position);
      if (gizmoSpace === "local") active.group.getWorldQuaternion(gz.quaternion);
      g.helpers.add(gz);
      g.gizmo = gz;
    }
  }, [selectedIds, activeId, gizmoMode, gizmoSpace, scene, showOverlays, ready, !!terrainTool]);

  // ── framing ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!onFrameRequest) return;
    onFrameRequest.current = (which) => {
      const g = G.current;
      if (!g) return;
      const box = new THREE.Box3();
      if (which === "all") {
        box.setFromObject(g.content);
      } else {
        let any = false;
        for (const id of propsRef.current.selectedIds || []) {
          const n = g.nodes.get(id);
          if (n) { box.expandByObject(n.group); any = true; }
        }
        if (!any) box.setFromObject(g.content);
      }
      if (box.isEmpty()) return;
      const center = box.getCenter(new THREE.Vector3());
      const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.6);
      const dir = new THREE.Vector3().subVectors(g.camera.position, g.controls.target).normalize();
      const dist = radius / Math.sin((g.camera.fov * Math.PI) / 360) * 1.25;
      g.controls.target.copy(center);
      if(g.camera.isOrthographicCamera) {
        g.camera.position.copy(center).add(dir.multiplyScalar(radius*3));
        g.controls.update();g.camera.updateMatrixWorld(true);
        const size=box.getSize(new THREE.Vector3()),view=g.camera.matrixWorldInverse.elements,
          width=Math.abs(view[0])*size.x+Math.abs(view[4])*size.y+Math.abs(view[8])*size.z,
          height=Math.abs(view[1])*size.x+Math.abs(view[5])*size.y+Math.abs(view[9])*size.z,
          aspect=(mountRef.current.clientWidth||1)/(mountRef.current.clientHeight||1);
        g.orthoHalf=Math.max(height/2,width/(2*aspect),.5)*1.15;
        g.camera.zoom=1;g.camera.left=-g.orthoHalf*aspect;g.camera.right=g.orthoHalf*aspect;g.camera.top=g.orthoHalf;g.camera.bottom=-g.orthoHalf;
        g.camera.updateProjectionMatrix();
        g.key.position.copy(center).add(new THREE.Vector3(-radius*.8,radius*1.25,-radius*.55));
        g.key.target.position.copy(center);g.three.add(g.key.target);
        Object.assign(g.key.shadow.camera,{left:-radius,right:radius,top:radius,bottom:-radius,near:.1,far:radius*5});
        g.key.shadow.camera.updateProjectionMatrix();
      }else g.camera.position.copy(center).add(dir.multiplyScalar(dist));
      g.controls.update();
    };
  }, [onFrameRequest, ready]);

  // ── pointer: pick and drag ───────────────────────────────────────────
  useEffect(() => {
    const g = G.current;
    const mount = mountRef.current;
    if (!g || !mount) return;
    const el = g.renderer.domElement;
    if(propsRef.current.terrainTool){el.tabIndex=0;el.setAttribute("aria-label","Terrain canvas");}

    const setPointer = (e) => {
      const r = el.getBoundingClientRect();
      g.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      g.raycaster.setFromCamera(g.pointer, g.camera);
    };

    const gizmoHit = () => {
      if (!g.gizmo) return null;
      const hits = g.raycaster.intersectObject(g.gizmo, true);
      return hits.find((h) => h.object.userData.gizmoAxis)?.object.userData.gizmoAxis || null;
    };

    const terrainPoint = () => {
      const P=propsRef.current, node=g.nodes.get(P.terrainTool?.objectId);
      if(!node || !isViewportVisible(node.group))return null;
      if(P.terrainTool.mode==="cliffs") {
        const t=findObj(P.scene.objects,P.terrainTool.objectId)?._terrainPreview;
        if(!t)return null;
        const ray=g.raycaster.ray.clone().applyMatrix4(node.group.matrixWorld.clone().invert()),
          point=ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-P.terrainTool.level*t.stepHeight),new THREE.Vector3());
        return point && Math.abs(point.x)<t.width*t.cellSize/2 && Math.abs(point.z)<t.depth*t.cellSize/2?point:null;
      }
      const hit=g.raycaster.intersectObject(node.holder,true)[0];
      return hit?node.group.worldToLocal(hit.point.clone()):null;
    };
    const showBrush = point => {
      const P=propsRef.current,node=g.nodes.get(P.terrainTool?.objectId);
      if(!point||!node){if(g.terrainBrush)g.terrainBrush.visible=false;return;}
      if(!g.terrainBrush) {
        g.terrainBrush=new THREE.LineLoop(new THREE.BufferGeometry(),overlayMaterial(0x8dbdff,.95));
        g.terrainBrush.renderOrder=1000;
      }
      if(g.terrainBrush.parent!==node.group)node.group.add(g.terrainBrush);
      const r=P.terrainTool.size*P.terrainTool.cellSize/2,pts=[];
      if(P.terrainTool.mode==="hills")for(let i=0;i<48;i++)pts.push(new THREE.Vector3(point.x+Math.cos(i*Math.PI/24)*r,point.y+.04,point.z+Math.sin(i*Math.PI/24)*r));
      else {
        const t=findObj(P.scene.objects,P.terrainTool.objectId)._terrainPreview;
        const offset=P.terrainTool.size%2 ? .5 : 0,
          cx=(Math.floor(point.x/t.cellSize+t.width/2)+offset-t.width/2)*t.cellSize,
          cz=(Math.floor(point.z/t.cellSize+t.depth/2)+offset-t.depth/2)*t.cellSize;
        for(const [x,z] of [[-r,-r],[r,-r],[r,r],[-r,r]])pts.push(new THREE.Vector3(cx+x,point.y+.04,cz+z));
      }
      g.terrainBrush.geometry.dispose();g.terrainBrush.geometry=new THREE.BufferGeometry().setFromPoints(pts);
      g.terrainBrush.visible=true;
    };

    const onDown = (e) => {
      if (e.button !== 0) return;
      setPointer(e);
      const P = propsRef.current;
      if(P.terrainTool && !e.altKey) {
        if(P.terrainTool.disabled)return;
        const point=terrainPoint();if(!point)return;
        e.preventDefault();e.stopImmediatePropagation();g.controls.enabled=false;
        el.focus({preventScroll:true});
        g.terrainDrag={point,reverse:e.shiftKey,lastTick:performance.now(),pointerId:e.pointerId};
        el.setPointerCapture(e.pointerId);P.onTerrainStroke?.(point,"start",e.shiftKey);showBrush(point);return;
      }
      const axis = gizmoHit();

      if (axis && P.activeId) {
        const node = g.nodes.get(P.activeId);
        if (!node) return;
        const origin = node.group.getWorldPosition(new THREE.Vector3());
        const quat = node.group.getWorldQuaternion(new THREE.Quaternion());
        const state = beginDrag({
          mode: P.gizmoMode, axis, raycaster: g.raycaster, camera: g.camera,
          origin, space: P.gizmoSpace, objectQuat: quat,
        });
        if (!state) return;
        const t = node.group.userData.startTransform = deepClone(
          findObj(P.scene.objects, P.activeId)?.components.transform || {},
        );
        const parentQuat = node.group.parent?.getWorldQuaternion(new THREE.Quaternion()) || new THREE.Quaternion();
        g.drag = { ...state, id: P.activeId, start: t, parentQuat, moved: false };
        g.controls.enabled = false;
        el.setPointerCapture(e.pointerId);
        return;
      }

      // Selection pick — ignore helpers and invisible nodes.
      const hits = g.raycaster.intersectObject(g.content, true);
      const hit = hits.find((h) => {
        if (!isViewportVisible(h.object)) return false;
        for (let o = h.object; o; o = o.parent) {
          if (o.userData.overlay && o.userData.overlay !== "placeholder") return false;
        }
        return true;
      });
      let id = null;
      for (let o = hit?.object; o; o = o.parent) {
        if (o.userData.objectId) { id = o.userData.objectId; break; }
      }
      P.onSelect(id, { additive: e.ctrlKey || e.metaKey, range: e.shiftKey });
    };

    const onMove = (e) => {
      setPointer(e);
      const P = propsRef.current;

      if(P.terrainTool) {
        const point=terrainPoint();showBrush(point);
        if(g.terrainDrag && point) {
          const d=g.terrainDrag;
          // Resample the whole segment, so a fast drag cannot leave unpainted gaps.
          const distance=Math.hypot(point.x-d.point.x,point.z-d.point.z),
            spacing=P.terrainTool.cellSize*.35;
          if(distance >= spacing) {
            const n=Math.min(256,Math.ceil(distance/spacing));
            for(let i=1;i<=n;i++)P.onTerrainStroke?.({x:d.point.x+(point.x-d.point.x)*i/n,z:d.point.z+(point.z-d.point.z)*i/n},"edit",e.shiftKey);
            d.point=point;d.reverse=e.shiftKey;d.lastTick=performance.now();
          }
        }
        return;
      }

      if (!g.drag) {
        setHoverAxis(gizmoHit());
        return;
      }
      const out = updateDrag(g.drag, g.raycaster);
      if (!out) return;
      g.drag.moved = true;

      const start = g.drag.start;
      const next = deepClone(start);
      const axis = g.drag.axis;

      if (g.drag.mode === "translate") {
        let d = out.delta;
        if (P.snap) d = snapTo(d, P.snapSize);
        // The drag is measured in world space; convert to the parent's space.
        const node = g.nodes.get(g.drag.id);
        const worldDelta = g.drag.axisDir.clone().multiplyScalar(d);
        const parent = node.group.parent;
        const localDelta = parent
          ? parent.worldToLocal(parent.localToWorld(new THREE.Vector3(0, 0, 0)).add(worldDelta))
          : worldDelta;
        next.position = {
          x: (start.position.x || 0) + localDelta.x,
          y: (start.position.y || 0) + localDelta.y,
          z: (start.position.z || 0) + localDelta.z,
        };
        if (P.snap) {
          next.position.x = snapTo(next.position.x, P.snapSize);
          next.position.y = snapTo(next.position.y, P.snapSize);
          next.position.z = snapTo(next.position.z, P.snapSize);
        }
      } else if (g.drag.mode === "rotate") {
        let a = out.angle;
        if (P.snap) a = snapTo(a, Math.PI / 12);
        next.rotation = rotationForDrag(start.rotation, axis, a, P.gizmoSpace, g.drag.parentQuat);
      } else {
        const base = start.scale[axis] ?? 1;
        let s = base + out.delta;
        if (P.snap) s = snapTo(s, 0.25);
        next.scale = { ...start.scale, [axis]: Math.max(0.001, s) };
      }

      P.onTransform(g.drag.id, next, "edit");
    };

    const onUp = (e) => {
      if(g.terrainDrag) {
        const d=g.terrainDrag;g.terrainDrag=null;g.controls.enabled=true;
        try{el.releasePointerCapture(d.pointerId);}catch{}
        propsRef.current.onTerrainStroke?.(d.point,e.type==="pointercancel"?"cancel":"end",d.reverse);return;
      }
      if (!g.drag) return;
      const P = propsRef.current;
      const { id, moved } = g.drag;
      g.drag = null;
      g.controls.enabled = true;
      try { el.releasePointerCapture(e.pointerId); } catch (_e) {}
      if (moved) {
        const obj = findObj(P.scene.objects, id);
        if (obj) P.onTransform(id, deepClone(obj.components.transform), "commit");
      }
    };

    const onTerrainKey = e => {
      const P=propsRef.current,t=P.terrainTool;
      if(!t || t.disabled || e.ctrlKey || e.metaKey || e.altKey)return;
      const data=findObj(P.scene.objects,t.objectId)?._terrainPreview;
      if(!data)return;
      const cursor=g.terrainCursor||{x:Math.floor(data.width/2),z:Math.floor(data.depth/2)};
      const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
      if(directions[e.key]) {
        e.preventDefault();cursor.x=clamp(cursor.x+directions[e.key][0],0,data.width-1);
        cursor.z=clamp(cursor.z+directions[e.key][1],0,data.depth-1);
      }else if(e.key!=="Enter"&&e.key!==" ")return;
      else e.preventDefault();
      g.terrainCursor=cursor;
      const i=cursor.z*data.width+cursor.x,h=data.hills[cursor.z*(data.width+1)+cursor.x],
        point=new THREE.Vector3((cursor.x+.5-data.width/2)*data.cellSize,data.levels[i]*data.stepHeight+h,(cursor.z+.5-data.depth/2)*data.cellSize);
      showBrush(point);
      if(e.key==="Enter"||e.key===" ") {
        P.onTerrainStroke?.(point,"start",e.shiftKey);P.onTerrainStroke?.(point,"end",e.shiftKey);
      }
    };

    const onTerrainBlur = () => {
      if(g.terrainDrag)onUp({type:"pointercancel"});
      if(g.terrainBrush)g.terrainBrush.visible=false;
    };
    const onTerrainLeave = () => {
      if(!g.terrainDrag && g.terrainBrush)g.terrainBrush.visible=false;
    };

    el.addEventListener("pointerdown", onDown, true);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("keydown",onTerrainKey);
    el.addEventListener("lostpointercapture",onUp);
    el.addEventListener("blur",onTerrainBlur);
    el.addEventListener("pointerleave",onTerrainLeave);
    return () => {
      el.removeEventListener("pointerdown", onDown, true);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("keydown",onTerrainKey);
      el.removeEventListener("lostpointercapture",onUp);
      el.removeEventListener("blur",onTerrainBlur);
      el.removeEventListener("pointerleave",onTerrainLeave);
      if(g.terrainDrag)propsRef.current.onTerrainStroke?.(null,"cancel",false);
      g.terrainDrag=null;
    };
  }, [ready]);

  const empty = !scene?.objects?.length;

  return (
    <div className="a-viewport" ref={mountRef} aria-label={terrainTool?"Terrain viewport":undefined}>
      {empty && ready && (
        <div className="a-viewport__empty">
          <div style={{ fontSize: 26, opacity: .4 }}>◇</div>
          <div>This scene is empty.</div>
          <div className="a-dim">Press <span className="a-kbd">Ctrl</span> <span className="a-kbd">K</span> and search for “Add”.</div>
        </div>
      )}
      <div className="a-viewport__hud">
        {selectedIds.length > 0 && gizmoSpace === "local" && <span className="a-viewport__chip">Relative to object</span>}
        {selectedIds.length > 0 && snap && <span className="a-viewport__chip">Grid snap · {snapSize}</span>}
        {hoverAxis && <span className="a-viewport__chip">{hoverAxis.toUpperCase()}</span>}
      </div>
    </div>
  );
}

// ── helpers used by the sync effect ────────────────────────────────────

/**
 * Load or refresh an object's visual representation.
 *
 * The key has to track the asset's CONTENT, not just its identity, and both
 * halves of that were learned the hard way:
 *
 *  - A key built from the component alone stayed equal when a folder was
 *    linked, because linking does not change `model.file`. The mesh never
 *    appeared.
 *  - A key built from the component and the asset's `id` stayed equal when the
 *    file itself changed, because mergeAssets holds the id constant on purpose
 *    so component references keep resolving. Re-exporting a mesh from Blender
 *    left the old geometry on screen.
 *
 * Both times, switching to the HUD tab and back "fixed" it — only because that
 * unmounts the viewport and rebuilds every node from scratch. assetRevision()
 * lives in core/storage.js so it can be unit-tested without a DOM.
 */
function syncVisual(g, obj, node, files, token, cancelled) {
  const m = obj.components.model;
  if(obj._terrainPreview && m) {
    const texture=files.find(f=>f.name===m.textureFile&&f.cat==="textures");
    const textureKey=assetRevision(texture);
    if(node.terrainData===obj._terrainPreview&&node.terrainTextureKey===textureKey)return;
    const mesh=terrainMesh(obj._terrainPreview),positions=[],uvs=[],normals=[];
    for(const face of mesh.faces)for(const c of face){positions.push(...mesh.positions[c.v]);uvs.push(...mesh.uvs[c.uv]);normals.push(...mesh.normals[c.n]);}
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
    geometry.setAttribute("normal",new THREE.Float32BufferAttribute(normals,3));
    let visual=node.holder.children[0];
    if(!visual?.userData.terrainPreview) {
      while(node.holder.children.length){const ch=node.holder.children[0];node.holder.remove(ch);disposeObject(ch);}
      visual=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0xffffff,roughness:1}));
      visual.castShadow=true;visual.receiveShadow=true;
      visual.userData.terrainPreview=true;node.holder.add(visual);
    }else{visual.geometry.dispose();visual.geometry=geometry;}
    if(node.terrainTextureKey!==textureKey){visual.material.map?.dispose();visual.material.map=texture?.dataUrl?makeTexture(texture.dataUrl,"NEAREST"):null;if(visual.material.map)visual.material.map.encoding=THREE.sRGBEncoding;visual.material.needsUpdate=true;}
    node.terrainData=obj._terrainPreview;node.terrainTextureKey=textureKey;node.modelKey="__terrainPreview";return;
  }
  const assetKey = (name, cat) => {
    if (!name) return "";
    return assetRevision(files.find((x) => x.name === name && x.cat === cat));
  };
  const key = m?.file
    ? [
      m.file, assetKey(m.file, "models"),
      m.textureFile || "", assetKey(m.textureFile, "textures"),
      m.pipeline || "", m.textureFilter || "", m.face_culling || "", m.shade_model || "", m.texture_mapping !== false,
    ].join("|")
    : `__${primaryComponent(obj)}`;
  if (node.modelKey === key) return;

  // Cleared, not set, until the mesh is actually in place. Loading is async and
  // any state change starts a new pass with a new g.loadToken, which makes the
  // in-flight result get dropped below. With the key already committed, the
  // early return above would then never retry it and the object stayed
  // invisible until something unmounted the viewport — which is precisely why
  // switching to the HUD tab and back appeared to "fix" it.
  node.modelKey = null;
  node.bounds = null;

  while (node.holder.children.length) {
    const ch = node.holder.children[0];
    node.holder.remove(ch);
    disposeObject(ch);
  }

  if (!m?.file) {
    // No mesh: show a small marker so the object stays selectable.
    node.modelKey = key;
    node.holder.add(buildPlaceholder(COMPONENTS[primaryComponent(obj)]?.color || "#667788"));
    return;
  }

  const superseded = () => cancelled() || g.loadToken !== token;
  buildModel(m, files).then((built) => {
    if (superseded()) { if (built) disposeObject(built.object3d); return; }
    node.modelKey = key;
    if (!built) {
      // The mesh is not among the loaded assets. The Problems panel says so;
      // here it just needs to stay visible and selectable.
      node.holder.add(buildPlaceholder(COMPONENTS[primaryComponent(obj)]?.color || "#667788"));
      return;
    }
    node.bounds = built.bounds;
    node.holder.add(built.object3d);
    g.refreshOverlays?.();
    g.onBounds?.(m.file, built.bounds);
  }).catch(() => {
    if (superseded()) return;
    node.modelKey = key;
    node.holder.add(buildPlaceholder("#ff5470"));
  });
}

/** Rebuild the component overlays attached to an object. */
function syncOverlays(g, obj, node, scene, show, worlds = worldTransforms(scene.objects)) {
  for (const o of node.overlays) { o.parent?.remove(o); disposeObject(o); }
  node.overlays = [];
  if (!show) return;

  const add = (o) => { if (o) { node.group.add(o); node.overlays.push(o); } };

  if (obj.components.rigidbody) {
    const rb = obj.components.rigidbody;
    const world = worlds.get(obj.id);
    const overlay = buildColliderOverlay(rb, node.bounds, world.scale);
    overlay.position.set(world.position.x, rb.shape === "plane" ? (rb.planeY ?? 0) : world.position.y, world.position.z);
    g.helpers.add(overlay);
    node.overlays.push(overlay);
  }
  if (obj.components.light) add(buildLightOverlay(obj.components.light));
  if (obj.components.camera) add(buildCameraOverlay(obj.components.camera));
  if (obj.components.shadow) {
    const sh = obj.components.shadow;
    let dir = sh.lightDir;
    if (sh.lightSource) {
      const src = findByName(scene, sh.lightSource);
      if (src?.components.light) dir = src.components.light.direction;
    }
    const casterObj = sh.caster ? findByName(scene, sh.caster) : obj;
    const caster = casterObj && g.nodes.get(casterObj.id);
    const casterWorld = casterObj && worlds.get(casterObj.id);
    const origin = sh.follow && casterWorld ? casterWorld.position : worlds.get(obj.id).position;
    const overlay = buildShadowOverlay(sh, dir, caster?.bounds, casterWorld?.scale, origin);
    // A ground projection is in world space, independent of the owner's TRS.
    g.helpers.add(overlay);
    node.overlays.push(overlay);
  }
}
