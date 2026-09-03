import { defineConfig } from "vite";

export default defineConfig({
  // WASM is imported via the `?url` suffix; no wasm plugin required.
  // The demo is served from index.html.
});
