// ═══════════════════════════════════════════════════════════════════════
//  PROJECT AND SCENE SETTINGS
//
//  Two panels, matching the two concepts:
//
//    Project — decided once for the whole program: video mode, framebuffer,
//              alpha test, asset directories, which scene boots.
//    Scene   — differs per level: clear colour, camera defaults, physics
//              world, transitions.
//
//  Before v3 all of this lived on the scene, so New Scene copied a dozen
//  render settings that then drifted apart.
// ═══════════════════════════════════════════════════════════════════════

const VIDEO_MODES = [
  { value: "", label: "Console default", help: "Leave the video mode alone. Safest, and what most homebrew does." },
  { value: "NTSC", label: "NTSC (640x448)" },
  { value: "PAL", label: "PAL (640x512)" },
  { value: "DTV_480p", label: "480p progressive" },
  { value: "DTV_576p", label: "576p progressive" },
  { value: "DTV_720p", label: "720p" },
  { value: "DTV_1080i", label: "1080i" },
];

const PSM_OPTIONS = [
  { value: "CT16S_Z16S", label: "CT16S + Z16S", help: "16-bit colour and depth. The fastest option and the usual choice." },
  { value: "CT32_Z24", label: "CT32 + Z24", help: "32-bit colour. More bandwidth, less banding." },
  { value: "CT32_Z32", label: "CT32 + Z32", help: "Highest precision, highest cost." },
  { value: "custom", label: "Custom", help: "Set the Screen.* constants yourself." },
];
const ALPHA_METHODS = ["ALPHA_NEVER", "ALPHA_ALWAYS", "ALPHA_LESS", "ALPHA_LEQUAL", "ALPHA_EQUAL", "ALPHA_GEQUAL", "ALPHA_GREATER", "ALPHA_NEQUAL"]
  .map((v) => ({ value: v, label: v.replace("ALPHA_", "") }));
const ALPHA_FAIL = ["ALPHA_FAIL_NO_UPDATE", "ALPHA_FAIL_FB_ONLY", "ALPHA_FAIL_ZB_ONLY", "ALPHA_FAIL_RGB_ONLY"]
  .map((v) => ({ value: v, label: v.replace("ALPHA_FAIL_", "") }));

// ── project ────────────────────────────────────────────────────────────

