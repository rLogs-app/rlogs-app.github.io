import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

const pageRoutes = ["parses", "account", "profile-lab", "optimizer"] as const;

function publishPageRoutes(): Plugin {
  return {
    name: "rlogs-page-routes",
    apply: "build",
    async writeBundle(options) {
      const outputDirectory = resolve(process.cwd(), options.dir ?? "dist");
      await Promise.all(
        pageRoutes.map(async (route) => {
          const routeDirectory = resolve(outputDirectory, route);
          await mkdir(routeDirectory, { recursive: true });
          await copyFile(
            resolve(outputDirectory, "index.html"),
            resolve(routeDirectory, "index.html"),
          );
        }),
      );
    },
  };
}

export default defineConfig(({ command, mode }) => ({
  plugins: [publishPageRoutes()],
  base:
    command === "serve" && mode === "development"
      ? "/"
      : (process.env.RLOGS_SITE_BASE ?? "/"),
  build: {
    outDir: "dist",
    sourcemap: true,
  },
}));
