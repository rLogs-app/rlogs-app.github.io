#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rlogsRoot = path.resolve(websiteRoot, "../RLogs");
const tableRoot = process.env.BPSR_TABLE_DATA_DIR
  ? path.resolve(process.env.BPSR_TABLE_DATA_DIR)
  : path.join(rlogsRoot, "tmp-rdps-audit/external/BPSR-ZDPS/BPSR-ZDPS/Data");
const gameDataRoot = path.join(rlogsRoot, "plugins/games/blue-protocol-star-resonance/game-data");
const sourceIconRoot = path.join(rlogsRoot, "assets/blue-protocol-star-resonance/shared/icons");
const publicIconRoot = path.join(websiteRoot, "public/assets/bpsr/profile");

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const itemsTable = readJson(path.join(tableRoot, "ItemTable.json"));
const skillsTable = readJson(path.join(tableRoot, "SkillTable.json"));
const dungeonsTable = readJson(path.join(tableRoot, "DungeonsTable.json"));
const moduleEffectsTable = readJson(path.join(tableRoot, "ModEffectTable.json"));
const imaginePresentation = readJson(path.join(gameDataRoot, "runtime/battle-imagine-presentation.v1.json"));
const imagineNames = new Map(readJson(path.join(gameDataRoot, "runtime/localization/en-US/battle-imagine-names.v1.json")).imagines);
const moduleLocale = readJson(path.join(gameDataRoot, "catalog/localization/en-US/modules/profile-catalog.json"));

const sourceIcons = new Map();
indexIcons(sourceIconRoot);
mkdirSync(publicIconRoot, { recursive: true });

const items = Object.fromEntries(
  Object.values(itemsTable)
    .filter((item) => item.Type === 102 || (item.Type >= 200 && item.Type <= 210))
    .map((item) => [String(item.Id), {
      name: item.Name,
      quality: item.Quality,
      type: item.Type,
      icon: copyNamedIcon(item.Icon, "items"),
    }]),
);

const skills = Object.fromEntries(
  Object.values(skillsTable)
    .filter((skill) => skill.Id >= 2_000 && skill.Id < 4_000 && skill.Name)
    .map((skill) => [String(skill.Id), {
      name: skill.Name,
      icon: copyNamedIcon(skill.Icon, "skills"),
      skill_type: skill.SkillType,
    }]),
);

const dungeons = Object.fromEntries(
  Object.values(dungeonsTable)
    .filter((dungeon) => dungeon.Name)
    .map((dungeon) => [String(dungeon.Id), {
      name: dungeon.Name,
      play_type: dungeon.PlayType,
      dungeon_type_name: dungeon.DungeonTypeName,
    }]),
);

const imagines = Object.fromEntries(imaginePresentation.imagines.map((imagine) => {
  const source = path.join(rlogsRoot, "assets/blue-protocol-star-resonance/shared", imagine.icon);
  const fileName = path.basename(imagine.icon);
  const destination = path.join(publicIconRoot, "imagines", fileName);
  copy(source, destination);
  return [String(imagine.skill_id), {
    item_id: imagine.item_id,
    name: imagineNames.get(imagine.item_id) ?? `Battle Imagine ${imagine.item_id}`,
    item_tier: imagine.item_tier,
    maximum_tier: imagine.maximum_tier,
    icon: `/assets/bpsr/profile/imagines/${fileName}`,
  }];
}));

const moduleNames = {};
const moduleEffects = {};
for (const entry of moduleLocale) {
  let match = /^module\.(\d+)\.name$/.exec(entry.key);
  if (match) moduleNames[match[1]] = entry.text;
  match = /^module-effect\.(\d+)\.name$/.exec(entry.key);
  if (match) moduleEffects[match[1]] = entry.text;
}
const modules = Object.fromEntries(Object.entries(moduleNames).map(([id, name]) => {
  const item = itemsTable[id];
  return [id, {
    name,
    quality: item?.Quality ?? null,
    icon: copyIdIcon(id, "modules/items", "modules") ?? copyNamedIcon(item?.Icon, "modules"),
  }];
}));
const moduleEffectLevels = new Map();
for (const row of Object.values(moduleEffectsTable)) {
  if (!Number.isInteger(row.EffectID) || !Number.isInteger(row.Level) || row.Level <= 0) continue;
  const rows = moduleEffectLevels.get(String(row.EffectID)) ?? [];
  rows.push({ level: row.Level, enhancement_num: row.EnhancementNum });
  moduleEffectLevels.set(String(row.EffectID), rows);
}
const localizedModuleEffects = Object.fromEntries(Object.entries(moduleEffects).map(([id, name]) => [id, {
  name,
  icon: copyIdIcon(id, "modules/effects", "module-effects"),
  levels: (moduleEffectLevels.get(id) ?? []).sort((left, right) => left.level - right.level),
}]));

const catalog = {
  schema_version: 1,
  locale: "en-US",
  source: "BPSR Global Steam client localization and reviewed rLogs game-data catalogs",
  equipment_slots: {
    "200": "Weapon", "201": "Headwear", "202": "Armor", "203": "Gloves",
    "204": "Shoes", "205": "Earrings", "206": "Necklace", "207": "Ring",
    "208": "Left Bracelet", "209": "Right Bracelet", "210": "Charm",
  },
  quality_names: { "1": "Common", "2": "Uncommon", "3": "Rare", "4": "Epic", "5": "Legendary" },
  items,
  skills,
  dungeons,
  imagines,
  modules,
  module_effects: localizedModuleEffects,
};

const output = path.join(websiteRoot, "public/data/bpsr/profile-presentation.en-US.v1.json");
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(catalog)}\n`);
console.log(`wrote ${output}`);
console.log(`${Object.keys(items).length} items, ${Object.keys(skills).length} skills, ${Object.keys(dungeons).length} dungeons, ${Object.keys(imagines).length} imagines`);

function indexIcons(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) indexIcons(file);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) {
      const key = path.basename(entry.name, ".png").toLowerCase();
      if (!sourceIcons.has(key)) sourceIcons.set(key, file);
    }
  }
}

function copyNamedIcon(icon, category) {
  if (typeof icon !== "string" || !icon) return null;
  const baseName = path.basename(icon).replace(/\.png$/i, "");
  const source = sourceIcons.get(baseName.toLowerCase());
  if (!source) return null;
  const destination = path.join(publicIconRoot, category, `${baseName}.png`);
  copy(source, destination);
  return `/assets/bpsr/profile/${category}/${baseName}.png`;
}

function copyIdIcon(id, sourceCategory, destinationCategory) {
  const sourceDirectory = path.join(sourceIconRoot, sourceCategory);
  if (!existsSync(sourceDirectory)) return null;
  const sourceName = readdirSync(sourceDirectory).find((name) => name.startsWith(`${id}-`) && name.endsWith(".png"));
  if (!sourceName) return null;
  const destination = path.join(publicIconRoot, destinationCategory, sourceName);
  copy(path.join(sourceDirectory, sourceName), destination);
  return `/assets/bpsr/profile/${destinationCategory}/${sourceName}`;
}

function copy(source, destination) {
  if (!existsSync(source)) return;
  mkdirSync(path.dirname(destination), { recursive: true });
  cpSync(source, destination);
}
