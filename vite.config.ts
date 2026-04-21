import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
// @ts-expect-error - @despia/local ships JS only, no type declarations
import { despiaLocalPlugin } from "@despia/local/vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    // Despia Local Server: generates /despia/local.json manifest
    // during production build so the native app can hydrate and
    // serve the web build offline from on-device localhost.
    mode !== "development" && despiaLocalPlugin({ outDir: "dist", entryHtml: "index.html" }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
