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
const equipmentTable = readJson(path.join(tableRoot, "EquipTable.json"));
const equipmentBreakthroughTablePath = path.join(tableRoot, "EquipBreakThroughTable.json");
const equipmentBreakthroughTable = readJson(equipmentBreakthroughTablePath);
const equipmentSuitTablePath = path.join(tableRoot, "EquipSuitTable.json");
const equipmentSuitTable = readJson(equipmentSuitTablePath);
const skillsTable = readJson(path.join(tableRoot, "SkillTable.json"));
const talentTablePath = path.join(tableRoot, "TalentTable.json");
const talentTable = readJson(talentTablePath);
const talentTreeTablePath = path.join(tableRoot, "TalentTreeTable.json");
const talentTreeTable = readJson(talentTreeTablePath);
const dungeonsTable = readJson(path.join(tableRoot, "DungeonsTable.json"));
const achievementsTablePath = path.join(tableRoot, "AchievementDateTable.json");
const achievementsTable = readJson(achievementsTablePath);
const lifeProfessionsTablePath = path.join(tableRoot, "LifeProfessionTable.json");
const lifeProfessionsTable = readJson(lifeProfessionsTablePath);
const reputationsTablePath = path.join(tableRoot, "ScenicSpotReputation.json");
const reputationsTable = readJson(reputationsTablePath);
const mallTable = readJson(path.join(tableRoot, "MallTable.json"));
const medalsTablePath = path.join(tableRoot, "MedalTable.json");
const medalsTable = readJson(medalsTablePath);
const moduleEffectsTable = readJson(path.join(tableRoot, "ModEffectTable.json"));
const equipmentAttributesTablePath = path.join(tableRoot, "EquipAttrLibTable.json");
const equipmentAttributesTable = readJson(equipmentAttributesTablePath);
const equipmentSchoolAttributesTable = readJson(path.join(tableRoot, "EquipAttrSchoolLibTable.json"));
const buffTablePath = path.join(tableRoot, "BuffTable.json");
const buffTable = readJson(buffTablePath);
const enchantmentItemsTable = readJson(
  existsSync(path.join(tableRoot, "EquipEnchantItemTable.json"))
    ? path.join(tableRoot, "EquipEnchantItemTable.json")
    : path.join(rlogsRoot, "Excels/EquipEnchantItemTable.json"),
);
const fightAttributesTable = readJson(path.join(tableRoot, "FightAttrTable.json"));
const fightAttributePresentationPath = path.join(
  gameDataRoot,
  "runtime/fight-attribute-presentation.v1.json",
);
const fightAttributePresentation = readJson(fightAttributePresentationPath);
const auxiliaryActionPresentationPath = path.join(
  gameDataRoot,
  "runtime/auxiliary-action-presentation.v1.json",
);
const auxiliaryActionPresentation = readJson(auxiliaryActionPresentationPath);
const auxiliaryActionIdentityProofPath = path.join(
  gameDataRoot,
  "runtime/auxiliary-action-identity-proof.v1.json",
);
const auxiliaryActionIdentityProof = readJson(auxiliaryActionIdentityProofPath);
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

const equipmentLevelsByItem = new Map();
for (const row of Object.values(equipmentBreakthroughTable)) {
  if (!Number.isInteger(row.EquipId) || !Number.isInteger(row.BreakThroughTime) || !Number.isInteger(row.EquipGs)) continue;
  const levels = equipmentLevelsByItem.get(String(row.EquipId)) ?? {};
  levels[String(row.BreakThroughTime)] = row.EquipGs;
  equipmentLevelsByItem.set(String(row.EquipId), levels);
}

