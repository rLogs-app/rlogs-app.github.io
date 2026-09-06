import { copyFile, cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

const pageRoutes = ["parses", "my-parses", "profiles", "users", "account", "my-account", "optimizer"] as const;

function publishPageRoutes(): Plugin {
  return {
    name: "rlogs-page-routes",
    apply: "build",
    async writeBundle(options) {
      const outputDirectory = resolve(process.cwd(), options.dir ?? "dist");
      // Keep the last published, read-only profile snapshot at a data URL that
      // cannot collide with the /profiles/ application route.
      await cp(
        resolve(outputDirectory, "profiles"),
        resolve(outputDirectory, "profile-snapshots"),
        { recursive: true },
      );
      // Vite copied the source snapshot under /profiles. Clear that directory
      // before creating the real /profiles/ application route.
      await Promise.all(
        ["fixtures", "profiles"].map((directory) =>
          rm(resolve(outputDirectory, directory), { recursive: true, force: true }),
        ),
      );
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
      await copyFile(
        resolve(outputDirectory, "index.html"),
        resolve(outputDirectory, "404.html"),
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
