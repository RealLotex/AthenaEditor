function visibleEditorControls(root, selector) {
  return [...root.querySelectorAll(selector)].filter(el => {
    if (el.matches(":disabled") || el.tabIndex < 0 || !el.getClientRects().length || el.closest('[inert], [aria-hidden="true"]')) return false;
    // Closed details can retain layout rectangles in Chromium. Their descendants
    // must never become the destination of keyboard navigation or a focus trap.
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === "DETAILS" && !parent.open && parent.querySelector("summary") !== el) return false;
    }
    return true;
  });
}

// These are temporary menus; inline disclosures such as Advanced stay open.
function bindDetailsPopovers(root, selector) {
  const doc = root.ownerDocument;
  const openMenus = () => [...root.querySelectorAll(selector)].filter(el => el.open);
  const outside = e => {
    for (const menu of openMenus()) if (!menu.contains(e.target)) menu.open = false;
  };
  const toggle = e => {
    if (!e.target.matches(selector) || !e.target.open) return;
    for (const menu of openMenus()) if (menu !== e.target) menu.open = false;
  };
  const key = e => {
    const menu = openMenus().find(el => el.contains(e.target));
    if (!menu) return;
    if (e.key === "Escape") {
      e.preventDefault(); e.stopPropagation();
      menu.open = false; menu.querySelector("summary")?.focus();
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) &&
      e.target.matches("summary, button")) {
      const controls = visibleEditorControls(menu, "summary, button, input, select");
      const at = controls.indexOf(e.target);
      const next = e.key === "Home" ? 0 : e.key === "End" ? controls.length - 1 :
        (at + (e.key === "ArrowDown" ? 1 : -1) + controls.length) % controls.length;
      e.preventDefault(); e.stopPropagation(); controls[next]?.focus();
    }
  };
  doc.addEventListener("pointerdown", outside, true);
  doc.addEventListener("focusin", outside);
  root.addEventListener("toggle", toggle, true);
  root.addEventListener("keydown", key);
  return () => {
    doc.removeEventListener("pointerdown", outside, true);
    doc.removeEventListener("focusin", outside);
    root.removeEventListener("toggle", toggle, true);
    root.removeEventListener("keydown", key);
  };
}

function useDetailsPopovers(ref, selector) {
  useEffect(() => {
    if (ref.current) return bindDetailsPopovers(ref.current, selector);
  }, [selector]);
}
