function UVWorkspace({ object, files, onApply }) {
  const asset = files.find((f) => f.name === object?.components.model?.file),
    texture = files.find((f) =>
      f.name === object?.components.model?.textureFile
    );
  const [mesh, setMesh] = useState(null),
    [error, setError] = useState(""),
    [selected, setSelected] = useState([]),
    [changed, setChanged] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0, scale: 1, angle: 0 });
  useEffect(() => {
    setError("");
    setSelected([]);
    setChanged(false);
    try {
      setMesh(asset?.content ? readMeshOBJ(asset.content) : null);
    } catch (e) {
      setError(e.message);
    }
  }, [object?.id, asset?.content]);
  const update = (next) => {
    setMesh(next);
    setChanged(true);
  };
  if (!object?.components.model) {
    return <Empty>Select a model in the scene to edit its UVs.</Empty>;
  }
  if (!mesh) {
    return (
      <Empty>
        {error || "UV editing supports OBJ models. Select an OBJ mesh."}
      </Empty>
    );
  }
  return (
    <div className="a-workspace">
      <div className="a-workspace__bar">
        <strong>{object.name}</strong>
        <span className="a-dim">{asset.name}</span>
        <span className="a-grow" />
        <button
          className="a-btn a-btn--primary"
          disabled={!changed}
          onClick={() => onApply(object.id, writeMeshOBJ(mesh, object.name))}
        >
          Apply UVs
        </button>
      </div>
      <div className="a-workspace__body">
        <div className="a-uv-stage">
          <svg
            viewBox="-24 -24 560 560"
            role="img"
            aria-label="UV map"
            onClick={() => setSelected([])}
          >
            <rect x="0" y="0" width="512" height="512" fill="#242b34" />
            {texture?.dataUrl && (
              <image
                href={texture.dataUrl}
                width="512"
                height="512"
                opacity=".75"
              />
            )}
            {mesh.faces.map((f, i) => (
              <polygon
                key={i}
                points={f.map((c) => mesh.uvs[c.uv] || [0, 0]).map((uv) =>
                  `${uv[0] * 512},${(1 - uv[1]) * 512}`
                ).join(" ")}
                fill={selected.includes(i) ? "#66bbff55" : "transparent"}
                stroke={selected.includes(i) ? "#fff" : "#79d1ff"}
                strokeWidth="1.2"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(
                    e.shiftKey
                      ? selected.includes(i)
                        ? selected.filter((x) => x !== i)
                        : [...selected, i]
                      : [i],
                  );
                }}
              />
            ))}
            <rect
              width="512"
              height="512"
              fill="none"
              stroke="#fff"
              strokeWidth="1"
            />
          </svg>
        </div>
        <aside className="a-workspace__options">
          <p className="a-dim">
            Click a triangle to select it. Shift-click adds to the selection.
            Transforms affect all UVs when nothing is selected.
          </p>
          <Field label="Projection" stack>
            <select
              className="a-select"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  update(
                    projectMeshUV(mesh, e.target.value),
                  );
                }
                e.target.value = "";
              }}
            >
              <option value="">Choose projection…</option>
              {["box", "xy", "xz", "yz"].map((v) => <option key={v}>{v}
              </option>)}
            </select>
          </Field>
          <button
            className="a-btn a-btn--wide"
            onClick={() => {
              try {
                update(packMeshUV(mesh, 512));
                setError("");
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            Pack triangle islands
          </button>
          <details className="a-disclosure">
            <summary>Transform UVs</summary>
            {[["x", "Horizontal offset"], ["y", "Vertical offset"], [
              "scale",
              "Scale",
            ], ["angle", "Rotation (degrees)"]].map(([k, label]) => (
              <Field key={k} label={label}>
                <input
                  className="a-input"
                  type="number"
                  step={k === "angle" ? 1 : .01}
                  value={offset[k]}
                  onChange={(e) =>
                    setOffset({ ...offset, [k]: Number(e.target.value) })}
                />
              </Field>
            ))}
            <button
              className="a-btn"
              onClick={() =>
                update(transformMeshUV(mesh, [
                  ...new Set(
                    selected.flatMap((i) => mesh.faces[i].map((c) => c.uv)),
                  ),
                ], { ...offset, angle: offset.angle * Math.PI / 180 }))}
            >
              Transform
            </button>
          </details>
          {error && <p className="a-error">{error}</p>}
        </aside>
      </div>
    </div>
  );
}

const NEW_EDITOR_SCRIPT =
  `export function init(ctx) {\n  // Runs once when the scene starts.\n}\n\nexport function update(ctx, pad) {\n  // Runs each frame.\n}\n`;

function ScriptWorkspace(
  { files, object, onSave, onAttach, onSeal, openScript },
) {
  const scripts = files.filter((f) => f.cat === "scripts"),
    [name, setName] = useState(""),
    [newName, setNewName] = useState("Player.js"),
    [message, setMessage] = useState("");
  const asset = scripts.find((f) => f.name === name),
    draft = asset?.content || "";
  useEffect(() => {
    if (!asset && scripts.length) setName(scripts[0].name);
  }, [scripts.length, name]);
  useEffect(() => {
    if (openScript?.name) setName(openScript.name);
  }, [openScript?.key]);
  const update = (text) => {
    try {
      onSave(name, text, `script:${name}`);
      setMessage("");
    } catch (e) {
      setMessage(e.message);
    }
  };
  return (
    <div className="a-workspace">
      <div className="a-workspace__bar">
        <strong>Scripts</strong>
        <span className="a-dim">{name}</span>
        <span className="a-grow" />
        {object && name && (
          <button
            className="a-btn a-btn--primary"
            onClick={() => onAttach(object.id, name)}
          >
            Attach to {object.name}
          </button>
        )}
      </div>
      <div className="a-workspace__body">
        <aside className="a-workspace__options">
          <select
            className="a-select"
            aria-label="Script"
            value={name}
            onChange={(e) => {
              onSeal?.();
              setName(e.target.value);
            }}
          >
            <option value="">Choose script…</option>
            {scripts.map((s) => <option key={s.name}>{s.name}</option>)}
          </select>
          <details className="a-disclosure" open={!scripts.length}>
            <summary>New script</summary>
            <input
              className="a-input"
              aria-label="New script name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button
              className="a-btn"
              onClick={() => {
                try {
                  if (
                    scripts.some((s) =>
                      s.name.toLowerCase() === newName.toLowerCase()
                    )
                  ) {
                    throw Error("That script already exists.");
                  }
                  onSave(newName, NEW_EDITOR_SCRIPT);
                  setName(newName);
                  setMessage("");
                } catch (e) {
                  setMessage(e.message);
                }
              }}
            >
              Create script
            </button>
          </details>
          <p className="a-dim">
            Edits are stored in this project automatically. Save the project to
            keep a copy on disk. Scripts run in the exported game.
          </p>
          <p role="status">{message}</p>
        </aside>
        {asset
          ? (
            <div className="a-script-code">
              <pre aria-hidden="true">{draft.split('\n').map((_,i)=>i+1).join('\n')}</pre>
              <textarea
                aria-label="Script code"
                spellCheck={false}
                value={draft}
                onChange={(e) => update(e.target.value)}
                onBlur={onSeal}
                onScroll={(e) => {
                  e.target.previousSibling.scrollTop = e.target.scrollTop;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Tab") {
                    e.preventDefault();
                    const el = e.target,
                      start = el.selectionStart,
                      end = el.selectionEnd;
                    update(draft.slice(0, start) + "  " + draft.slice(end));
                    requestAnimationFrame(() => {
                      el.selectionStart = el.selectionEnd = start + 2;
                    });
                  }
                }}
              />
            </div>
          )
          : <Empty>Create a script to start writing game behaviour.</Empty>}
      </div>
    </div>
  );
}
