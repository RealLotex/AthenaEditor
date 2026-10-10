function TextureToolsModal({ files, scene, onApply, onClose, initialTexture }) {
  const textures = files.filter((f) => f.cat === "textures" && f.dataUrl),
    [mode, setMode] = useState("optimize"),
    [selected, setSelected] = useState(
      initialTexture
        ? [initialTexture]
        : textures.length
        ? [textures[0].name]
        : [],
    ),
    [size, setSize] = useState(256),
    [colors, setColors] = useState(256),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState(null);
  const [linear, setLinear] = useState(true), generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setPreview(null);
  }, [mode, selected, size, colors, linear]);
  const create = async () => {
    const token = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const chosen = selected.map((name) => files.find((f) => f.name === name))
        .filter(Boolean);
      if (!chosen.length) throw Error("Choose a texture first.");
      const images = await Promise.all(
        chosen.map(async (asset) => ({
          name: asset.name,
          ...await readTexturePixels(asset),
        })),
      );
      const updates = [], outputs = [];
      if (mode === "atlas") {
        const slot = Math.floor(size / Math.ceil(Math.sqrt(images.length))) - 4;
        const fitted = images.map((img) => {
          const ratio = Math.min(1, slot / Math.max(img.width, img.height));
          return {
            name: img.name,
            ...resizeTexturePixels(
              img,
              Math.max(1, Math.floor(img.width * ratio)),
              Math.max(1, Math.floor(img.height * ratio)),
              linear,
            ),
          };
        });
        const atlas = packTextureAtlas(fitted, size),
          name = freeAssetName(files, "texture_atlas", "png");
        outputs.push(await textureOutputAsset(atlas, name, colors));
        for (const object of allObjects(scene.objects)) {
          const model = object.components.model;
          if (!model || !selected.includes(model.textureFile)) continue;
          const asset = files.find((f) => f.name === model.file);
          if (!asset?.content || !asset.name.toLowerCase().endsWith(".obj")) {
            throw Error(
              `${object.name}: atlas remapping needs an OBJ mesh with UVs.`,
            );
          }
          const rect = atlas.rectangles.find((r) =>
            r.name === model.textureFile
          );
          const mesh = remapAtlasUV(
            readMeshOBJ(asset.content),
            rect,
            atlas.width,
            atlas.height,
          );
          const meshName = freeAssetName(
            [...files, ...outputs],
            `${object.name}_atlas`,
            "obj",
          );
          outputs.push(
            textMeshAsset(meshName, writeMeshOBJ(mesh, object.name)),
          );
          updates.push({
            id: object.id,
            model: { ...model, file: meshName, textureFile: name },
          });
        }
      } else {for (const image of images) {
          const ratio = Math.min(1, size / Math.max(image.width, image.height));
          const rawWidth = Math.max(1, Math.round(image.width * ratio)),
            width = colors === 16
              ? Math.max(2, Math.floor(rawWidth / 2) * 2)
              : rawWidth,
            height = Math.max(1, Math.round(image.height * ratio));
          const name = freeAssetName(
            [...files, ...outputs],
            image.name.replace(/\.[^.]+$/, "") + "_optimized",
            "png",
          );
          outputs.push(
            await textureOutputAsset(
              resizeTexturePixels(image, width, height, linear),
              name,
              colors,
            ),
          );
          for (const object of allObjects(scene.objects)) {
            if (object.components.model?.textureFile === image.name) {
              updates.push({
                id: object.id,
                model: { ...object.components.model, textureFile: name },
              });
            }
          }
        }}
      if (token === generation.current) {
        setPreview({ outputs, updates, sceneId: scene.id, kind:mode });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={tr("Texture tools")}
      width={590}
      onClose={() => {
        generation.current++;
        onClose();
      }}
      footer={
        <>
          <span className="a-grow" />
          <button className="a-btn" onClick={onClose}>{tr("Cancel")}</button>
          {preview
            ? (
              <button
                className="a-btn a-btn--primary"
                onClick={() => {
                  onApply(preview);
                  onClose();
                }}
              >
                {tr("Use textures")}</button>
            )
            : (
              <button
                className="a-btn a-btn--primary"
                disabled={busy || !selected.length}
                onClick={create}
              >
                {busy ? tr("Processing…") : tr("Preview result")}
              </button>
            )}
        </>
      }
    >
      <Field label={tr("Task")} stack>
        <select
          className="a-select"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
        >
          <option value="optimize">{tr("Reduce texture size and colours")}</option>
          <option value="atlas">{tr("Combine textures into an atlas")}</option>
        </select>
      </Field>
      <div className="a-tool-list">
        {textures.map((f) => (
          <label key={f.name}>
            <input
              type="checkbox"
              checked={selected.includes(f.name)}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, f.name]
                    : selected.filter((n) => n !== f.name),
                )}
            />
            <img src={f.dataUrl} alt="" />
            {f.name}
          </label>
        ))}
        {!textures.length && (
          <p>{tr("Import a texture or add a primitive to use these tools.")}</p>
        )}
      </div>
      <Field label={mode === "atlas" ? tr("Atlas size") : tr("Maximum size")}>
        <select
          className="a-select"
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
        >
          {[64, 128, 256, 512, 1024].map((n) => (
            <option key={n} value={n}>{n} {tr("px")}</option>
          ))}
        </select>
      </Field>
      <details className="a-disclosure">
        <summary>{tr("Advanced options")}</summary>
        <Field label={tr("Colours")}>
          <select
            className="a-select"
            value={colors}
            onChange={(e) => setColors(Number(e.target.value))}
          >
            <option value={256}>{tr("256 (recommended)")}</option>
            <option value={16}>16</option>
          </select>
        </Field>
        {mode === "optimize" && (
          <label>
            <input
              type="checkbox"
              checked={linear}
              onChange={(e) => setLinear(e.target.checked)}
            />{" "}
            {tr("Smooth downscaling")}</label>
        )}
      </details>
      {preview && (
        <div className="a-texture-preview">
          {preview.outputs.filter((f) => f.dataUrl).map((f) => (
            <div key={f.name}>
              <img src={f.dataUrl} alt={f.name} />
              <p>
                {f.name} · {f.image.width} × {f.image.height} ·{" "}
                {fmtBytes(f.size)}
              </p>
            </div>
          ))}
          <p className="a-dim">
            {tr("Models in this scene will use the new textures. Original assets are kept.")}</p>
        </div>
      )}
      {mode === "atlas" && (
        <p className="a-dim">
          {tr("Atlas remapping supports OBJ models with UVs inside the texture square. Tiled UVs need to be adjusted first.")}</p>
      )}
      {error && <p role="alert" className="a-error">{error}</p>}
    </Modal>
  );
}