const items = Object.fromEntries(
  Object.values(itemsTable)
    .filter((item) => item.Type === 102 || (item.Type >= 200 && item.Type <= 210))
    .map((item) => [String(item.Id), {
      name: item.Name,
      quality: item.Quality,
      type: item.Type,
      equipment_level: equipmentTable[String(item.Id)]?.EquipGs ?? null,
      equipment_levels_by_breakthrough: equipmentLevelsByItem.get(String(item.Id)) ?? {},
      set_id: equipmentTable[String(item.Id)]?.SuitId || null,
      icon: copyNamedIcon(item.Icon, "items"),
    }]),
);
const equipmentSets = Object.fromEntries(
  Object.values(equipmentSuitTable)
    .filter((row) => Number.isInteger(row.Id) && Number.isInteger(row.SuitId) && Number.isInteger(row.LimitNum))
    .map((row) => [String(row.Id), {
      suit_id: row.SuitId,
      name: row.SuitName || `${row.LimitNum}-Piece Set`,
      required_pieces: row.LimitNum,
    }]),
);
const missingSigilIcons = Object.values(itemsTable)
  .filter((item) => typeof item.Icon === "string" && item.Icon.toLowerCase().startsWith("item_icons_enchantformula"))
  .filter((item) => !items[String(item.Id)]?.icon)
  .map((item) => `${item.Id}:${item.Icon ?? "no-icon-key"}`);
if (missingSigilIcons.length) {
  throw new Error(`Missing ${missingSigilIcons.length} sigil icons: ${missingSigilIcons.join(", ")}`);
}

const fightAttributeSourceSha256 = createHash("sha256")
  .update(readFileSync(path.join(tableRoot, "FightAttrTable.json")))
  .digest("hex");
