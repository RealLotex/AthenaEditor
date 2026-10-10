function InstallEditorModal({ onClose }) {
  return (
    <Modal
      title={tr("Install AthEditor")}
      onClose={onClose}
      width={450}
      footer={
        <button className="a-btn a-btn--primary" onClick={onClose}>{tr("Done")}</button>
      }
    >
      <p className="a-lead">{tr("Your editor, in its own window.")}</p>
      <p>
        {tr("Open this address in Chrome or Edge, then choose")}{" "}
        <b>{tr("Install AthEditor")}</b> {tr("from the browser's address bar or app menu.")}</p>
      <p className="a-dim">
        {tr("AthEditor will appear in your apps. Your projects and layout stay in the same browser profile.")}</p>
      <p className="a-dim">
        {tr("Use ")}<b>{tr("Start AthEditor")}</b>{" "}
        {tr("to start the local service after restarting your computer. It also enables Run in PCSX2.")}</p>
    </Modal>
  );
}
