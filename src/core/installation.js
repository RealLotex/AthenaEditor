function useEditorInstallation() {
  const hosted = !!document.querySelector?.('meta[name="atheditor-app"]');
  const [installed, setInstalled] = useState(() =>
    !!window.matchMedia?.("(display-mode: standalone)").matches
  );
  const promptRef = useRef(null);
  useEffect(() => {
    if (!hosted) return;
    const ready = (event) => {
      event.preventDefault();
      promptRef.current = event;
    };
    const done = () => {
      promptRef.current = null;
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", done);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/service-worker.js", {
        updateViaCache: "none",
      })
        .catch((error) => console.warn("AthEditor offline setup:", error));
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", ready);
      window.removeEventListener("appinstalled", done);
    };
  }, [hosted]);
  return {
    available: hosted && !installed,
    async install(fallback) {
      const prompt = promptRef.current;
      if (!prompt) {
        fallback();
        return;
      }
      promptRef.current = null;
      try {
        // Called directly from the click, while browser user activation is live.
        await prompt.prompt();
        if ((await prompt.userChoice).outcome === "accepted") {
          setInstalled(true);
        }
      } catch {
        fallback();
      }
    },
  };
}
