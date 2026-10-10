// Presets are ordinary editable script modules. Configuration stays on the
// collider, so a shared module can serve many objects without replacing controllers.
function eventPresetScript(preset) {
  return `// ${preset.label} — configured in Rigidbody → Events.
export function init(ctx) {
    for (const action of ctx.eventActions || []) {
        if (action.preset !== "${preset.id}") continue;
        ${preset.id === "playAnimation" ? 'if (!action.animations[action.clip]) throw new Error("Unknown animation clip: " + action.clip);' : ""}
        const slot = ctx[action.key];
        const suffix = action.phase === "exit" ? "Exit" : "Enter";
        for (const hook of ["onCollision" + suffix, "onTrigger" + suffix]) {
            const previous = slot[hook];
            slot[hook] = function(event) {
                if (action.geom._destroyed) return;
                if (typeof previous === "function") previous.call(this, event);
                if (action.geom._destroyed || action.otherId && action.otherId !== event.otherId) return;
                ${preset.action}
            };
        }
    }
}

`;
}

// Upgrade only exact copies of the former generated preset. Edited scripts
// belong to the user and retain their contents.
function repairedEventPresetSource(content) {
  const preset=EVENT_ACTION_PRESETS.find(p=>p.id==='playSound'),current=eventPresetScript(preset);
  const previous=current.replace(preset.action,'action.sound.loop = false; action.sound.rewind(); action.sound.play();');
  return content===previous?current:content;
}

function attachEventPreset(project, scene, obj, presetId) {
  const rb = obj.components.rigidbody;
  rb.eventPreset = presetId;
  if (!presetId) { rb.eventScript = ""; return; }
  const preset = EVENT_ACTION_PRESETS.find(p => p.id === presetId);
  if (!preset) throw new Error("Unknown event script preset.");
  scene.physics.enabled = true;
  rb.collisionEvents = true;
  const key = physicsEventKey(obj);
  if (PHYSICS_CTX_HANDLES.has(key) || allObjects(scene.objects).some(o => o.id !== obj.id && o.components?.rigidbody?.collisionEvents && physicsEventKey(o) === key)) {
    rb.onCollide = `event_${ident(obj.id, "object")}`;
  }
  project.scripts ||= [];
  let filename = preset.filename, i = 2;
  const existing = name => project.scripts.find(s => s.name === name) || project.assets?.find(s => s.cat === "scripts" && s.name === name);
  while (existing(filename) && existing(filename).eventPreset !== presetId) filename = preset.filename.replace(/\.js$/, `_${i++}.js`);
  if (!existing(filename)) project.scripts.push({ name: filename, content: eventPresetScript(preset), eventPreset: presetId });
  rb.eventScript = filename;
  if (presetId === "playAnimation") {
    rb.eventAnimationFile ||= obj.components.animator?.file || "";
    rb.eventAnimation ||= obj.components.animator?.defaultAnim || "";
  }
}

function resolveEventPresets(ir, ensureScript, names, problem) {
  const actions = [];
  for (const body of ir.physics.bodies) {
    const rb = body.rb;
    if (!body.events || !rb.eventPreset) continue;
    const preset = EVENT_ACTION_PRESETS.find(p => p.id === rb.eventPreset);
    const fail = message => problem("error", message, body.obj, "rigidbody");
    if (!preset) { fail("Choose a valid event script preset."); continue; }
    if (rb.eventOtherId && !ir.physics.bodies.some(b => b.obj.id === rb.eventOtherId && b !== body)) fail("Only With must reference another exported collider.");
    if (rb.eventPhase && !["enter", "exit"].includes(rb.eventPhase)) fail("Choose On Enter or On Exit for the event preset.");
    const action = { body, preset: preset.id, phase: rb.eventPhase || "enter" };
    if(preset.id==="playSequence"&&!ir.scene.sequences?.some(s=>s.id===rb.eventSequenceId)){fail("Choose a Sequence for Play Cinematic.");continue;}
    if (preset.id === "playSound") {
      if (!rb.eventAudio) { fail("Choose an Audio file for Play Sound Oneshot."); continue; }
      let sound = ir.sounds.find(s => s.sound.file === rb.eventAudio && s.eventOnly);
      if (!sound) {
        sound = { obj: body.obj, vn: names.take("event_sound", "sound"), sound: { file: rb.eventAudio }, eventOnly: true };
        ir.sounds.push(sound);
      }
      action.sound = sound;
    }
    if (preset.id === "changeScene" && !ir.project.scenes.some(s => s.id === rb.eventSceneId)) { fail("Choose a Scene for Change Scene."); continue; }
    if (preset.id === "playAnimation") {
      if (!body.model || body.obj.ctxEnabled === false) { fail("Play Animation needs a Model available to scripts on this object."); continue; }
      if (!rb.eventAnimationFile || !rb.eventAnimation?.trim()) { fail("Choose an Animation File and enter its clip name."); continue; }
      let anim = ir.anims.find(a => a.file === rb.eventAnimationFile);
      if (!anim) { anim = { file: rb.eventAnimationFile, vn: names.take("event_anims", "anims") }; ir.anims.push(anim); }
      action.anim = anim;
    }
    const entry = ensureScript(rb.eventScript || preset.filename, body.obj, eventPresetScript(preset));
    ir.scripts.bindings.push({ obj: body.obj, entry, ctxKey: body.ctxKey, modelVN: null, eventPreset: true });
    actions.push(action);
  }
  return actions;
}

function emitEventPresetCtx(e, ir) {
  if (!ir.eventActions.length) return;
  e.w(`ctx.eventActions = [`);
  e.block(b => {
    for (const a of ir.eventActions) {
      const rb = a.body.rb;
      b.w(`{ preset: "${a.preset}", key: "${jsStr(a.body.ctxKey)}", phase: "${a.phase}",`);
      b.w(`  objectId: "${jsStr(a.body.obj.id)}", geom: ${a.body.geomVN}, otherId: "${jsStr(rb.eventOtherId || "")}",`);
      if (a.sound) b.w(`  sound: ${a.sound.vn},`);
      if (a.preset === "changeScene") b.w(`  sceneId: "${jsStr(rb.eventSceneId)}",`);
      if (a.preset === "playSequence") b.w(`  sequenceId: "${jsStr(rb.eventSequenceId)}",`);
      if (a.preset === "destroyObject") b.w(`  target: "${rb.eventTarget === "other" ? "other" : "self"}",`);
      if (a.anim) b.w(`  model: ${a.body.model.vn}, animations: ${a.anim.vn}, clip: "${jsStr(rb.eventAnimation)}", loop: ${!!rb.eventAnimationLoop},`);
      b.w(`},`);
    }
  });
  e.w(`];`);
}
