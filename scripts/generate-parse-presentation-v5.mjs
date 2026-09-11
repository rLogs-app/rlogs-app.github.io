import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { reviewedEnglishLabel } from "./lib/parse-presentation-labels.mjs";

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = [
  process.env.RLOGS_SOURCE_ROOT,
  resolve(siteRoot, "..", ".."),
  resolve(siteRoot, "..", "RLogs"),
].filter(Boolean).find((candidate) => existsSync(join(
  candidate,
  "plugins/games/blue-protocol-star-resonance/game-data/runtime",
)));
if (!root) {
  throw new Error("Set RLOGS_SOURCE_ROOT to an RLogs checkout containing the BPSR game-data runtime.");
}
const runtimeRoot = resolve(root, "plugins/games/blue-protocol-star-resonance/game-data/runtime");
const catalogRoot = resolve(root, "plugins/games/blue-protocol-star-resonance/game-data/catalog");
const publicRoot = resolve(siteRoot, "public/data/bpsr");

const parse = readJson(resolve(publicRoot, "parse-presentation.en-US.v4.json"));
const classes = readJson(resolve(runtimeRoot, "class-localization.v1.json"));
const specializations = readJson(resolve(runtimeRoot, "specialization-localization.v1.json"));
const scenes = readJson(resolve(runtimeRoot, "localization/en-US/scene-names.v1.json"));
const auxiliaryActions = readJson(resolve(runtimeRoot, "localization/en-US/auxiliary-action-names.v1.json"));
const observation = readJson(resolve(siteRoot, "scripts/data/public-parse-action-observation.v1.json"));
const currentRecount = readJson(resolve(catalogRoot, "combat-actions/current-build-recount.v1.json"));
const profilePresentation = readJson(resolve(publicRoot, "profile-presentation.en-US.v1.json"));

if (
  observation.schema_version !== 1 ||
  !Array.isArray(observation.action_ids) ||
  new Set(observation.action_ids).size !== observation.action_ids.length
) {
  throw new Error("The public parse action observation must contain unique stable IDs.");
}

const localizedEntries = new Map();
for (const localeFile of [
  ...jsonFiles(resolve(catalogRoot, "localization/en-US/recount-groups")),
  ...jsonFiles(resolve(catalogRoot, "localization/en-US/skills")),
]) {
  for (const entry of readJson(localeFile)) {
    const label = reviewedEnglishLabel(entry.text);
    if (!label) continue;
    const labels = localizedEntries.get(entry.key) ?? new Set();
    labels.add(label);
    localizedEntries.set(entry.key, labels);
  }
}

const candidates = new Map();
const offer = (id, localizationKey) => {
  const localizedLabels = localizedEntries.get(localizationKey);
  if (!localizedLabels) return;
  const labels = candidates.get(String(id)) ?? new Set();
  for (const label of localizedLabels) labels.add(label);
  candidates.set(String(id), labels);
};
for (const action of currentRecount.actions ?? []) {
  offer(action.ability_id, action.localization_key);
  const damageIds = action.relation?.match(/:\s*([\d, ]+)$/u)?.[1]?.match(/\d+/gu) ?? [];
  for (const damageId of damageIds) offer(damageId, action.localization_key);
}
for (const file of jsonFiles(resolve(catalogRoot, "recount-groups"))) {
  const entity = readJson(file);
  for (const damageId of entity.attributes?.damage_ids ?? []) {
    offer(damageId, entity.localization_key);
  }
}
for (const file of jsonFiles(resolve(catalogRoot, "skills"))) {
  const entity = readJson(file);
  for (const skillEffectId of entity.attributes?.skill_effect_ids ?? []) {
    offer(skillEffectId, entity.localization_key);
  }
}
for (const [id, label] of Object.entries(parse.imagines)) {
  const labels = candidates.get(id) ?? new Set();
  labels.add(label);
  candidates.set(id, labels);
}
for (const [id, label] of auxiliaryActions.skills ?? []) {
  const reviewed = reviewedEnglishLabel(label);
  if (!reviewed) continue;
  const labels = candidates.get(String(id)) ?? new Set();
  labels.add(reviewed);
  candidates.set(String(id), labels);
}

const actions = { ...parse.actions };
const trustedEnrichmentIds = [];
const conflictingActionIds = [];
for (const id of observation.action_ids) {
  if (actions[id]) continue;
  const labels = [...(candidates.get(id) ?? [])];
  if (labels.length === 1) {
    actions[id] = labels[0];
    trustedEnrichmentIds.push(id);
  } else if (labels.length > 1) {
    conflictingActionIds.push(id);
  }
}
const uncoveredActionIds = observation.action_ids.filter((id) => !actions[id]);
const actionIcons = Object.fromEntries(Object.entries(profilePresentation.skills ?? {}).flatMap(([id, skill]) =>
  typeof skill?.icon === "string" && /^\/assets\/bpsr\/profile\/skills\/[A-Za-z0-9._-]+$/u.test(skill.icon)
    ? [[id, skill.icon]] : []));

const output = {
  ...parse,
  schema_version: 5,
  source: `${parse.source}; trusted ROOT scene/class/specialization, recount, skill-effect, auxiliary-action, and Battle Imagine label relationships`,
  coverage: {
    ...parse.coverage,
    scope: "captured-public-api-action-ids-with-trusted-root-label-reconciliation",
    saved_history_observed_action_count: parse.coverage.observed_action_count,
    saved_history_localized_observed_action_count: parse.coverage.localized_observed_action_count,
    observed_action_count: observation.action_ids.length,
    localized_observed_action_count: observation.action_ids.length - uncoveredActionIds.length,
    uncovered_action_ids: uncoveredActionIds,
    reviewed_action_count: Object.keys(actions).length,
    trusted_enrichment_count: trustedEnrichmentIds.length,
    trusted_enrichment_action_ids: trustedEnrichmentIds,
    conflicting_action_ids: conflictingActionIds,
    public_action_observation: {
      captured_at: observation.captured_at,
      list_endpoint: observation.list_endpoint,
      report_detail_endpoint_template: observation.report_detail_endpoint_template,
      report_count: observation.report_count,
    },
  },
  actions,
  action_icons: actionIcons,
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

function jsonFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? jsonFiles(path) : entry.name.endsWith(".json") ? [path] : [];
  });
}