function ProjectSettings({ project, onUpdate, onSetStartScene, showAdvanced }) {
  const [open, setOpen] = useState({ display: true, alpha: false, dirs: false });
  const toggle = (k) => setOpen((s) => ({ ...s, [k]: !s[k] }));
  const set = (path, value, phase) => onUpdate(path, value, phase);
  const D = project.display || {};
  const AT = D.alphaTest || {};
  const dirs = project.dirs || {};
  useEffect(() => {
    if (showAdvanced) setOpen(s => ({ ...s, display: true, alpha: true, dirs: true }));
  }, [showAdvanced]);

  return (
    <>
      <PanelHeader title="Project" />
      <div className="a-scroll" key={project.id}>
        <div style={{ padding: 8, borderBottom: "1px solid var(--line)", background: "var(--bg-2)" }}>
          <Field label="Name">
            <TextInput value={project.name} onChange={(v) => set("name", v)} />
          </Field>
          {project.scenes.length > 1 && <Field label="Start scene">
            <Select value={project.startSceneId} onChange={onSetStartScene}
              options={project.scenes.map(s => ({ value: s.id, label: s.name }))} />
          </Field>}
          <Field label="Volume">
            <NumInput value={project.audio?.volume ?? 100} onChange={(v, p) => set("audio.volume", v, p)} min={0} max={100} step={5} integer />
          </Field>
        </div>

        <Section title="Display" icon="▦" color="var(--accent)" open={open.display} onToggle={() => toggle("display")}>
          <Field label="Video mode">
            <Select value={D.mode ?? ""} onChange={(v) => set("display.mode", v)} options={VIDEO_MODES} />
          </Field>
          <Advanced pinned={showAdvanced}>
            <Field label="Performance overlay">
              <Checkbox value={!!D.debugHUD} onChange={(v) => set("display.debugHUD", v)} />
            </Field>
            <Field label="Framebuffer" help="Colour and depth pixel formats. Set once per program.">
              <Select value={D.psm} onChange={(v) => set("display.psm", v)} options={PSM_OPTIONS} />
            </Field>
            {D.psm === "custom" && (
              <>
                <Field label="Colour PSM"><TextInput mono value={D.psmCustomColor} onChange={(v) => set("display.psmCustomColor", v)} /></Field>
                <Field label="Depth PSM"><TextInput mono value={D.psmCustomDepth} onChange={(v) => set("display.psmCustomDepth", v)} /></Field>
              </>
            )}
            <Field label="VSync" help="Off tears but can raise throughput.">
              <Checkbox value={D.vsync !== false} onChange={(v) => set("display.vsync", v)} />
            </Field>
            <Field label="Frame counter"><Checkbox value={D.frameCounter !== false} onChange={(v) => set("display.frameCounter", v)} /></Field>
          </Advanced>
        </Section>

        <Section title="Transparency" icon="◫" color="var(--fg-dim)" open={open.alpha || AT.pixelBlend === true} onToggle={() => toggle("alpha")}>
          {(() => {
            const preset = transparencyPresetOf(D);
            const current = TRANSPARENCY_PRESETS.find((p) => p.id === preset);
            return (
              <>
                <Field label="Style">
                  <Select
                    value={preset}
                    onChange={(v) => {
                      const chosen = TRANSPARENCY_PRESETS.find((p) => p.id === v);
                      if (!chosen) return;   // "Custom" is a readout, not a choice
                      // One set() per field: the panel's only write path. They
                      // share a phase so the whole preset is a single undo step.
                      for (const [k, val] of Object.entries(chosen.settings)) {
                        set(`display.alphaTest.${k}`, val, "transparency-preset");
                      }
                    }}
                    options={[
                      ...TRANSPARENCY_PRESETS.map((p) => ({ value: p.id, label: p.label })),
                      ...(preset === "custom" ? [{ value: "custom", label: "Custom" }] : []),
                    ]}
                  />
                </Field>
                <div className="a-field__help" style={{ gridColumn: "1 / -1", marginBottom: 6 }}>
                  {current
                    ? current.help
                    : "Custom transparency settings."}
                </div>

                <Advanced pinned={showAdvanced || AT.pixelBlend === true || preset === "custom"} label="Hardware controls">
                    <Field label="Skip see-through pixels" help="Skips pixels that are too faint to be worth drawing. Saves time on hardware.">
                      <Checkbox value={AT.enabled !== false} onChange={(v) => set("display.alphaTest.enabled", v)} />
                    </Field>
                    {AT.enabled !== false && (
                      <>
                        <Field label="Comparison" help="How a pixel's opacity is compared against the cutoff below.">
                          <Select value={AT.method} onChange={(v) => set("display.alphaTest.method", v)} options={ALPHA_METHODS} />
                        </Field>
                        <Field
                          label="Cutoff"
                          help={`0 keeps everything except fully invisible pixels. ${ALPHA_REF_MAX} is fully opaque, so anything near it throws away almost every see-through pixel.`}
                        >
                          <NumInput value={AT.ref} onChange={(v, p) => set("display.alphaTest.ref", v, p)} min={0} max={ALPHA_REF_MAX} step={1} integer />
                        </Field>
                        <Field label="When skipped" help="What happens to a pixel that fails the comparison.">
                          <Select value={AT.onFail} onChange={(v) => set("display.alphaTest.onFail", v)} options={ALPHA_FAIL} />
                        </Field>
                      </>
                    )}
                    <Field
                      label="Per-pixel blend (PABE)"
                      help="Leave this off. Despite the name it does not enable blending — it restricts blending to pixels that are already fully opaque, which makes every see-through surface in the game solid."
                    >
                      <Checkbox value={AT.pixelBlend === true} onChange={(v) => set("display.alphaTest.pixelBlend", v)} />
                    </Field>
                </Advanced>
              </>
            );
          })()}
        </Section>

        <Section title="Asset folders" icon="▤" color="var(--fg-dim)" open={open.dirs} onToggle={() => toggle("dirs")}>
          {/* Set once by New Project and then never again — but renaming one is
              the only way to match an existing folder layout, so it stays here. */}
            <Field label="Models"><TextInput mono value={dirs.models} onChange={(v) => set("dirs.models", v)} /></Field>
            <Field label="Textures" help="Searched when a texture is not beside its mesh.">
              <TextInput mono value={dirs.textures} onChange={(v) => set("dirs.textures", v)} />
            </Field>
            <Field label="Sounds"><TextInput mono value={dirs.sounds} onChange={(v) => set("dirs.sounds", v)} /></Field>
            <Field label="Fonts"><TextInput mono value={dirs.fonts} onChange={(v) => set("dirs.fonts", v)} /></Field>
            <Field label="Scripts"><TextInput mono value={dirs.scripts} onChange={(v) => set("dirs.scripts", v)} /></Field>
        </Section>
      </div>
    </>
  );
}

