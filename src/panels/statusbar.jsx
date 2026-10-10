function StatusBar({ scene, selection, problems, autosavedAt, onShowProblems,
  folderName, folderNeedsReadAccess, projectFileName, downloadedFileName, onResumeFolder, dirty }) {
  const counts = countByLevel(problems);
  return <footer className="a-status" aria-label={tr("Project status")}>
    <span className="a-status__item">{selection.length > 1 ? `${selection.length} ${tr("objects selected")}`
      : selection[0]?.name || scene?.name}</span>
    <span className="a-status__spacer" />
    {folderName && folderNeedsReadAccess && <button className="a-status__btn" onClick={onResumeFolder}>{tr("Load project assets…")}</button>}
    {(counts.error > 0 || counts.warn > 0) && <button className="a-status__btn" onClick={onShowProblems}>
      {counts.error > 0 && <span className="a-status__error">{counts.error} {tr("error")}{counts.error > 1 ? "s" : ""}</span>}
      {counts.warn > 0 && <span>{counts.error ? " · " : ""}{counts.warn} {tr("warning")}{counts.warn > 1 ? "s" : ""}</span>}
    </button>}
    {(autosavedAt || projectFileName || downloadedFileName) && <span className="a-status__item a-dim" role="status" title={autosavedAt ? `Recovery copy updated at ${new Date(autosavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Save keeps a project file.` : undefined}>
      {!dirty && projectFileName ? `${tr("Saved")} · ${projectFileName}` : !dirty && downloadedFileName ? `${tr("Download requested")} · ${downloadedFileName}` : autosavedAt ? tr("Backed up in this browser") : tr("Unsaved changes")}
    </span>}
  </footer>;
}
