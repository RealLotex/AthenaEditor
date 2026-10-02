function downloadEditorFile(file) {
  const url = URL.createObjectURL(file), link = document.createElement("a");
  link.href = url; link.download = file.name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Called directly by the final Share button, with a prepared File so transient
// browser activation is not spent waiting for encoding or export generation.
async function shareEditorFile(file, sourceWindow = window) {
  const nav = sourceWindow.navigator;
  if (!nav?.share || !nav.canShare?.({ files: [file] })) {
    downloadEditorFile(file);
    return "downloaded";
  }
  try {
    await nav.share({ files: [file], title: file.name });
    return "shared";
  } catch (error) {
    if (error.name === "AbortError") return "cancelled";
    throw error; // The dialog offers Download even if OS sharing fails.
  }
}

async function receiveSharedImages(id, onImport) {
  if (!/^[a-z0-9-]{20,80}$/i.test(id)) return false;
  const consume = async () => {
    const response = await fetch(`/__shared-images/${id}`, { cache: "no-store" });
    if (response.status === 404 || response.status === 409) return false;
    if (!response.ok) throw Error("Shared images could not be read.");
    const files = (await response.formData()).getAll("images").filter((file) => file instanceof File);
    if (!files.length || !(await onImport({ files }, "Textures/Shared", { receiptId: id }))) return false;
    // Keep queued files on import failure/project replacement; remove only once
    // their bytes are embedded in the project and its normal undo history.
    const acknowledged = await fetch(`/__shared-images/${id}`, { method: "DELETE" });
    if (!acknowledged.ok) throw Error("Images were imported, but their receipt could not be cleared.");
    return true;
  };
  return navigator.locks?.request ? navigator.locks.request(`atheditor-share-${id}`, consume) : consume();
}