function BakeLightingModal({ scene, files, onApply, onClose }) {
  const models = exportableObjects(scene.objects).filter((o) =>
      o.components.model?.file && o.components.rigidbody?.mode !== "dynamic" &&
      !o.components.animator && !o.components.water && !o.components.particles
    ),
    [selected, setSelected] = useState(models.filter(o=>!o._terrain && o.components.rigidbody?.shape!=='plane').map((o) => o.id)),
    [size, setSize] = useState(128),
    [mode, setMode] = useState('blobs'),
    [shadows, setShadows] = useState(true),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [error, setError] = useState("");
  const abort = useRef(null);
  useEffect(() => () => abort.current?.abort(), []);
  const bake = async () => {
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError("");
    try {
      if(mode==='blobs'){
        const result=await bakeSharedShadows(scene,files,selected,{size,signal:controller.signal,onProgress:p=>setProgress(Math.round(p*100)+'%')});
        if(controller.signal.aborted)throw Error('Bake cancelled.');
        onApply(result);onClose();return;
      }
      const outputs = [], updates = [];
      for (const id of selected) {
        const object = findObj(scene.objects, id),
          asset = files.find((f) => f.name === object.components.model.file);
        if (!asset?.content || !asset.name.toLowerCase().endsWith(".obj")) {
          throw Error(
            `${object.name}: lighting baking supports static OBJ meshes.`,
          );
        }
        const result = await bakeModelLighting(
          object,
          readMeshOBJ(asset.content),
          scene,
          files,
          {
            size,
            shadows,
            signal: controller.signal,
            onProgress: (p) =>
              setProgress(`${object.name} · ${Math.round(p * 100)}%`),
          },
        );
        const meshName = freeAssetName(
            [...files, ...outputs],
            `${object.name}_baked`,
            "obj",
          ),
          textureName = freeAssetName(
            [...files, ...outputs],
            `${object.name}_lighting`,
            "png",
          );
        outputs.push(
          textMeshAsset(meshName, writeMeshOBJ(result.mesh, object.name)),
          await textureOutputAsset(result.image, textureName),
        );
        updates.push({
          id,
          model: {
            ...object.components.model,
            file: meshName,
            textureFile: textureName,
            texture_mapping: true,
            pipeline: "PL_NO_LIGHTS",
          },
          bakeSource: object._lightingBake?.model || object.components.model,
        });
      }
      if (controller.signal.aborted) throw Error("Bake cancelled.");
      onApply({ outputs, updates, sceneId: scene.id });
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={tr("Bake scene lighting and shadows")}
      width={470}
      onClose={() => {
        abort.current?.abort();
        onClose();
      }}
      footer={
        <>
          <span className="a-grow" />
          <button
            className="a-btn"
            onClick={() => {
              abort.current?.abort();
              if (!busy) onClose();
            }}
          >
            {busy ? tr("Cancel bake") : tr("Cancel")}
          </button>
          <button
            className="a-btn a-btn--primary"
            disabled={busy || !selected.length}
            onClick={bake}
          >
            {busy ? tr("Baking…") : mode==='blobs' ? tr("Generate shadows") : tr("Bake lighting")}
          </button>
        </>
      }
    >
      <Field label={tr("Mode")}><Select value={mode} onChange={setMode} options={[
        {value:'blobs',label:tr("Shared shadow blobs")}, {value:'lightmap',label:tr("Lightmap textures")},
      ]}/></Field>
      <p>{mode==='blobs'?tr("Generate soft directional silhouettes and share each image between matching instances. Receivers keep their textures."):tr("Save static lighting and shadows into your models’ textures.")}</p>
      <Field label={tr("Texture size")}><Select value={size} onChange={v=>setSize(Number(v))} options={[64,128,256,512].map(n=>({value:n,label:n+' px'}))}/></Field>
      <div className="a-tool-list">
        {models.map((o) => (
          <label key={o.id}>
            <input
              type="checkbox"
              checked={selected.includes(o.id)}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, o.id]
                    : selected.filter((id) => id !== o.id),
                )}
            />
            {o.name}
          </label>
        ))}
      </div>
      {mode==='lightmap' && <details className="a-disclosure">
        <summary>{tr("Advanced options")}</summary>

        <label>
          <input
            type="checkbox"
            checked={shadows}
            onChange={(e) => setShadows(e.target.checked)}
          />{" "}
          {tr("Include static shadows")}</label>
      </details>}
      <p className="a-dim">
        {mode==='blobs'?tr("128 px shadows use about 8 KB per unique silhouette. Position and uniform scale reuse the image; different rotations and proportions need a variant. Drape follows solid colliders."):tr("Uses ambient and directional lights. Moving objects and indirect light are not baked.")} {tr("Restore the original from the Tools menu.")}</p>
      <p role="status">{progress}</p>
      {error && <p role="alert" className="a-error">{error}</p>}
    </Modal>
  );
}
