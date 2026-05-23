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
  const stored = localStorage.getItem("app_palette");
  return stored === "modern" ? "modern" : "classic";
}

// Apply class as early as possible to avoid FOUC.
if (typeof document !== "undefined") {
  const initial = readInitial();
  if (initial === "modern") document.documentElement.classList.add("theme-modern");
  else document.documentElement.classList.remove("theme-modern");
}

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [palette, setPaletteState] = useState<Palette>(readInitial);

  useEffect(() => {
    if (palette === "modern") {
      document.documentElement.classList.add("theme-modern");
    } else {
      document.documentElement.classList.remove("theme-modern");
    }
    localStorage.setItem("app_palette", palette);
  }, [palette]);

  return (
    <ThemeContext.Provider value={{ palette, setPalette: setPaletteState }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
