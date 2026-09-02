#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeRoot = path.resolve(
  websiteRoot,
  "../RLogs/plugins/games/blue-protocol-star-resonance/game-data/runtime",
);
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const localizationRoot = path.join(runtimeRoot, "localization/en-US");
const directActions = readJson(path.join(localizationRoot, "combat-action-names.v1.json"));
const reviewedActions = readJson(
  path.join(localizationRoot, "reviewed-combat-action-names.v1.json"),
);
const statusEffects = readJson(path.join(localizationRoot, "status-effect-names.v1.json"));
const rdpsEffects = readJson(
  path.join(runtimeRoot, "rdps-attribution-effect-presentation.v1.json"),
);

const actions = Object.fromEntries(directActions.actions.map(([id, name]) => [String(id), name]));
for (const [id, name] of reviewedActions.actions) actions[String(id)] = name;
const effects = Object.fromEntries(statusEffects.effects.map(([id, name]) => [String(id), name]));
for (const effect of rdpsEffects.effects) effects[String(effect.effect_id)] = effect.name;

const output = {
  schema_version: 1,
  locale: "en-US",
  game_build: rdpsEffects.game_build,
  source: "Reviewed rLogs BPSR runtime presentation catalogs",
  actions,
  effects,
};
const outputPath = path.join(websiteRoot, "public/data/bpsr/parse-presentation.en-US.v1.json");
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(output)}\n`);
console.log(`Wrote ${Object.keys(actions).length} actions and ${Object.keys(effects).length} effects to ${outputPath}`);
