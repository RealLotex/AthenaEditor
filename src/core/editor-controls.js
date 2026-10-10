// Editor preferences only: never exported as game input or added to undo history.
const EDITOR_MOUSE_PRESETS = {
  default: { name: "Editor", orbit: [0, "none"], pan: [2, "none"], dolly: [1, "none"] },
  blender: { name: "Blender", orbit: [1, "none"], pan: [1, "shift"], dolly: [1, "ctrl"] },
  maya: { name: "Maya", orbit: [0, "alt"], pan: [1, "alt"], dolly: [2, "alt"] },
  unity: { name: "Unity", orbit: [0, "alt"], pan: [1, "none"], dolly: [2, "alt"] },
};
const DEFAULT_EDITOR_MOUSE = {
  orbit: { button: 0, modifier: "none" }, pan: { button: 2, modifier: "none" }, dolly: { button: 1, modifier: "none" },
  dragThreshold: 5, orbitSpeed: 1, panSpeed: 1, zoomSpeed: 1, invertWheel: false, damping: true,
};
function normalizeEditorMouse(value = {}) {
  const result = { ...DEFAULT_EDITOR_MOUSE, ...value };
  for (const action of ["orbit", "pan", "dolly"]) {
    const binding = value[action];
    result[action] = binding && [-1, 0, 1, 2].includes(binding.button) && ["none", "alt", "ctrl", "shift"].includes(binding.modifier)
      ? { button: binding.button, modifier: binding.modifier } : { ...DEFAULT_EDITOR_MOUSE[action] };
  }
  for (const [key, min, max] of [["dragThreshold", 1, 30], ["orbitSpeed", .1, 5], ["panSpeed", .1, 5], ["zoomSpeed", .1, 5]]) {
    result[key] = Number.isFinite(Number(result[key])) ? clamp(Number(result[key]), min, max) : DEFAULT_EDITOR_MOUSE[key];
  }
  result.invertWheel = result.invertWheel === true; result.damping = result.damping !== false;
  return result;
}
function editorMousePreset(id, current) {
  const preset = EDITOR_MOUSE_PRESETS[id];
  if (!preset) throw Error("Choose a supported camera preset.");
  const result = normalizeEditorMouse(current);
  for (const action of ["orbit", "pan", "dolly"]) result[action] = { button: preset[action][0], modifier: preset[action][1] };
  return result;
}
function editorMouseModifier(event) {
  const modifiers = [event.altKey && "alt", (event.ctrlKey || event.metaKey) && "ctrl", event.shiftKey && "shift"].filter(Boolean);
  return modifiers.length > 1 ? "combined" : modifiers[0] || "none";
}
function editorMouseAction(settings, event) {
  const modifier = editorMouseModifier(event);
  return ["orbit", "pan", "dolly"].find(action => settings[action].button === event.button && settings[action].modifier === modifier) || null;
}
function editorMouseConflict(settings, action, binding) {
  return binding.button === -1 ? null : ["orbit", "pan", "dolly"].find(other => other !== action && settings[other].button === binding.button && settings[other].modifier === binding.modifier) || null;
}
function updateSelectionGesture(gesture, event, threshold) {
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > threshold) gesture.dragged = true;
}
function selectionGestureIsClick(gesture, event, threshold) {
  updateSelectionGesture(gesture, event, threshold);
  return !!gesture && gesture.pointerId === event.pointerId && event.type === "pointerup" && !gesture.dragged;
}
function editorHotkeyConflict(commands, id, keys) {
  if (!keys) return null;
  return commands.find(command => command.id !== id && command.keys && normalizeCombo(command.keys) === normalizeCombo(keys)) || null;
}
function normalizeEditorHotkeys(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id, keys]) => id.length < 100 && typeof keys === 'string' && keys.length < 80).map(([id, keys]) => [id, keys ? normalizeCombo(keys) : '']));
}
function editorCommandBindings(commands, hotkeys) {
  const aliases={'view.viewport':'view.panel.viewport','view.hud':'view.panel.hud','view.game':'view.panel.game','view.timeline':'view.panel.timeline','view.terrain':'view.panel.terrain','view.lighting':'view.panel.environment','view.events':'view.panel.events','view.sceneProperties':'view.panel.sceneSettings','view.controls':'view.panel.controls','view.problems':'view.panel.problems','tools.uv':'view.panel.uv','tools.scripts':'view.panel.scripts','help.reset':'view.layout.reset'};
  const unique=[...new Map(commands.map(command=>[command.id,command])).values()];
  return unique.map(command => {
    if(aliases[command.id])return {...command,hidden:true,keys:'',defaultKeys:''};
    const alias=unique.find(c=>aliases[c.id]===command.id),defaultKeys=command.keys||alias?.keys||'';
    return {...command,defaultKeys,keys:Object.hasOwn(hotkeys,command.id)?hotkeys[command.id]:alias&&Object.hasOwn(hotkeys,alias.id)?hotkeys[alias.id]:defaultKeys};
  });
}

/** "Ctrl+Shift+Z" in any casing/order -> the canonical form keyComboOf emits. */
function normalizeCombo(spec) {
  const parts = spec.split("+").map((s) => s.trim());
  const mods = { Ctrl: false, Alt: false, Shift: false };
  let key = "";
  for (const p of parts) {
    const lower = p.toLowerCase();
    if (lower === "ctrl" || lower === "cmd" || lower === "meta") {
      mods.Ctrl = true;
    } else if (lower === "alt") mods.Alt = true;
    else if (lower === "shift") mods.Shift = true;
    else key = p;
  }
  if (key.toLowerCase() === "del") key = "Delete";
  if (key.length === 1) key = key.toUpperCase();
  const out = [];
  if (mods.Ctrl) out.push("Ctrl");
  if (mods.Alt) out.push("Alt");
  if (mods.Shift) out.push("Shift");
  out.push(key);
  return out.join("+");
}

// Native color pickers emit far more input events than an editor can redraw.
// Keep the latest sample, and seal the same undo gesture at its final value.
function createColorGesture(preview, commit, {schedule=setTimeout,cancel=clearTimeout,interval=50}={}) {
  let pending=null,timer=null,active=false,last=null;
  function flush() {
    if(timer!==null){cancel(timer);timer=null;}
    if(pending===null)return;
    const value=pending;pending=null;
    if(value!==last){last=value;preview(value);}
  }
  return {
    get active(){return active;},
    input(value) {
      if(!active){active=true;last=null;pending=value;flush();}
      else pending=value;
      if(timer===null)timer=schedule(()=>{timer=null;flush();},interval);
    },
    finish(value) {
      if(!active)return;
      if(value!==undefined)pending=value;
      flush();active=false;
      commit(last);
    },
    dispose(){if(timer!==null)cancel(timer);timer=null;pending=null;active=false;},
  };
}
