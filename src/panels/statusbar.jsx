function StatusBar({ scene, selection, problems, autosavedAt, onShowProblems,
  folderName, folderNeedsReadAccess, projectFileName, onResumeFolder, onSave, dirty }) {
  const counts = countByLevel(problems);
  return <footer className="a-status" aria-label="Project status">
    <span className="a-status__item">{selection.length > 1 ? `${selection.length} selected`
      : selection[0]?.name || `${allObjects(scene?.objects || []).length} objects`}</span>
    <span className="a-status__spacer" />
    {folderName && folderNeedsReadAccess && <button className="a-status__btn" onClick={onResumeFolder}>Load project assets…</button>}
    {(counts.error > 0 || counts.warn > 0) && <button className="a-status__btn" onClick={onShowProblems}>
      {counts.error > 0 && <span className="a-status__error">{counts.error} error{counts.error > 1 ? "s" : ""}</span>}
      {counts.warn > 0 && <span>{counts.error ? " · " : ""}{counts.warn} warning{counts.warn > 1 ? "s" : ""}</span>}
    </button>}
    {autosavedAt && <span className="a-status__item a-dim" title="Automatic recovery copy in this browser">
      Browser backup · {new Date(autosavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
    </span>}
    <button className="a-status__btn" onClick={() => onSave()} title={projectFileName || "Save a portable project file"}>
      {dirty ? "Save changes…" : projectFileName ? "Saved to file" : "Save project…"}
    </button>
  </footer>;
}
