// Native panel windows share the existing React portal host. There is one
// project, one undo stack and one autosave, regardless of the window count.
function openPanelWindow(sourceWindow, sourceDocument, name, title, callbacks) {
  const popup = sourceWindow.open("about:blank", `atheditor-panel-${name}`, "popup,width=640,height=600");
  if (!popup) throw Error("Allow pop-up windows to open a panel outside the editor.");
  const cleanup = [];
  try {
    const doc = popup.document;
    doc.title = title;
    doc.documentElement.setAttribute("data-theme", sourceDocument.documentElement.getAttribute("data-theme") || "dark");
    for (const style of sourceDocument.querySelectorAll('style,link[rel="stylesheet"]')) doc.head.appendChild(style.cloneNode(true));
    doc.body.replaceChildren();
    doc.body.className = "a-native-panel";
    const header = doc.createElement("header");
    header.className = "a-native-panel-header";
    const label = doc.createElement("strong");
    label.textContent = DOCK_PANELS[name];
    header.appendChild(label);
    const dock = doc.createElement("button");
    dock.className = "a-btn a-btn--ghost";
    dock.textContent = "Return to editor";
    dock.onclick = callbacks.onClose;
    header.appendChild(dock);
    if (typeof popup.getScreenDetails === "function" && popup.screen?.isExtended !== false) {
      const monitors = doc.createElement("button");
      monitors.className = "a-btn a-btn--ghost";
      monitors.textContent = "Choose screen…";
      monitors.onclick = async () => {
        try {
          const details = await popup.getScreenDetails();
          const choose = doc.createElement("select");
          choose.className = "a-select";
          choose.setAttribute("aria-label", "Screen for this panel");
          const refreshScreens = () => {
            choose.replaceChildren();
            details.screens.forEach((screen, index) => {
              const option = doc.createElement("option");
              option.value = index;
              option.textContent = screen.label || `Screen ${index + 1}`;
              option.selected = screen === details.currentScreen;
              choose.appendChild(option);
            });
          };
          refreshScreens();
          details.addEventListener?.("screenschange", refreshScreens);
          details.addEventListener?.("currentscreenchange", refreshScreens);
          cleanup.push(() => {
            details.removeEventListener?.("screenschange", refreshScreens);
            details.removeEventListener?.("currentscreenchange", refreshScreens);
          });
          choose.onchange = () => {
            const screen = details.screens[Number(choose.value)];
            if (!screen) return;
            popup.moveTo(screen.availLeft, screen.availTop);
            popup.resizeTo(Math.min(800, screen.availWidth), Math.min(700, screen.availHeight));
          };
          monitors.replaceWith(choose);
        } catch (error) {
          // Declining screen access keeps the ordinary movable native window.
          if (error.name !== "NotAllowedError" && error.name !== "AbortError") callbacks.onError?.(error);
        }
      };
      header.appendChild(monitors);
    }
    const slot = doc.createElement("main");
    slot.className = "a-native-panel-content";
    doc.body.append(header, slot);
    popup.addEventListener("pagehide", callbacks.onClose);
    popup.addEventListener("keydown", callbacks.onKey);
    if (callbacks.onCopy) popup.addEventListener("copy", callbacks.onCopy);
    if (callbacks.onPaste) popup.addEventListener("paste", callbacks.onPaste);
    popup.addEventListener("focus", callbacks.onFocus);
    doc.addEventListener("pointerdown", callbacks.onFocus, true);
    popup.focus();
    return {
      window: popup, slot,
      dispose() {
        cleanup.forEach((dispose) => dispose());
        popup.removeEventListener("pagehide", callbacks.onClose);
        popup.removeEventListener("keydown", callbacks.onKey);
        if (callbacks.onCopy) popup.removeEventListener("copy", callbacks.onCopy);
        if (callbacks.onPaste) popup.removeEventListener("paste", callbacks.onPaste);
        popup.removeEventListener("focus", callbacks.onFocus);
        doc.removeEventListener("pointerdown", callbacks.onFocus, true);
        if (!popup.closed) popup.close();
      },
    };
  } catch (error) { popup.close(); throw error; }
}

function notifyPanelWindow(host) {
  const view = host.ownerDocument.defaultView;
  host.dispatchEvent(new view.Event("atheditor-window-change"));
}
