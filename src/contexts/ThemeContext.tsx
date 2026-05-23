import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type Palette = "classic" | "modern";

interface ThemeContextValue {
  palette: Palette;
  setPalette: (p: Palette) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  palette: "classic",
  setPalette: () => {},
});

function readInitial(): Palette {
  if (typeof window === "undefined") return "classic";
  return localStorage.getItem("app_palette") === "modern" ? "modern" : "classic";
}

function applyPalette(p: Palette) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (p === "modern") {
    root.classList.add("theme-modern");
    // Modern is an OLED-style dark aesthetic — force dark regardless of app_theme
    root.classList.add("dark");
  } else {
    root.classList.remove("theme-modern");
    // Restore user's dark-mode preference for Classic
    if (localStorage.getItem("app_theme") === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }
}

// Apply immediately to avoid FOUC
applyPalette(readInitial());

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [palette, setPaletteState] = useState<Palette>(readInitial);

  useEffect(() => {
    applyPalette(palette);
    localStorage.setItem("app_palette", palette);
  }, [palette]);

  return (
    <ThemeContext.Provider value={{ palette, setPalette: setPaletteState }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
