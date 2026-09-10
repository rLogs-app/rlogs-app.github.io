#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { reviewedEnglishLabel } from "./lib/parse-presentation-labels.mjs";

const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = [
  process.env.RLOGS_SOURCE_ROOT,
  path.resolve(websiteRoot, "../.."),
  path.resolve(websiteRoot, "../RLogs"),
].filter(Boolean).find((candidate) => existsSync(path.join(
  candidate,
  "plugins/games/blue-protocol-star-resonance/game-data/runtime",
)));
if (!sourceRoot) {
  throw new Error("Set RLOGS_SOURCE_ROOT to an RLogs checkout containing the BPSR game-data runtime.");
}
const runtimeRoot = path.join(
  sourceRoot,
  "plugins/games/blue-protocol-star-resonance/game-data/runtime",
);
const gameDataRoot = path.dirname(runtimeRoot);
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const localizationRoot = path.join(runtimeRoot, "localization/en-US");
const reviewedActions = readJson(
  path.join(localizationRoot, "reviewed-combat-action-names.v1.json"),
);
const rdpsEffects = readJson(
  path.join(runtimeRoot, "rdps-attribution-effect-presentation.v1.json"),
);
const observedCatalogRoot = path.join(gameDataRoot, "catalog/combat-actions");
const observedCoverage = readJson(
  path.join(observedCatalogRoot, "observed-presentation-coverage.v1.json"),
);
if (
  typeof rdpsEffects.deployment_id !== "string" ||
  rdpsEffects.deployment_id.length === 0 ||
  typeof rdpsEffects.game_build !== "string" ||
  rdpsEffects.game_build.length === 0
) {
  throw new Error("The parse presentation source must declare an exact deployment and game build.");
}

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const observedIds = new Set();
for (const source of observedCoverage.sources ?? []) {
  const sourcePath = path.join(observedCatalogRoot, source.path);
  if (sha256(sourcePath) !== source.sha256) {
    throw new Error(`Observed action source digest is stale: ${source.path}`);
  }
  const catalog = readJson(sourcePath);
  for (const action of catalog.actions ?? []) observedIds.add(String(action.ability_id));
}

const actions = {};
const rejectedReviewedActionIds = [];
for (const [rawId, rawName] of reviewedActions.actions) {
  const id = String(rawId);
  const label = reviewedEnglishLabel(rawName);
  if (label) actions[id] = label;
  else rejectedReviewedActionIds.push(id);
}
if (rejectedReviewedActionIds.length > 0) {
  throw new Error(`Reviewed action presentation contains unsafe labels for ${rejectedReviewedActionIds.join(", ")}.`);
}
const uncoveredActionIds = [];
for (const id of [...observedIds].sort((left, right) => Number(left) - Number(right))) {
  if (!actions[id]) uncoveredActionIds.push(id);
}
if (
  observedCoverage.deployment_id !== rdpsEffects.deployment_id ||
  String(observedCoverage.game_build) !== rdpsEffects.game_build ||
  observedIds.size !== observedCoverage.summary?.observed_action_count ||
  uncoveredActionIds.length > 0
) {
  throw new Error(
    `Observed parse action presentation is incomplete for ${uncoveredActionIds.join(", ") || "the declared coverage contract"}.`,
  );
}

const effects = {};
const uncoveredEffectIds = [];
for (const effect of rdpsEffects.effects) {
  const id = String(effect.effect_id);
  const label = reviewedEnglishLabel(effect.name);
  if (label) effects[id] = label;
  else uncoveredEffectIds.push(id);
}
if (uncoveredEffectIds.length > 0) {
  throw new Error(`Reviewed rDPS effect presentation is incomplete for ${uncoveredEffectIds.join(", ")}.`);
}

const output = {
  schema_version: 1,
  locale: "en-US",
  deployment_id: rdpsEffects.deployment_id,
  game_build: rdpsEffects.game_build,
  source: "Reviewed observed rLogs BPSR presentation catalogs",
  coverage: {
    scope: observedCoverage.scope,
    observed_action_count: observedIds.size,
    localized_observed_action_count: observedIds.size - uncoveredActionIds.length,
    uncovered_action_ids: uncoveredActionIds,
    reviewed_action_count: Object.keys(actions).length,
    rdps_effect_count: rdpsEffects.effects.length,
    localized_rdps_effect_count: Object.keys(effects).length,
    uncovered_rdps_effect_ids: uncoveredEffectIds,
  },
  actions,
  effects,
};
const outputPath = path.join(websiteRoot, "public/data/bpsr/parse-presentation.en-US.v1.json");
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(output)}\n`);
console.log(`Wrote ${Object.keys(actions).length} actions and ${Object.keys(effects).length} effects to ${outputPath}`);
