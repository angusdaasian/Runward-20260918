import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Initialize dark mode from localStorage before render
if (localStorage.getItem("app_theme") === "dark") {
  document.documentElement.classList.add("dark");
}

// Keep duplicate hostnames (preview/test domains) out of the search index so
// crawl budget and ranking signals concentrate on runward.site.
{
  const host = window.location.hostname;
  const indexable =
    host === "runward.site" ||
    host === "www.runward.site" ||
    host === "localhost" ||
    host.endsWith(".lovable.app"); // lovable.app 302s to the canonical host anyway
  if (!indexable && !document.querySelector('meta[name="robots"]')) {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, follow";
    document.head.appendChild(meta);
  }
}

createRoot(document.getElementById("root")!).render(<App />);

// Defer non-critical image preloading until the browser is idle so it doesn't
// compete with JS bundle / first paint on cold start.
const idle = (cb: () => void) => {
  const w = window as any;
  if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(cb, { timeout: 3000 });
  else setTimeout(cb, 1500);
};
idle(() => {
  import("./lib/imagePreload").then(({ preloadAllImages }) => preloadAllImages());
});

