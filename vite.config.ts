import { defineConfig } from "vite";

export default defineConfig(({ command, mode }) => ({
  base:
    command === "serve" && mode === "development"
      ? "/"
      : (process.env.RLOGS_SITE_BASE ?? "/"),
  build: {
    outDir: "dist",
    sourcemap: true,
  },
}));
