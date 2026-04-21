declare module "@despia/local/vite" {
  import type { Plugin } from "vite";
  export function despiaLocalPlugin(options?: {
    outDir?: string;
    entryHtml?: string;
  }): Plugin;
}