if (
  fightAttributePresentation.schema_version !== 1
  || fightAttributePresentation.game_build !== sourceBuildId
  || fightAttributePresentation.locale !== "en-US"
  || fightAttributePresentation.source_sha256 !== fightAttributeSourceSha256
  || !Array.isArray(fightAttributePresentation.attributes)
  || fightAttributePresentation.attributes.length !== 906
) {
  throw new Error("The canonical BPSR Fight Attribute presentation catalog is invalid or stale.");
}
const fightAttributeByMemberId = new Map();
for (const row of Object.values(fightAttributesTable)) {
  for (const member of [
    row.AttrFinal,
    row.AttrTotal,
    row.AttrAdd,
    row.AttrExAdd,
    row.AttrPer,
    row.AttrExPer,
  ]) {
    if (!Number.isInteger(member) || member <= 0) continue;
    fightAttributeByMemberId.set(member, row);
  }
}
const fightAttributes = Object.fromEntries(
  fightAttributePresentation.attributes.map((attribute) => [String(attribute.attribute_id), {
    name: attribute.name,
    description: attribute.description,
    number_type: attribute.number_type,
    format_type: attribute.format_type,
    family_id: attribute.family_id,
    component: attribute.component,
    icon: attribute.icon,
    displayable: attribute.displayable,
  }]),
);
const equipmentAttributeRows = [
  ...Object.values(equipmentAttributesTable),
  ...Object.values(equipmentSchoolAttributesTable),
];
const equipmentAttributes = Object.fromEntries(
  equipmentAttributeRows
    .filter((row) => Number.isInteger(row.Id))
    .map((row) => {
      let configIndex = 0;
      const equipmentEffects = [];
      const equipmentBuffEffects = [];
      for (const effect of row.AttrEffect ?? []) {
        if (!Array.isArray(effect) || !Number.isInteger(effect[0])) continue;
        if (effect[0] === 3) {
          const parameterCount = Number.isInteger(effect[2]) && effect[2] > 0 ? effect[2] : 1;
          const buff = buffTable[String(effect[1])];
          const description = attributeDescriptionsTable[String(buff?.TipsDescription)]?.Description;
          const parameters = (row.AttrEffectConfig ?? [])
            .slice(configIndex, configIndex + parameterCount)
            .filter((range) => Array.isArray(range) && Number.isFinite(range[0]) && Number.isFinite(range[1]))
            .map((range) => ({ minimum: range[0], maximum: range[1] }));
          configIndex += parameterCount;
          if (Number.isInteger(effect[1]) && typeof description === "string" && parameters.length === parameterCount) {
            equipmentBuffEffects.push({
              buff_id: effect[1],
              description,
              parameters,
            });
          }
          continue;
        }
        if (effect[0] !== 1) continue;
        const attributeId = effect[1];
        const range = row.AttrEffectConfig?.[configIndex++] ?? [];
        const fightAttribute = fightAttributeByMemberId.get(attributeId);
        const name = fightAttribute?.OfficialName
          ?? cleanAttributeDescription(attributeDescriptionsTable[String(attributeId)]?.Description);
        if (
          !Number.isInteger(attributeId)
          || typeof name !== "string"
          || !Number.isFinite(range[0])
          || !Number.isFinite(range[1])
        ) continue;
        equipmentEffects.push({
          attribute_id: attributeId,
          name,
          minimum: range[0],
          maximum: range[1],
          number_type: fightAttribute?.AttrNumType ?? 0,
          format_type: attributeId % 10,
        });
      }
      const names = equipmentEffects
        .map((effect) => effect.name)
        .concat(equipmentBuffEffects.map((effect) => cleanBuffDescription(effect.description)))
        .filter((name, index, all) => all.indexOf(name) === index);
      return [String(row.Id), {
        name: names.length ? names.join(" + ") : `Equipment attribute ${row.Id}`,
        effects: names,
        equipment_effects: equipmentEffects,
        equipment_buff_effects: equipmentBuffEffects,
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

if (
  auxiliaryActionPresentation.schema_version !== 1
  || !Array.isArray(auxiliaryActionPresentation.skills)
  || auxiliaryActionPresentation.skills.length !== 20
  || auxiliaryActionPresentation.skills.some((skill) =>
    !Number.isInteger(skill.skill_id)
    || !["role_skill", "role_imagine"].includes(skill.action_kind)
    || (skill.action_kind === "role_skill" && skill.maximum_tier !== null)
    || (skill.action_kind === "role_imagine" && skill.maximum_tier !== 4)
    || (skill.replacement_imagine_skill_id !== null
      && !Number.isInteger(skill.replacement_imagine_skill_id)))
) {
  throw new Error("The canonical BPSR auxiliary-action presentation catalog is invalid or stale.");
}
if (
  auxiliaryActionIdentityProof.schema_version !== 1
  || auxiliaryActionIdentityProof.game_build !== String(sourceBuildId)
  || auxiliaryActionIdentityProof.deployment_id !== "global"
  || auxiliaryActionIdentityProof.policy?.role_action_and_normal_imagine_action_ids_are_distinct !== true
  || auxiliaryActionIdentityProof.policy?.role_imagine_maximum_tier !== 4
  || auxiliaryActionIdentityProof.policy?.battle_imagine_maximum_tier !== 5
  || auxiliaryActionIdentityProof.policy?.unobserved_battle_imagine_tier !== 0
  || auxiliaryActionIdentityProof.policy?.empty_archive_member_list_uses_all_observed_imagines !== true
  || JSON.stringify(auxiliaryActionIdentityProof.role_tier_requirements) !== JSON.stringify([
    { tier: 1, minimum_total_imagine_tier: 5, minimum_core_imagine_tier: 0 },
    { tier: 2, minimum_total_imagine_tier: 15, minimum_core_imagine_tier: 1 },
    { tier: 3, minimum_total_imagine_tier: 20, minimum_core_imagine_tier: 3 },
    { tier: 4, minimum_total_imagine_tier: 25, minimum_core_imagine_tier: 5 },
  ])
  || !Array.isArray(auxiliaryActionIdentityProof.pairs)
  || auxiliaryActionIdentityProof.pairs.length !== 8
) {
  throw new Error("The current-build BPSR auxiliary-action identity proof is invalid or stale.");
}
const auxiliaryActionsBySkillId = new Map(
  auxiliaryActionPresentation.skills.map((skill) => [skill.skill_id, skill]),
);
const auxiliaryIdentityByRoleActionId = new Map(
  auxiliaryActionIdentityProof.pairs.map((pair) => [pair.role_action_id, pair]),
);
for (const action of auxiliaryActionPresentation.skills) {
  const pair = auxiliaryIdentityByRoleActionId.get(action.skill_id);
  if (action.action_kind === "role_skill") {
    if (pair != null || action.replacement_imagine_skill_id !== null) {
      throw new Error(`Native role action ${action.skill_id} incorrectly claims Imagine identity.`);
    }
    continue;
  }
  const imagine = imaginePresentation.imagines.find(
    (candidate) => candidate.skill_id === pair?.normal_imagine_action_id,
  );
  if (
    pair == null
    || pair.role_action_id === pair.normal_imagine_action_id
    || action.replacement_imagine_skill_id !== pair.normal_imagine_action_id
    || imagine?.item_id !== pair.battle_imagine_item_id
    || imagine?.maximum_tier !== auxiliaryActionIdentityProof.policy.battle_imagine_maximum_tier
    || pair.archive_guide_id !== pair.role_action_id - 2020
    || !Array.isArray(pair.archive_member_normal_imagine_action_ids)
    || pair.archive_member_normal_imagine_action_ids.some((skillId) => !Number.isInteger(skillId))
  ) {
    throw new Error(`Imagine role action ${action.skill_id} failed its current-build identity proof.`);
  }
}
const skills = Object.fromEntries(
  Object.values(skillsTable)
    .filter((skill) => skill.Id >= 2_000 && skill.Id < 4_000 && skill.Name)
    .map((skill) => [String(skill.Id), {
      name: skill.Name,
      icon: copyNamedIcon(skill.Icon, "skills"),
      skill_type: skill.SkillType,
      action_kind: auxiliaryActionsBySkillId.get(skill.Id)?.action_kind ?? null,
      maximum_tier: auxiliaryActionsBySkillId.get(skill.Id)?.maximum_tier ?? null,
      replacement_imagine_skill_id:
        auxiliaryActionsBySkillId.get(skill.Id)?.replacement_imagine_skill_id ?? null,
      archive_guide_id: auxiliaryIdentityByRoleActionId.get(skill.Id)?.archive_guide_id ?? null,
      archive_member_imagine_skill_ids:
        auxiliaryIdentityByRoleActionId.get(skill.Id)?.archive_member_normal_imagine_action_ids ?? [],
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
for (const file of readJsonFiles(talentCatalogRoot)) {
  const talent = readJson(file);
  if (talent?.kind !== "talent" || !Number.isInteger(talent.id)) continue;
  const attributes = talent.attributes ?? {};
  const exactTalent = talentTable[String(talent.id)];
  talents[String(talent.id)] = {
    name: talentLocale.get(talent.localization_key) ?? talentLocale.get(`talent.${talent.id}.name`) ?? `Unknown talent ${talent.id}`,
    description: talentLocale.get(attributes.description_localization_key ?? `talent.${talent.id}.description`)
      ?? exactTalentDescription(talentTable[String(talent.id)])
      ?? null,
    icon: copyNamedIcon(talent.icon, "talents"),
    profession_id: attributes.profession_id ?? null,
    talent_type: attributes.talent_type ?? null,
    talent_level: attributes.talent_level ?? null,
    skill_replacements: (exactTalent?.TalentEffect ?? [])
      .filter((effect) =>
        Array.isArray(effect)
        && effect.length >= 3
        && effect[0] === 6
        && Number.isInteger(effect[1])
        && Number.isInteger(effect[2]))
      .map((effect) => ({ source_skill_id: effect[1], replacement_skill_id: effect[2] })),
  };
}

const talentNodes = Object.fromEntries(
  Object.values(talentTreeTable)
    .filter((node) =>
      Number.isInteger(node?.Id) &&
      Number.isInteger(node?.TalentId) &&
      Number.isInteger(node?.WeaponType) &&
      Number.isInteger(node?.BdType) &&
      Number.isInteger(node?.TalentStage) &&
      Array.isArray(node?.TalentPosition) &&
      node.TalentPosition.length === 2 &&
      node.TalentPosition.every(Number.isInteger)
    )
    .map((node) => [String(node.Id), {
      talent_id: node.TalentId,
      profession_id: node.WeaponType,
      branch: node.BdType,
      talent_stage: node.TalentStage,
      prerequisite_node_ids: Array.isArray(node.PreTalent)
        ? node.PreTalent.filter(Number.isInteger)
        : [],
      dependent_node_ids: Array.isArray(node.NextTalent)
        ? node.NextTalent.filter(Number.isInteger)
        : [],
      position: { x: node.TalentPosition[0], y: node.TalentPosition[1] },
    }]),
);

const talentTreeIndex = {};
for (const professionId of [...new Set(Object.values(talentNodes).map((node) => node.profession_id))].sort((a, b) => a - b)) {
  const professionNodes = Object.entries(talentNodes)
    .filter(([, node]) => node.profession_id === professionId);
  const foundationNodes = professionNodes
    .filter(([, node]) => node.talent_stage === 0)
    .map(([nodeId]) => Number(nodeId))
    .sort((left, right) => left - right);
  const branchIds = [...new Set(
    professionNodes
      .filter(([, node]) => node.talent_stage === 1)
      .map(([, node]) => node.branch),
  )].sort((a, b) => a - b);
  if (foundationNodes.length !== 30 || branchIds.length !== 2) {
    throw new Error(
      `Incomplete talent tree for profession ${professionId}: ` +
      `${foundationNodes.length} foundation nodes and ${branchIds.length} specialization branches`,
    );
  }
  const specializations = branchIds.map((branch) => {
    const branchNodes = professionNodes
      .filter(([, node]) => node.talent_stage === 1 && node.branch === branch)
      .map(([nodeId]) => Number(nodeId))
      .sort((left, right) => left - right);
    if (branchNodes.length !== 60) {
      throw new Error(`Incomplete profession ${professionId} branch ${branch}: ${branchNodes.length} nodes`);
    }
    const specializationTalents = branchNodes
      .map((nodeId) => ({
        talent_id: talentNodes[String(nodeId)].talent_id,
        talent: talents[String(talentNodes[String(nodeId)].talent_id)],
      }))
      .filter((entry) => entry.talent?.talent_type === 5);
    if (specializationTalents.length !== 1) {
      throw new Error(
        `Profession ${professionId} branch ${branch} has ${specializationTalents.length} specialization identities`,
      );
    }
    const specializationTalent = specializationTalents[0];
    return {
      branch,
      name: specializationTalent.talent.name,
      talent_id: specializationTalent.talent_id,
      node_ids: branchNodes,
    };
  });
  talentTreeIndex[String(professionId)] = {
    profession_id: professionId,
    foundation_node_ids: foundationNodes,
    specializations,
  };
}

const indexedTalentNodeIds = new Set(Object.values(talentTreeIndex).flatMap((tree) => [
  ...tree.foundation_node_ids,
  ...tree.specializations.flatMap((specialization) => specialization.node_ids),
]));
for (const [nodeId, node] of Object.entries(talentNodes)) {
  const talent = talents[String(node.talent_id)];
  if (!indexedTalentNodeIds.has(Number(nodeId))) {
    throw new Error(`Talent node ${nodeId} is absent from the website tree index`);
  }
  if (!talent?.name || talent.name.startsWith("Unknown talent ") || !talent.icon || !talent.description) {
    throw new Error(`Talent node ${nodeId} is missing a localized name, icon, or exact description`);
  }
  const allowedNodeIds = new Set([
    ...talentTreeIndex[String(node.profession_id)].foundation_node_ids,
    ...(talentTreeIndex[String(node.profession_id)].specializations
      .find((specialization) => specialization.branch === node.branch)?.node_ids ?? []),
  ]);
  const missingPrerequisite = node.prerequisite_node_ids.find((prerequisiteId) => !allowedNodeIds.has(prerequisiteId));
  if (missingPrerequisite != null) {
    throw new Error(`Talent node ${nodeId} references prerequisite ${missingPrerequisite} outside its website tree`);
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

const medals = Object.fromEntries(
  Object.values(medalsTable)
    .filter((medal) => Number.isInteger(medal.Id) && medal.Name)
    .map((medal) => [String(medal.Id), {
      name: medal.Name,
      description: medal.UnlockDes ?? null,
      icon: copyNamedIcon(medal.Image, "medals"),
    }]),
);
const missingVisibleMedalIcons = Object.values(medalsTable)
  .filter((medal) => Number.isInteger(medal.Id) && medal.Name && medal.IsHide !== 1 && medal.NotUnlock !== 1)
  .filter((medal) => !medals[String(medal.Id)]?.icon)
  .map((medal) => `${medal.Id}:${medal.Image || "no-image-key"}`);
if (missingVisibleMedalIcons.length) {
  throw new Error(
    `Missing ${missingVisibleMedalIcons.length} visible medal icons: ${missingVisibleMedalIcons.join(", ")}`,
  );
}

function materializeAchievementDescription(description, target) {
  if (typeof description !== "string") return null;
  if (!description.includes("{*val*}")) return description;
  return Number.isFinite(target)
    ? description.replaceAll("{*val*}", Number(target).toLocaleString("en-US"))
    : description;
}

function exactTalentDescription(row) {
  if (!row) return null;
  const authored = typeof row.TalentDes === "string" ? row.TalentDes.trim() : "";
  if (authored && authored !== "力量+10") return authored;
  const descriptions = (row.TalentEffect ?? []).flatMap((effect) => {
    if (!Array.isArray(effect)) return [];
    if (effect[0] === 1) {
      const attribute = fightAttributeByMemberId.get(effect[1]);
      if (!attribute || !Number.isFinite(effect[2])) return [];
      const formatted = formatTalentEffectValue(effect[2], attribute.AttrNumType, effect[1] % 10);
      return [`${attribute.OfficialName} ${effect[2] > 0 ? "+" : ""}${formatted}.`];
    }
    if (effect[0] === 3) {
      const buff = buffTable[String(effect[1])];
      const description = attributeDescriptionsTable[String(buff?.TipsDescription)]?.Description;
      return typeof description === "string" && description.trim() ? [description.trim()] : [];
    }
    if (effect[0] === 6) {
      const previousSkill = skillsTable[String(effect[1])]?.Name;
      const replacementSkill = skillsTable[String(effect[2])]?.Name;
      return previousSkill && replacementSkill ? [`Replaces ${previousSkill} with ${replacementSkill}.`] : [];
    }
    return [];
  });
  return [...new Set(descriptions)].join("<br>") || null;
}

function formatTalentEffectValue(value, numberType, formatType) {
  if (numberType === 1 || (numberType === 0 && formatType === 4)) return `${value / 100}%`;
  if (numberType === 2) return `${value / 1_000}s`;
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: 6 });
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
    rarity: imagine.rarity,
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

const lifeProfessions = Object.fromEntries(
  Object.values(lifeProfessionsTable)
    .filter((row) => Number.isInteger(row.ProId) && row.ProId > 0 && typeof row.Name === "string")
    .sort((left, right) => (left.Sort ?? left.ProId) - (right.Sort ?? right.ProId))
    .map((row) => [String(row.ProId), {
      name: row.Name,
      description: cleanBuffDescription(row.Des),
      type: Number.isInteger(row.Type) ? row.Type : null,
      sort: Number.isInteger(row.Sort) ? row.Sort : null,
      icon: copyNamedIcon(row.Icon, "life-professions"),
    }]),
);

const reputations = Object.fromEntries(
  Object.values(reputationsTable)
    .filter((row) => Number.isInteger(row.Id) && row.Id > 0)
    .map((row) => {
      const storeCurrencyId = mallTable[String(row.ReputationStore)]?.CurrencyDisplay?.[0];
      const itemId = Number.isInteger(row.Item) && row.Item > 0 ? row.Item : storeCurrencyId;
      const item = Number.isInteger(itemId) ? itemsTable[String(itemId)] : undefined;
      const name = typeof item?.Name === "string"
        ? item.Name.replace(/\s+EXP$/iu, "")
        : "Regional reputation";
      return [String(row.Id), {
        name,
        description: typeof item?.Description === "string" ? cleanBuffDescription(item.Description) : null,
        icon: copyNamedIcon(item?.Icon, "reputations"),
      }];
    }),
);

const catalog = {
  schema_version: 3,
  locale: "en-US",
  game_build: sourceBuildId,
  source: "Exact-build BPSR Global Steam client tables and reviewed rLogs game-data catalogs",
  source_item_table_sha256: createHash("sha256").update(readFileSync(itemsTablePath)).digest("hex"),
  source_achievement_table_sha256: createHash("sha256").update(readFileSync(achievementsTablePath)).digest("hex"),
  source_life_profession_table_sha256: createHash("sha256").update(readFileSync(lifeProfessionsTablePath)).digest("hex"),
  source_reputation_table_sha256: createHash("sha256").update(readFileSync(reputationsTablePath)).digest("hex"),
  source_medal_table_sha256: createHash("sha256").update(readFileSync(medalsTablePath)).digest("hex"),
  source_talent_table_sha256: createHash("sha256").update(readFileSync(talentTablePath)).digest("hex"),
  source_talent_tree_table_sha256: createHash("sha256").update(readFileSync(talentTreeTablePath)).digest("hex"),
  source_equipment_attribute_table_sha256: createHash("sha256").update(readFileSync(equipmentAttributesTablePath)).digest("hex"),
  source_equipment_breakthrough_table_sha256: createHash("sha256").update(readFileSync(equipmentBreakthroughTablePath)).digest("hex"),
  source_equipment_suit_table_sha256: createHash("sha256").update(readFileSync(equipmentSuitTablePath)).digest("hex"),
  source_buff_table_sha256: createHash("sha256").update(readFileSync(buffTablePath)).digest("hex"),
  source_auxiliary_action_presentation_sha256: createHash("sha256")
    .update(readFileSync(auxiliaryActionPresentationPath))
    .digest("hex"),
  source_auxiliary_action_identity_proof_sha256: createHash("sha256")
    .update(readFileSync(auxiliaryActionIdentityProofPath))
    .digest("hex"),
  equipment_slots: {
    "200": "Weapon", "201": "Headwear", "202": "Armor", "203": "Gloves",
    "204": "Shoes", "205": "Earrings", "206": "Necklace", "207": "Ring",
    "208": "Left Bracelet", "209": "Right Bracelet", "210": "Charm",
  },
  quality_names: {
    "0": "Raw",
    "1": "Common",
    "2": "Rare",
    "3": "Epic",
    "4": "Legendary",
    "5": "Mythic",
  },
  role_imagine_tier_policy: {
    unobserved_battle_imagine_tier:
      auxiliaryActionIdentityProof.policy.unobserved_battle_imagine_tier,
    empty_archive_member_list_uses_all_observed_imagines:
      auxiliaryActionIdentityProof.policy.empty_archive_member_list_uses_all_observed_imagines,
    requirements: auxiliaryActionIdentityProof.role_tier_requirements,
  },
  equipment_attributes: equipmentAttributes,
  equipment_sets: equipmentSets,
  fight_attributes: fightAttributes,
  items,
  sigils,
  titles,
  skills,
  talents,
  talent_nodes: talentNodes,
  talent_tree_index: talentTreeIndex,
  dungeons,
  achievements,
  medals,
  imagines,
  modules,
  module_effects: localizedModuleEffects,
  life_professions: lifeProfessions,
  reputations,
};

const output = path.join(websiteRoot, "public/data/bpsr/profile-presentation.en-US.v1.json");
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(catalog)}\n`);
console.log(`wrote ${output}`);
console.log(`${Object.keys(items).length} items, ${Object.keys(sigils).length} sigil families with ${Object.values(sigils).reduce((sum, levels) => sum + levels.length, 0)} exact levels, ${Object.keys(equipmentAttributes).length} equipment attributes, ${Object.keys(titles).length} titles, ${Object.keys(skills).length} skills, ${Object.keys(talents).length} talents, ${Object.keys(talentNodes).length} talent nodes across ${Object.keys(talentTreeIndex).length} professions and ${Object.values(talentTreeIndex).reduce((sum, tree) => sum + tree.specializations.length, 0)} specializations, ${Object.keys(dungeons).length} dungeons, ${Object.keys(achievements).length} achievements, ${Object.keys(medals).length} medals, ${Object.keys(imagines).length} imagines, ${Object.keys(lifeProfessions).length} life professions, ${Object.keys(reputations).length} regional reputations; all sigil, visible-medal, and talent-tree completeness gates passed`);

function cleanAttributeDescription(value) {
  if (typeof value !== "string") return undefined;
  return value
    .replace(/\s*[+-]?\{\*[^}]+\*\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanBuffDescription(value) {
  if (typeof value !== "string") return "Equipment effect";
  return value
    .replace(/\{\*Decision\.[A-Za-z]+\(\d+\)\*\}/g, "value")
    .replace(/<[^>]+>/g, "")
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
