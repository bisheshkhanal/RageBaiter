import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const manifestPath =
    mode === "development" ? "./public/manifest.dev.json" : "./public/manifest.prod.json";

  const manifest = require(path.join(__dirname, manifestPath));

  return {
    plugins: [react(), crx({ manifest })],
    build: {
      rollupOptions: {
        input: {
          popup: "src/popup/popup.html",
          sidepanel: "src/sidepanel/sidepanel.html",
        },
      },
      outDir: "dist",
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      strictPort: true,
      hmr: {
        port: 5173,
      },
    },
  };
});