// ── scene ──────────────────────────────────────────────────────────────

function SceneSettings({ scene, project, files, onUpdate, onApplySkybox, onAddTransition, onRemoveTransition, showAdvanced, onSelectObject }) {
  const [open, setOpen] = useState({ world: true, camera: false, physics: false, links: false });
  const toggle = (k) => setOpen((s) => ({ ...s, [k]: !s[k] }));
  const set = (path, value, phase) => onUpdate(path, value, phase);
  const ph = scene.physics || {};
  const cam = scene.camera || {};
  const others = project.scenes.filter((s) => s.id !== scene.id);
  const linked = new Set((scene.transitions || []).map((t) => t.targetSceneId));
  const cameraObject = exportableObjects(scene.objects || []).find(o => o.components?.camera);
  const scriptedCamera = !!cameraObject?.components?.script?.file;
  const skyEnabled = normalizedSkybox(scene.skybox).enabled;
  const unlinked = others.filter(s => !linked.has(s.id));
  const missingExit = (scene.transitions || []).some(t => !others.some(s => s.id === t.targetSceneId));
  const clippingFields = <>
    <Field label="Near"><NumInput value={cam.near} onChange={(v, p) => set("camera.near", v, p)} min={0.01} step={0.1} /></Field>
    <Field label="Far"><NumInput value={cam.far} onChange={(v, p) => set("camera.far", v, p)} min={1} step={10} /></Field>
  </>;
  const backgroundField = <Field label="Background color">
    <Color255Input value={scene.background} onChange={(v, p) => set("background", v, p)} />
  </Field>;
  useEffect(() => {
    if (showAdvanced) setOpen(s => ({ ...s, camera: true, physics: true, links: true }));
  }, [showAdvanced]);

  return (
    <>
      <PanelHeader title="Scene" />
      <div className="a-scroll" key={scene.id}>
        <div style={{ padding: 8, borderBottom: "1px solid var(--line)", background: "var(--bg-2)" }}>
          <Field label="Name">
            <TextInput value={scene.name} onChange={(v) => set("name", v)} />
          </Field>
          {scene.id === project.startSceneId && (
            <div className="a-field__help" style={{ gridColumn: "1 / -1" }}>
              Start scene
            </div>
          )}
        </div>

        <Section title="Background" icon="◍" color="var(--accent)" open={open.world} onToggle={() => toggle("world")}>
          <SkyboxEditor key={scene.id} scene={scene} files={files} onUpdate={onUpdate} onApply={onApplySkybox} />
          {skyEnabled ? <Advanced pinned={showAdvanced} label="Backdrop">{backgroundField}</Advanced> : backgroundField}
        </Section>

        <Section title="Camera" icon={COMPONENTS.camera.icon} color={COMPONENTS.camera.color} open={open.camera} onToggle={() => toggle("camera")}>
          {cameraObject && <div className="a-row" style={{ marginBottom: 8 }}>
            <span className="a-grow">{cameraObject.name}</span>
            {onSelectObject && <button className="a-btn a-btn--sm" onClick={() => onSelectObject(cameraObject.id)}>Edit camera</button>}
          </div>}
          {!scriptedCamera && <Field label="Orbit with gamepad">
            <Checkbox value={scene.defaultCameraRig !== false} onChange={(v) => set("defaultCameraRig", v)} />
          </Field>}
          {!cameraObject && <>
          <Field label="Field of view"><NumInput value={cam.fov} onChange={(v, p) => set("camera.fov", v, p)} min={1} max={179} step={1} /></Field>
          <Advanced pinned={showAdvanced} label="Clipping">
            {clippingFields}
          </Advanced>
          </>}
          {cameraObject && <Advanced pinned={showAdvanced} label="Fallback camera">
            {scriptedCamera && <Field label="Orbit with gamepad"><Checkbox value={scene.defaultCameraRig !== false} onChange={(v) => set("defaultCameraRig", v)} /></Field>}
            <Field label="Field of view"><NumInput value={cam.fov} onChange={(v, p) => set("camera.fov", v, p)} min={1} max={179} step={1} /></Field>
            {clippingFields}
          </Advanced>}
        </Section>

        <Section title="Physics" icon="⬡" color={COMPONENTS.rigidbody.color} open={open.physics} onToggle={() => toggle("physics")}>
          <Field label="Enabled">
            <Checkbox value={ph.enabled} onChange={(v) => set("physics.enabled", v)} />
          </Field>
          {ph.enabled && (
            <>
              <Field label="Gravity">
                <Vec3Input value={ph.gravity} onChange={(v, p) => set("physics.gravity", v, p)} step={0.1} />
              </Field>
              <Advanced pinned={showAdvanced} label="Simulation details">
                <Field label="Step" help="Seconds per simulation step. 0.016 matches 60 Hz; large values go unstable.">
                  <NumInput value={ph.stepSize} onChange={(v, p) => set("physics.stepSize", v, p)} step={0.001} min={0.001} max={0.1} />
                </Field>
                <Field label="Iterations" help="Solver passes. Higher is more rigid and slower.">
                  <NumInput value={ph.iterations} onChange={(v, p) => set("physics.iterations", v, p)} step={1} min={1} max={100} integer />
                </Field>
                <Field label="CFM" help="Constraint force mixing — larger values make contacts softer.">
                  <NumInput value={ph.cfm} onChange={(v, p) => set("physics.cfm", v, p)} step={0.00001} min={0} />
                </Field>
                <Field label="ERP" help="Error reduction — how much penetration is corrected each step.">
                  <NumInput value={ph.erp} onChange={(v, p) => set("physics.erp", v, p)} step={0.05} min={0} max={1} />
                </Field>
              </Advanced>
            </>
          )}
        </Section>

        {(others.length > 0 || linked.size > 0) && <Section title="Scene exits" icon="⇄" color="var(--fg-dim)" open={open.links || missingExit} onToggle={() => toggle("links")}>
          {(scene.transitions || []).map((transition, index) => {
            const target = others.find(s => s.id === transition.targetSceneId);
            return <div key={transition.id || transition.targetSceneId} style={{ marginBottom: 12 }}>
            <div className="a-row" style={{ marginBottom: 6 }}>
              <span className="a-grow" style={{ fontSize: 11 }}>{target?.name || "Missing scene"}</span>
              <button
                className="a-btn a-btn--sm a-btn--ghost"
                aria-label={`Remove exit to ${target?.name || "missing scene"}`}
                onClick={() => onRemoveTransition(transition.targetSceneId)}
              >
                Remove
              </button>
            </div>
            {!target && <div className="a-field__err" role="alert">This scene no longer exists. Remove this exit.</div>}
            <Field label="Exit name">
              <TextInput value={scene.transitions[index].name} onChange={value => set(`transitions.${index}.name`, value)} />
            </Field>
            <details className="a-disclosure"><summary>Script call</summary><code className="a-mono">ctx.goToScene({JSON.stringify(transition.name)})</code></details>
            </div>;
          })}
          {unlinked.length > 0 && <Field label="Destination">
            <Select value="" onChange={id => { if (id) onAddTransition(id); }} placeholder="Add exit to…"
              options={unlinked.map(s => ({ value: s.id, label: s.name }))} />
          </Field>}
        </Section>}
      </div>
    </>
  );
}
