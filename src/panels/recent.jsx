function RecentProjectsModal({ projects, onOpen, onClose }) {
  return (
    <Modal title="Recent projects" width={480} onClose={onClose}>
      {!projects.length
        ? <Empty>Open or save a project to see it here.</Empty>
        : <div className="a-recent-projects">
          {projects.map((entry) => (
            <button className="a-recent-project" key={entry.projectId} onClick={() => onOpen(entry)}>
              <strong>{entry.name}</strong>
              <span className="a-dim">{entry.handle.name}{entry.folder ? ` · ${entry.folder.name}/` : ""}</span>
            </button>
          ))}
        </div>}
    </Modal>
  );
}
