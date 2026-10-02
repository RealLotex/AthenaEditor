function StatusBar({ scene, selection, problems, autosavedAt, onShowProblems,
  folderName, folderNeedsReadAccess, projectFileName, onResumeFolder, dirty }) {
  const counts = countByLevel(problems);
  return <footer className="a-status" aria-label="Project status">
    <span className="a-status__item">{selection.length > 1 ? `${selection.length} objects selected`
      : selection[0]?.name || scene?.name}</span>
    <span className="a-status__spacer" />
    {folderName && folderNeedsReadAccess && <button className="a-status__btn" onClick={onResumeFolder}>Load project assets…</button>}
    {(counts.error > 0 || counts.warn > 0) && <button className="a-status__btn" onClick={onShowProblems}>
      {counts.error > 0 && <span className="a-status__error">{counts.error} error{counts.error > 1 ? "s" : ""}</span>}
      {counts.warn > 0 && <span>{counts.error ? " · " : ""}{counts.warn} warning{counts.warn > 1 ? "s" : ""}</span>}
    </button>}
    {autosavedAt && <span className="a-status__item a-dim" title={`Recovery copy updated at ${new Date(autosavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Save keeps a project file.`}>
      {projectFileName && !dirty ? `Saved · ${projectFileName}` : "Backed up in this browser"}
    </span>}
  </footer>;
}
