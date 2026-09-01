#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rlogsRoot = path.resolve(websiteRoot, "../RLogs");
const tableRoot = process.env.BPSR_TABLE_DATA_DIR
  ? path.resolve(process.env.BPSR_TABLE_DATA_DIR)
  : path.join(rlogsRoot, "Excels");
const gameDataRoot = path.join(rlogsRoot, "plugins/games/blue-protocol-star-resonance/game-data");
const runtimeManifest = readJson(path.join(gameDataRoot, "runtime/rdps-formula-runtime.v1.json"));
const sourceBuildId = process.env.BPSR_TABLE_BUILD_ID ?? runtimeManifest.game_build;
const talentCatalogRoot = path.join(gameDataRoot, "catalog/talents");
const talentLocaleRoot = path.join(gameDataRoot, "catalog/localization/en-US/talents");
const sourceIconRoot = path.join(rlogsRoot, "assets/blue-protocol-star-resonance/shared/icons");
const publicIconRoot = path.join(websiteRoot, "public/assets/bpsr/profile");

const itemsTablePath = path.join(tableRoot, "ItemTable.json");
const itemsTable = readJson(itemsTablePath);
const skillsTable = readJson(path.join(tableRoot, "SkillTable.json"));
const dungeonsTable = readJson(path.join(tableRoot, "DungeonsTable.json"));
const achievementsTablePath = path.join(tableRoot, "AchievementDateTable.json");
const achievementsTable = readJson(achievementsTablePath);
const moduleEffectsTable = readJson(path.join(tableRoot, "ModEffectTable.json"));
const equipmentAttributesTable = readJson(path.join(tableRoot, "EquipAttrLibTable.json"));
const equipmentSchoolAttributesTable = readJson(path.join(tableRoot, "EquipAttrSchoolLibTable.json"));
const enchantmentItemsTable = readJson(
  existsSync(path.join(tableRoot, "EquipEnchantItemTable.json"))
    ? path.join(tableRoot, "EquipEnchantItemTable.json")
    : path.join(rlogsRoot, "Excels/EquipEnchantItemTable.json"),
);
const fightAttributesTable = readJson(path.join(tableRoot, "FightAttrTable.json"));
const attributeDescriptionsTable = readJson(path.join(tableRoot, "AttrDescription.json"));
const imaginePresentation = readJson(path.join(gameDataRoot, "runtime/battle-imagine-presentation.v1.json"));
const imagineNames = new Map(readJson(path.join(gameDataRoot, "runtime/localization/en-US/battle-imagine-names.v1.json")).imagines);
const moduleLocale = readJson(path.join(gameDataRoot, "catalog/localization/en-US/modules/profile-catalog.json"));
const talentLocale = new Map(
  readJsonFiles(talentLocaleRoot)
    .flatMap((file) => readJson(file))
    .filter((entry) => typeof entry?.key === "string" && typeof entry?.text === "string")
    .map((entry) => [entry.key, entry.text]),
);

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
const missingSigilIcons = Object.values(itemsTable)
  .filter((item) => typeof item.Icon === "string" && item.Icon.toLowerCase().startsWith("item_icons_enchantformula"))
  .filter((item) => !items[String(item.Id)]?.icon)
  .map((item) => `${item.Id}:${item.Icon ?? "no-icon-key"}`);
if (missingSigilIcons.length) {
  throw new Error(`Missing ${missingSigilIcons.length} sigil icons: ${missingSigilIcons.join(", ")}`);
}

