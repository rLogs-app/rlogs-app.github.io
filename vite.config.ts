import { copyFile, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

const pageRoutes = ["leaderboards", "parses", "my-parses", "profiles", "users", "account", "my-account", "optimizer"] as const;

function publishPageRoutes(): Plugin {
  return {
    name: "rlogs-page-routes",
    apply: "build",
    async writeBundle(options) {
      const outputDirectory = resolve(process.cwd(), options.dir ?? "dist");
      // The source /profiles data is a historical developer fixture, not a
      // production backup. Never publish it as current profile data.
      await Promise.all(
        ["fixtures", "profiles", "profile-snapshots"].map((directory) =>
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
