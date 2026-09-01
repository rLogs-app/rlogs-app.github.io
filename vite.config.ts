import { copyFile, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

// Keep the retired Profile Lab URL as a redirect target for older desktop receipts.
const pageRoutes = ["parses", "account", "optimizer", "profile-lab"] as const;

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
      await Promise.all(
        ["fixtures", "profiles"].map((directory) =>
          rm(resolve(outputDirectory, directory), { recursive: true, force: true }),
        ),
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