const fightAttributeByMemberId = new Map();
for (const row of Object.values(fightAttributesTable)) {
  for (const member of [row.AttrFinal, row.AttrTotal, row.AttrAdd, row.AttrExAdd, row.AttrPer, row.AttrExPer]) {
    if (Number.isInteger(member)) fightAttributeByMemberId.set(member, row);
  }
}
const equipmentAttributes = Object.fromEntries(
  [...Object.values(equipmentAttributesTable), ...Object.values(equipmentSchoolAttributesTable)]
    .filter((row) => Number.isInteger(row.Id))
    .map((row) => {
      const effectIds = (row.AttrEffect ?? [])
        .flatMap((effect) => Array.isArray(effect) ? effect.slice(1) : [])
        .filter((id) => Number.isInteger(id));
      const names = effectIds
        .flatMap((id) => [
          fightAttributeByMemberId.get(id)?.OfficialName,
          cleanAttributeDescription(attributeDescriptionsTable[String(id)]?.Description),
        ])
        .filter((name) => typeof name === "string" && name.trim())
        .filter((name, index, all) => all.indexOf(name) === index);
      return [String(row.Id), {
        name: names.length ? names.join(" + ") : `Equipment attribute ${row.Id}`,
        effects: names,
        attribute_library_id: row.AttrLibId ?? null,
      }];
    }),
);

const sigils = {};
for (const row of Object.values(enchantmentItemsTable)) {
  if (!Number.isInteger(row.EnchantItemTypeId) || !Number.isInteger(row.EnchantItemLevel)) continue;
  const baseItem = itemsTable[String(row.EnchantItemTypeId)];
  const levelItem = itemsTable[String(row.Id)];
  if (
    baseItem?.Type !== 102 ||
    levelItem?.Type !== 102 ||
    typeof baseItem.Icon !== "string" ||
    !baseItem.Icon.toLowerCase().startsWith("item_icons_enchantformula")
  ) continue;
  const effects = (row.EnchantItemEffect ?? []).map((effect, index) => {
    const attributeId = Array.isArray(effect) ? effect[1] : undefined;
    const attribute = fightAttributeByMemberId.get(attributeId);
    const value = Array.isArray(row.EnchantItemPar?.[index]) ? row.EnchantItemPar[index][0] : undefined;
    return {
      attribute_id: attributeId,
      name: attribute?.OfficialName ?? cleanAttributeDescription(attributeDescriptionsTable[String(attributeId)]?.Description) ?? `Attribute ${attributeId}`,
      value,
    };
  }).filter((effect) => Number.isInteger(effect.attribute_id) && Number.isFinite(effect.value));
  (sigils[String(row.EnchantItemTypeId)] ??= []).push({
    level: row.EnchantItemLevel,
    item_id: row.Id,
    name: levelItem.Name,
    quality: levelItem.Quality,
    icon: copyNamedIcon(levelItem.Icon, "items"),
    effects,
  });
}
for (const levels of Object.values(sigils)) levels.sort((left, right) => left.level - right.level);
const missingSigilLevelIcons = Object.entries(sigils)
  .flatMap(([baseId, levels]) => levels.filter((level) => !level.icon).map((level) => `${baseId}:level-${level.level}`));
if (missingSigilLevelIcons.length) {
  throw new Error(`Missing ${missingSigilLevelIcons.length} leveled sigil icons: ${missingSigilLevelIcons.join(", ")}`);
}

const skills = Object.fromEntries(
  Object.values(skillsTable)
    .filter((skill) => skill.Id >= 2_000 && skill.Id < 4_000 && skill.Name)
    .map((skill) => [String(skill.Id), {
      name: skill.Name,
      icon: copyNamedIcon(skill.Icon, "skills"),
      skill_type: skill.SkillType,
    }]),
);

const titles = Object.fromEntries(
  Object.values(itemsTable)
    .filter((item) => item.Type === 906 && item.Name)
    .map((item) => [String(item.Id), {
      name: item.Name.replace(/^Title\s*-\s*/i, ""),
      quality: item.Quality,
      icon: copyNamedIcon(item.Icon, "titles"),
    }]),
);

