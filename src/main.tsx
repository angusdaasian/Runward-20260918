import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { preloadAllImages } from "./lib/imagePreload";

// Initialize dark mode from localStorage before render
if (localStorage.getItem("app_theme") === "dark") {
  document.documentElement.classList.add("dark");
}

// Preload critical images so they're cached before navigation
preloadAllImages();

createRoot(document.getElementById("root")!).render(<App />);
