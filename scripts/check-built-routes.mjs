import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const routes = ["parses", "my-parses", "profiles", "users", "account", "my-account", "optimizer"];
const root = resolve(process.cwd(), "dist");
const rootHtml = await readFile(resolve(root, "index.html"), "utf8");
const fallbackHtml = await readFile(resolve(root, "404.html"), "utf8");
if (fallbackHtml !== rootHtml) throw new Error("Built 404 fallback does not mirror the app shell.");

for (const route of routes) {
  const routeIndex = resolve(root, route, "index.html");
  const metadata = await stat(routeIndex);
  if (!metadata.isFile()) throw new Error(`Built route /${route}/ is missing index.html.`);
  const html = await readFile(routeIndex, "utf8");
  if (html !== rootHtml) throw new Error(`Built route /${route}/ does not mirror the app shell.`);
}

const profileEntries = await readdir(resolve(root, "profiles"));
if (profileEntries.length !== 1 || profileEntries[0] !== "index.html") {
  throw new Error("The public /profiles/ route contains legacy static profile fixtures.");
}

console.log(`Verified ${routes.length} deployable page routes and no legacy profile fixtures.`);
