function InstallEditorModal({ onClose }) {
  return (
    <Modal
      title="Install AthEditor"
      onClose={onClose}
      width={450}
      footer={
        <button className="a-btn a-btn--primary" onClick={onClose}>Done</button>
      }
    >
      <p className="a-lead">Your editor, in its own window.</p>
      <p>
        Open this address in Chrome or Edge, then choose{" "}
        <b>Install AthEditor</b> from the browser's address bar or app menu.
      </p>
      <p className="a-dim">
        AthEditor will appear in your apps. Your projects and layout stay in the
        same browser profile.
      </p>
      <p className="a-dim">
        Use <b>Start AthEditor</b>{" "}
        to start the local service after restarting your computer. It also
        enables Run in PCSX2.
      </p>
    </Modal>
  );
}