const talents = {};
const talentNodes = {};
for (const file of readJsonFiles(talentCatalogRoot)) {
  const talent = readJson(file);
  if (talent?.kind !== "talent" || !Number.isInteger(talent.id)) continue;
  const attributes = talent.attributes ?? {};
  talents[String(talent.id)] = {
    name: talentLocale.get(talent.localization_key) ?? talentLocale.get(`talent.${talent.id}.name`) ?? `Unknown talent ${talent.id}`,
    icon: copyNamedIcon(talent.icon, "talents"),
    profession_id: attributes.profession_id ?? null,
    talent_type: attributes.talent_type ?? null,
    talent_level: attributes.talent_level ?? null,
  };
  for (const node of attributes.tree_nodes ?? []) {
    if (!Number.isInteger(node?.node_id)) continue;
    talentNodes[String(node.node_id)] = {
      talent_id: talent.id,
      profession_id: node.profession_id ?? attributes.profession_id ?? null,
      specialization_id: node.specialization_id ?? null,
    };
  }
}

const dungeons = Object.fromEntries(
  Object.values(dungeonsTable)
    .filter((dungeon) => dungeon.Name)
    .map((dungeon) => [String(dungeon.Id), {
      name: dungeon.Name,
      play_type: dungeon.PlayType,
      dungeon_type_name: dungeon.DungeonTypeName,
    }]),
);

const achievements = Object.fromEntries(
  Object.values(achievementsTable)
    .filter((achievement) => Number.isInteger(achievement.Id) && achievement.Name)
    .map((achievement) => [String(achievement.Id), {
      name: achievement.Name,
      description: materializeAchievementDescription(achievement.Des, achievement.Num),
      category: achievement.Sma11ClassName ?? null,
      target: achievement.Num ?? null,
      season_id: achievement.SeasonId ?? null,
      achievement_level: achievement.AchievementLevel ?? null,
    }]),
);

function materializeAchievementDescription(description, target) {
  if (typeof description !== "string") return null;
  if (!description.includes("{*val*}")) return description;
  return Number.isFinite(target)
    ? description.replaceAll("{*val*}", Number(target).toLocaleString("en-US"))
    : description;
}

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
  game_build: sourceBuildId,
  source: "Exact-build BPSR Global Steam client tables and reviewed rLogs game-data catalogs",
  source_item_table_sha256: createHash("sha256").update(readFileSync(itemsTablePath)).digest("hex"),
  source_achievement_table_sha256: createHash("sha256").update(readFileSync(achievementsTablePath)).digest("hex"),
  equipment_slots: {
    "200": "Weapon", "201": "Headwear", "202": "Armor", "203": "Gloves",
    "204": "Shoes", "205": "Earrings", "206": "Necklace", "207": "Ring",
    "208": "Left Bracelet", "209": "Right Bracelet", "210": "Charm",
  },
  quality_names: { "1": "Common", "2": "Uncommon", "3": "Rare", "4": "Epic", "5": "Legendary" },
  equipment_attributes: equipmentAttributes,
  items,
  sigils,
  titles,
  skills,
  talents,
  talent_nodes: talentNodes,
  dungeons,
  achievements,
  imagines,
  modules,
  module_effects: localizedModuleEffects,
};

const output = path.join(websiteRoot, "public/data/bpsr/profile-presentation.en-US.v1.json");
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(catalog)}\n`);
console.log(`wrote ${output}`);
console.log(`${Object.keys(items).length} items, ${Object.keys(sigils).length} sigil families with ${Object.values(sigils).reduce((sum, levels) => sum + levels.length, 0)} exact levels, ${Object.keys(equipmentAttributes).length} equipment attributes, ${Object.keys(titles).length} titles, ${Object.keys(skills).length} skills, ${Object.keys(talents).length} talents, ${Object.keys(talentNodes).length} talent nodes, ${Object.keys(dungeons).length} dungeons, ${Object.keys(achievements).length} achievements, ${Object.keys(imagines).length} imagines; all sigil icons present`);

function cleanAttributeDescription(value) {
  if (typeof value !== "string") return undefined;
  return value
    .replace(/\s*[+-]?\{\*[^}]+\*\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function readJsonFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return readJsonFiles(file);
    return entry.isFile() && entry.name.endsWith(".json") ? [file] : [];
  });
}

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
