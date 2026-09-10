import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(siteRoot, "..", "..");
const runtimeRoot = resolve(root, "plugins/games/blue-protocol-star-resonance/game-data/runtime");
const publicRoot = resolve(siteRoot, "public/data/bpsr");

const parse = readJson(resolve(publicRoot, "parse-presentation.en-US.v4.json"));
const classes = readJson(resolve(runtimeRoot, "class-localization.v1.json"));
const specializations = readJson(resolve(runtimeRoot, "specialization-localization.v1.json"));
const scenes = readJson(resolve(runtimeRoot, "localization/en-US/scene-names.v1.json"));

const output = {
  ...parse,
  schema_version: 5,
  source: `${parse.source}; trusted ROOT scene/class/specialization label catalogs`,
  scenes: Object.fromEntries(scenes.scenes.map(([id, name]) => [String(id), name])),
  classes: Object.fromEntries(classes.classes.map((entry) => [String(entry.class_id), entry.names["en-US"]])),
  specializations: specializations.locales["en-US"],
};

writeFileSync(
  resolve(publicRoot, "parse-presentation.en-US.v5.json"),
  `${JSON.stringify(output)}\n`,
  "utf8",
);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
