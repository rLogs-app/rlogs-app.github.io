import type { JsonValue } from "../../contracts/website-payload";
import type { PublishedProfile } from "../profiles/published-profile-loader";
import {
  loadProfilePresentation,
  type ProfilePresentationCatalog,
} from "../profiles/profile-presentation";

type JsonRecord = Record<string, JsonValue>;
let presentation: ProfilePresentationCatalog;
const apiBase = String(import.meta.env.VITE_RLOGS_API_BASE_URL ?? "").replace(/\/$/u, "");

export async function renderSyncedCharacterProfile(profile: PublishedProfile): Promise<HTMLElement> {
  presentation = await loadProfilePresentation();
  const body = profile.envelope.body;
  const root = element("article", "synced-character-profile");
  const heading = element("header", "character-profile-heading");
  const identity = element("div", "character-profile-identity");
  const appearance = recordValue(body.appearance);
  const profileImageUrl = safeImageUrl(appearance?.profile_image_url);
  if (profileImageUrl) {
    const image = document.createElement("img");
    image.className = "character-profile-picture";
    image.src = profileImageUrl;
    image.alt = `${stringValue(body.display_name) ?? profile.entry.label} profile picture`;
    image.loading = "eager";
    image.referrerPolicy = "no-referrer";
    identity.append(image);
  }
  const identityCopy = element("div");
  identityCopy.append(
    element("p", "eyebrow", "Synced character"),
    element("h2", "", stringValue(body.display_name) ?? profile.entry.label),
    element(
      "p",
      "identity-id",
      `UID ${profile.entry.character_id} · ${[profile.entry.region, profile.entry.realm ?? profile.entry.world].filter(Boolean).join(" · ")}`,
    ),
  );
  identity.append(identityCopy);
  heading.append(identity, element("span", "profile-last-seen", `Last seen ${relativeTime(profile.entry.source_updated_unix_millis ?? profile.entry.source_created_unix_millis ?? Date.now())}`));
  root.append(heading);

  const halfBodyImageUrl = safeImageUrl(appearance?.half_body_image_url);
  if (halfBodyImageUrl) {
    const portrait = document.createElement("img");
    portrait.className = "character-half-body-picture";
    portrait.src = halfBodyImageUrl;
    portrait.alt = `${stringValue(body.display_name) ?? profile.entry.label} character portrait`;
    portrait.loading = "lazy";
    portrait.referrerPolicy = "no-referrer";
    root.append(portrait);
  }

  const summary = element("div", "profile-stat-grid");
  const modules = recordValue(body.modules);
  const inventory = arrayValue(modules?.inventory);
  const equippedSlots = recordValue(modules?.equipped_slots);
  const masterScore = resolvedMasterScore(body);
  const meowluxScore = resolvedMeowluxScore(body);
  for (const [label, value] of [
    ["Level", displayValue(body.level)],
    ["Combat power", displayNumber(body.combat_power)],
    ["Season strength", displayNumber(body.season_strength)],
    ["Master score", masterScore == null ? "—" : masterScore.toLocaleString()],
    ["Meowlux score", meowluxScore == null ? "—" : meowluxScore.toLocaleString()],
    ["Equipment", String(arrayValue(body.equipment).length)],
    ["Modules", String(inventory.length)],
    ["Imagines", String(Math.max(arrayValue(body.owned_imagines).length, arrayValue(body.battle_imagine_skills).length))],
  ]) {
    summary.append(stat(label, value));
  }
  root.append(summary);

  const sections = element("div", "profile-section-grid");
  sections.append(
    equipmentSection(arrayValue(body.equipment)),
    imagineSection(arrayValue(body.owned_imagines), arrayValue(body.battle_imagine_skills)),
    moduleSection(inventory, equippedSlots),
    skillsSection(body),
    collectionsSection(body),
    photoWallSection(body),
    achievementSection(body),
    progressSection(body),
  );
  root.append(sections);

  const allDetails = element("details", "profile-all-details");
  const summaryLabel = element("summary", "", "All other synced character details");
  const facts = element("dl", "profile-facts");
  const represented = new Set([
    "equipment",
    "modules",
    "owned_imagines",
    "battle_imagine_skills",
    "active_skills",
    "talents",
    "talent_progress",
    "collection_summary",
    "appearance",
    "activity_progress",
    "combat_professions",
    "life_professions",
  ]);
  for (const [key, value] of Object.entries(body)) {
    if (!represented.has(key)) appendFact(facts, title(key), compactValue(value));
  }
  allDetails.append(summaryLabel, facts);
  root.append(allDetails);
  return root;
}

function equipmentSection(items: JsonValue[]): HTMLElement {
  const section = profileSection("Current equipment", `${items.length} equipped pieces`);
  const grid = element("div", "profile-item-grid");
  for (const value of items) {
    const item = recordValue(value);
    if (!item) continue;
    const itemId = numericValue(item.item_id);
    const slotId = numericValue(item.slot_id);
    const localized = itemId == null ? undefined : presentation.items[String(itemId)];
    const slotName = slotId == null ? "Equipment" : presentation.equipment_slots[String(slotId)] ?? `Equipment slot ${slotId}`;
    const card = element("article", "profile-item-card");
    appendPresentationIcon(card, localized?.icon, localized?.name ?? slotName, "profile-item-icon");
    card.append(
      element("small", "profile-item-kicker", slotName),
      element("strong", "", localized?.name ?? `Unknown equipment ${displayValue(item.item_id)}`),
      element("small", "", joinFacts([
        pair("Level", item.level),
        qualityLabel(item.quality),
        pair("Refinement +", item.refinement_level),
        pair("Set", item.set_id),
      ])),
      element("small", "", equipmentAttributeSummary(item)),
    );
    const attributeList = equipmentAttributeList(item);
    if (attributeList) card.append(attributeList);
    const enchantments = arrayValue(item.enchantments);
    if (enchantments.length) {
      const sigils = element("div", "profile-sigil-list");
      for (const value of enchantments) {
        const enchantment = recordValue(value);
        if (!enchantment) continue;
        const enchantmentId = numericValue(enchantment.enchantment_id);
        const level = numericValue(enchantment.level);
        const sigil = enchantmentId == null ? undefined : presentation.items[String(enchantmentId)];
        const sigilLevel = enchantmentId == null || level == null
          ? undefined
          : presentation.sigils[String(enchantmentId)]?.find((entry) => entry.level === level);
        const row = element("div", "profile-sigil-row");
        appendPresentationIcon(row, sigilLevel?.icon ?? sigil?.icon, sigilLevel?.name ?? sigil?.name ?? "Sigil", "profile-sigil-icon");
        const copy = element("span");
        copy.append(
          element("strong", "", sigilLevel?.name ?? sigil?.name ?? `Unknown sigil ${displayValue(enchantment.enchantment_id)}`),
          element("small", "", joinFacts([qualityLabel(sigilLevel?.quality ?? sigil?.quality), pair("Sigil level", enchantment.level)])),
        );
        for (const effect of sigilLevel?.effects ?? []) {
          copy.append(element("small", "", `${effect.name} +${effect.value.toLocaleString()}`));
        }
        row.append(copy);
        sigils.append(row);
      }
      card.append(sigils);
    }
    grid.append(card);
  }
  section.append(items.length ? grid : empty("No equipment was present in the latest synced snapshot."));
  return section;
}

function imagineSection(owned: JsonValue[], skills: JsonValue[]): HTMLElement {
  const records = skills.length ? skills : owned;
  const equipped = records.filter((value) => recordValue(value)?.equipped_slot != null).length;
  const section = profileSection("Battle Imagines", `${records.length} observed · ${equipped} equipped`);
  const grid = element("div", "profile-item-grid profile-imagine-grid");
  const sorted = [...records].sort((left, right) => Number(recordValue(right)?.equipped_slot != null) - Number(recordValue(left)?.equipped_slot != null));
  for (const value of sorted) {
    const item = recordValue(value);
    if (!item) continue;
    const skillId = numericValue(item.skill_id ?? item.base_skill_id);
    const imagineId = numericValue(item.imagine_id);
    const localized = skillId == null
      ? Object.values(presentation.imagines).find((entry) => entry.item_id === imagineId)
      : presentation.imagines[String(skillId)];
    const card = element("article", "profile-item-card profile-imagine-card");
    appendPresentationIcon(card, localized?.icon, localized?.name ?? "Battle Imagine", "profile-item-icon");
    card.append(
      element("strong", "", localized?.name ?? `Unknown Battle Imagine ${displayValue(item.imagine_id ?? item.skill_id)}`),
      element("small", "", joinFacts([
        pair("Tier", item.remodel_level ?? item.breakthrough_level),
        pair("Level", item.level),
        item.equipped_slot == null ? "" : `Equipped · Slot ${displayValue(item.equipped_slot)}`,
      ])),
    );
    grid.append(card);
  }
  section.append(records.length ? grid : empty("No Battle Imagine data was present in the latest snapshot."));
  return section;
}

function moduleSection(inventory: JsonValue[], slots: JsonRecord | undefined): HTMLElement {
  const equipped = slots ? Object.entries(slots) : [];
  const section = profileSection("Module loadout", `${inventory.length} owned · ${equipped.length} equipped`);
  const byInstance = new Map(
    inventory
      .map(recordValue)
      .filter((value): value is JsonRecord => Boolean(value))
      .map((value) => [String(value.instance_id), value]),
  );
  const list = element("div", "profile-compact-list");
  for (const [slot, instanceId] of equipped) {
    const module = byInstance.get(String(instanceId));
    const configId = numericValue(module?.config_id);
    const localized = configId == null ? undefined : presentation.modules[String(configId)];
    const row = element("article", "profile-module-row");
    appendPresentationIcon(row, localized?.icon, localized?.name ?? "Module", "profile-module-icon");
    const copy = element("div", "profile-module-copy");
    const parts = arrayValue(module?.parts);
    const totalLink = parts.reduce<number>((sum, value) => sum + Math.max(0, numericValue(recordValue(value)?.initial_link_points) ?? 0), 0);
    copy.append(
      element("strong", "", `Slot ${slot} · ${localized?.name ?? `Unknown module ${displayValue(module?.config_id)}`}`),
      element("small", "", joinFacts([pair("Level", module?.level), qualityLabel(module?.quality), `${totalLink} Link total`])),
    );
    if (parts.length) {
      const partList = element("div", "profile-module-parts");
      for (const partValue of parts) {
        const part = recordValue(partValue);
        if (!part) continue;
        const partId = numericValue(part.part_id);
        const effect = partId == null ? undefined : presentation.module_effects[String(partId)];
        const successfulUpgrades = partId == null ? 0 : arrayValue(module?.upgrade_records)
          .map(recordValue)
          .filter((record) => record?.part_id === partId && record.succeeded === true)
          .length;
        const effectLevel = resolvedModuleEffectLevel(effect?.levels, successfulUpgrades);
        const chip = element("span", "profile-module-part");
        appendPresentationIcon(chip, effect?.icon, effect?.name ?? "Module effect", "profile-module-part-icon");
        chip.append(element("span", "", joinFacts([
          effect?.name ?? `Effect ${displayValue(part.part_id)}`,
          effectLevel > 0 ? `Lv. ${effectLevel}` : "Unleveled",
          `${displayValue(part.initial_link_points)} Link`,
        ])));
        partList.append(chip);
      }
      copy.append(partList);
    }
    row.append(copy);
    list.append(row);
  }
  section.append(equipped.length ? list : empty("No equipped modules were present in the latest snapshot."));
  const link = element("a", "profile-section-link", "Open this inventory in Module Optimizer →");
  link.href = "/optimizer/";
  section.append(link);
  return section;
}

function skillsSection(body: JsonRecord): HTMLElement {
  const skills = arrayValue(body.active_skills);
  const talents = arrayValue(body.talents);
  const actions = arrayValue(body.equipped_action_slots);
  const section = profileSection("Skills & talents", `${skills.length} skills · ${talents.length} talents`);
  const list = element("div", "profile-compact-list");
  for (const value of skills) {
    const skill = recordValue(value);
    if (!skill) continue;
    const skillId = numericValue(skill.skill_id ?? skill.base_skill_id);
    const localized = skillId == null ? undefined : presentation.skills[String(skillId)];
    const row = element("div", "profile-skill-row");
    appendPresentationIcon(row, localized?.icon, localized?.name ?? "Skill", "profile-skill-icon");
    const copy = element("span");
    copy.append(
      element("strong", "", localized?.name ?? `Unknown skill ${displayValue(skill.skill_id)}`),
      element("small", "", joinFacts([pair("Level", skill.level), pair("Remodel", skill.remodel_level)])),
    );
    row.append(copy);
    list.append(row);
  }
  for (const value of talents) {
    const talent = recordValue(value);
    if (!talent) continue;
    const rawTalentId = numericValue(talent.talent_id);
    const nodeId = numericValue(talent.node_id) ?? rawTalentId;
    const node = nodeId == null ? undefined : presentation.talent_nodes[String(nodeId)];
    const talentId = numericValue(talent.node_id) == null && node?.talent_id != null ? node.talent_id : rawTalentId;
    const localized = talentId == null ? undefined : presentation.talents[String(talentId)];
    const row = element("div", "profile-skill-row");
    appendPresentationIcon(row, localized?.icon, localized?.name ?? "Talent", "profile-skill-icon");
    const copy = element("span");
    copy.append(
      element("strong", "", localized?.name ?? `Unknown talent ${displayValue(talentId ?? nodeId)}`),
      element("small", "", joinFacts([pair("Level", talent.level), nodeId == null ? "" : `Node ${nodeId}`])),
    );
    row.append(copy);
    list.append(row);
  }
  if (actions.length) list.append(compactRow("Equipped action slots", `${actions.length} bindings`));
  section.append(list.childElementCount ? list : empty("No skill or talent data was present in the latest snapshot."));
  return section;
}

function collectionsSection(body: JsonRecord): HTMLElement {
  const appearance = recordValue(body.appearance);
  const collection = recordValue(body.collection_summary);
  const social = recordValue(body.social_display);
  const equippedTitleId = social?.equipped_title_id ?? arrayValue(social?.title_ids)[0];
  const equippedTitle = equippedTitleId == null ? undefined : presentation.titles[String(equippedTitleId)];
  const section = profileSection("Collections & appearance", "Privacy-reviewed unlock data");
  const facts = element("dl", "profile-facts");
  appendFact(facts, "Meowlux score", resolvedMeowluxScore(body)?.toLocaleString() ?? "—");
  for (const [label, value] of [
    ["Fashion points", collection?.fashion_points],
    ["Mount points", collection?.mount_points],
    ["Weapon skin points", collection?.weapon_skin_points],
    ["Profile images unlocked", arrayValue(appearance?.unlocked_profile_image_ids).length],
    ["Fashion owned", arrayValue(collection?.owned_fashion_ids).length],
    ["Mounts owned", arrayValue(collection?.owned_mount_ids).length],
    ["Weapon skins owned", arrayValue(collection?.owned_weapon_skin_ids).length],
    ["Vanity pets", arrayValue(collection?.vanity_pet_ids).length],
    ["Guild", social?.guild_name ?? social?.guild_id],
    ["Titles", arrayValue(social?.title_ids).length],
    ["Equipped title", equippedTitle?.name ?? equippedTitleId],
    ["Equipped title level", social?.equipped_title_level],
    ["Medals", arrayValue(social?.medal_ids).length],
  ] as Array<[string, JsonValue | number | undefined]>) appendFact(facts, label, displayValue(value));
  section.append(facts);
  return section;
}

function photoWallSection(body: JsonRecord): HTMLElement {
  const collection = recordValue(body.collection_summary);
  const photos = arrayValue(collection?.photo_ids);
  const wall = recordValue(collection?.photo_wall);
  const assets = new Map(arrayValue(collection?.photo_assets).flatMap((value) => {
    const asset = recordValue(value);
    const photoId = asset == null ? undefined : numericValue(asset.photo_id);
    return asset && photoId != null ? [[String(photoId), asset] as const] : [];
  }));
  const placements = wall ? Object.entries(wall) : [];
  const section = profileSection("Photo Wall", `${photos.length} photos · ${placements.length} displayed`);
  const grid = element("div", "profile-item-grid photo-wall-grid");
  for (const [slot, photoId] of placements) {
    const card = element("article", "profile-item-card photo-wall-card");
    const asset = assets.get(String(photoId));
    const imageUrl =
      resolvePublishedPhotoUrl(asset?.image_path) ??
      safeImageUrl(asset?.image_url ?? asset?.thumbnail_url);
    if (imageUrl) {
      const image = document.createElement("img");
      image.className = "photo-wall-image";
      image.src = imageUrl;
      image.alt = stringValue(asset?.alt_text) ?? `Photo Wall image ${slot}`;
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";
      card.append(image);
    }
    card.append(
      element("strong", "", `Wall slot ${slot}`),
      imageUrl ? element("small", "", stringValue(asset?.caption) ?? "Published from the in-game Photo Wall") : element("span", "", `Photo ${displayValue(photoId)} · image not uploaded yet`),
    );
    grid.append(card);
  }
  section.append(
    placements.length
      ? grid
      : empty("No Photo Wall placement was present in the latest synced snapshot."),
  );
  return section;
}

function achievementSection(body: JsonRecord): HTMLElement {
  const collection = recordValue(body.collection_summary);
  const achievements = recordValue(collection?.achievements);
  const general = arrayValue(achievements?.general);
  const seasons = arrayValue(achievements?.seasons);
  const seasonalCount = seasons.reduce<number>((total, value) => {
    const season = recordValue(value);
    return total + arrayValue(season?.achievements).length;
  }, 0);
  const section = profileSection(
    "Achievements",
    `${general.length} general · ${seasonalCount} seasonal`,
  );
  const facts = element("dl", "profile-facts");
  appendFact(facts, "General achievements", general.length.toLocaleString());
  appendFact(facts, "Season achievements", seasonalCount.toLocaleString());
  appendFact(facts, "Seasons represented", seasons.length.toLocaleString());
  appendFact(
    facts,
    "Rewards claimed",
    [...general, ...seasons.flatMap((value) => arrayValue(recordValue(value)?.achievements))]
      .filter((value) => recordValue(value)?.reward_claimed === true)
      .length
      .toLocaleString(),
  );
  section.append(facts);
  const groups = element("div", "achievement-groups");
  if (general.length) groups.append(achievementGroup("General achievements", general));
  for (const value of [...seasons].sort((left, right) =>
    (numericValue(recordValue(right)?.season_id) ?? 0) - (numericValue(recordValue(left)?.season_id) ?? 0))) {
    const season = recordValue(value);
    if (!season) continue;
    const seasonId = numericValue(season.season_id);
    const values = arrayValue(season.achievements);
    if (values.length) groups.append(achievementGroup(`Season ${displayValue(seasonId)}`, values));
  }
  if (groups.childElementCount) section.append(groups);
  return section;
}

function achievementGroup(label: string, values: JsonValue[]): HTMLDetailsElement {
  const details = element("details", "achievement-group") as HTMLDetailsElement;
  details.append(element("summary", "", `${label} · ${values.length.toLocaleString()}`));
  let rendered = false;
  details.addEventListener("toggle", () => {
    if (!details.open || rendered) return;
    rendered = true;
    const list = element("div", "achievement-list");
    for (const value of values) {
      const achievement = recordValue(value);
      if (!achievement) continue;
      const achievementId = numericValue(achievement.achievement_id);
      const localized = achievementId == null
        ? undefined
        : presentation.achievements[String(achievementId)];
      const row = element("article", "profile-achievement-row");
      const category = cleanAchievementCategory(localized?.category);
      row.append(
        element("strong", "", localized?.name ?? `Unlocalized achievement ${displayValue(achievementId)}`),
        element("small", "", joinFacts([
          category,
          pair("Level", localized?.achievement_level),
          achievementProgress(achievement, localized),
          achievement.reward_claimed === true ? "Reward claimed" : "",
        ])),
      );
      if (localized?.description) row.append(element("span", "", localized.description));
      list.append(row);
    }
    details.append(list);
  }, { once: false });
  return details;
}

function achievementProgress(
  achievement: JsonRecord,
  localized: ProfilePresentationCatalog["achievements"][string] | undefined,
): string {
  const progress = numericValue(achievement.finish_count ?? achievement.begin_progress);
  const target = numericValue(localized?.target);
  if (progress == null) return "Not completed";
  if (target == null || target <= 0) return `Progress ${progress.toLocaleString()}`;
  return `Progress ${progress.toLocaleString()} / ${target.toLocaleString()}`;
}

function cleanAchievementCategory(value: string | null | undefined): string {
  if (!value || value.length > 64 || /<br\s*\/?>/iu.test(value)) return "";
  return value;
}

function progressSection(body: JsonRecord): HTMLElement {
  const activity = recordValue(body.activity_progress);
  const weekly = recordValue(activity?.weekly_tower);
  const combatProfessions = arrayValue(body.combat_professions);
  const lifeProfessions = arrayValue(body.life_professions);
  const season = recordValue(body.season);
  const section = profileSection("Progression & activities", "Latest observed progress");
  const facts = element("dl", "profile-facts");
  for (const [label, value] of [
    ["Season", season?.season_id],
    ["Season level", season?.level],
    ["Master score", resolvedMasterScore(body)],
    ["Weekly tower highest floor", weekly?.maximum_floor_id],
    ["Challenge dungeons", arrayValue(activity?.challenge_dungeons).length],
    ["Master-mode dungeons", arrayValue(activity?.master_mode_dungeons).length],
    ["Combat professions", combatProfessions.length],
    ["Life professions", lifeProfessions.length],
    ["Reputations", arrayValue(body.reputations).length],
  ] as Array<[string, JsonValue | number | undefined]>) appendFact(facts, label, displayValue(value));
  section.append(facts);
  const masterDungeons = arrayValue(activity?.master_mode_dungeons);
  if (masterDungeons.length) section.append(masterDungeonBreakdown(masterDungeons));
  return section;
}

function masterDungeonBreakdown(values: JsonValue[]): HTMLElement {
  const bySeason = masterDungeonRows(values);
  const container = element("div", "master-score-seasons");
  for (const [seasonId, rows] of [...bySeason.entries()].sort(([left], [right]) => right - left)) {
    const details = element("details", "master-score-season");
    if (seasonId === Math.max(...bySeason.keys())) details.open = true;
    const total = rows.reduce((sum, row) => sum + row.score, 0);
    details.append(element("summary", "", `Season ${seasonId} · ${total.toLocaleString()} Master Score`));
    const table = element("div", "master-score-table");
    table.append(masterScoreRow("Dungeon", "Best difficulty", "Score", "Best time", true));
    for (const row of rows.sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))) {
      table.append(masterScoreRow(row.name, row.difficultyName, row.score.toLocaleString(), formatDuration(row.passTime), false));
    }
    details.append(table);
    container.append(details);
  }
  return container;
}

function masterScoreRow(dungeon: string, difficulty: string, score: string, time: string, heading: boolean): HTMLElement {
  const row = element("div", heading ? "master-score-row master-score-heading" : "master-score-row");
  row.append(element(heading ? "strong" : "span", "", dungeon));
  row.append(element("span", "", difficulty));
  row.append(element("span", "", score));
  row.append(element("span", "", time));
  return row;
}

function profileSection(titleText: string, subtitle: string): HTMLElement {
  const section = element("section", "profile-data-section");
  const heading = element("div", "profile-data-heading");
  heading.append(element("h3", "", titleText), element("small", "", subtitle));
  section.append(heading);
  return section;
}

function stat(label: string, value: string): HTMLElement {
  const node = element("div", "profile-stat");
  node.append(element("small", "", label), element("strong", "", value));
  return node;
}

function compactRow(label: string, value: string): HTMLElement {
  const row = element("div", "profile-compact-row");
  row.append(element("strong", "", label), element("small", "", value || "Observed"));
  return row;
}

function equipmentAttributeSummary(item: JsonRecord): string {
  const attributes = recordValue(item.attributes);
  if (!attributes) return `${arrayValue(item.enchantments).length} enchantments`;
  const count = ["base", "basic", "advanced", "recast", "rare_quality"]
    .reduce((sum, key) => sum + Object.keys(recordValue(attributes[key]) ?? {}).length, 0);
  return `${count} attributes · ${arrayValue(item.enchantments).length} enchantments`;
}

function equipmentAttributeList(item: JsonRecord): HTMLElement | undefined {
  const attributes = recordValue(item.attributes);
  if (!attributes) return undefined;
  const rows = element("div", "profile-compact-list profile-equipment-attributes");
  for (const [category, key] of [
    ["Base", "base"],
    ["Basic", "basic"],
    ["Advanced", "advanced"],
    ["Recast", "recast"],
    ["Rare quality", "rare_quality"],
  ] as const) {
    for (const [attributeId, value] of Object.entries(recordValue(attributes[key]) ?? {})) {
      const localized = presentation.equipment_attributes[attributeId];
      rows.append(compactRow(
        localized?.name ?? `Unknown equipment attribute ${attributeId}`,
        `${category} · Roll value ${displayValue(value)}`,
      ));
    }
  }
  return rows.childElementCount ? rows : undefined;
}

function appendPresentationIcon(target: HTMLElement, value: string | null | undefined, alt: string, className: string): void {
  const url = safePresentationImageUrl(value);
  if (!url) return;
  const image = document.createElement("img");
  image.className = className;
  image.src = url;
  image.alt = alt;
  image.loading = "lazy";
  target.append(image);
}

function qualityLabel(value: JsonValue | undefined): string {
  const quality = numericValue(value);
  if (quality == null) return "";
  return presentation.quality_names[String(quality)] ?? `Quality ${quality}`;
}

function resolvedModuleEffectLevel(
  levels: Array<{ level: number; enhancement_num: number }> | undefined,
  successfulUpgrades: number,
): number {
  return (levels ?? []).reduce(
    (current, row) => successfulUpgrades >= row.enhancement_num ? Math.max(current, row.level) : current,
    0,
  );
}

function resolvedMeowluxScore(body: JsonRecord): number | undefined {
  const collection = recordValue(body.collection_summary);
  const points = [collection?.fashion_points, collection?.mount_points, collection?.weapon_skin_points]
    .map(numericValue)
    .filter((value): value is number => value != null);
  return points.length ? points.reduce((sum, value) => sum + value, 0) : undefined;
}

interface MasterDungeonRow {
  dungeonId: number;
  name: string;
  difficultyId: number;
  difficultyName: string;
  score: number;
  passTime?: number;
}

function masterDungeonRows(values: JsonValue[]): Map<number, MasterDungeonRow[]> {
  const seasons = new Map<number, Map<number, MasterDungeonRow>>();
  for (const value of values) {
    const entry = recordValue(value);
    const dungeon = recordValue(entry?.dungeon);
    const seasonId = numericValue(entry?.season_id);
    const difficultyId = numericValue(entry?.difficulty_id);
    const dungeonId = numericValue(dungeon?.dungeon_id);
    if (seasonId == null || difficultyId == null || dungeonId == null || dungeonId < 1 || dungeonId > 20) continue;
    const score = Math.max(0, numericValue(dungeon?.score) ?? 0);
    const passTime = numericValue(dungeon?.pass_time);
    const season = seasons.get(seasonId) ?? new Map<number, MasterDungeonRow>();
    const current = season.get(difficultyId);
    const localizedDungeon = presentation.dungeons[String(difficultyId)];
    if (!current || score > current.score || (score === current.score && passTime != null && (current.passTime == null || passTime < current.passTime))) {
      season.set(difficultyId, {
        dungeonId: difficultyId,
        name: localizedDungeon?.name ?? `Dungeon ${difficultyId}`,
        difficultyId: dungeonId,
        difficultyName: `Master ${dungeonId}`,
        score,
        passTime,
      });
    }
    seasons.set(seasonId, season);
  }
  return new Map([...seasons].map(([seasonId, rows]) => [
    seasonId,
    [...rows.values()].sort((left, right) => left.dungeonId - right.dungeonId).slice(0, 6),
  ]));
}

function resolvedMasterScore(body: JsonRecord): number | undefined {
  const observed = numericValue(body.master_score);
  if (observed != null) return observed;
  const activity = recordValue(body.activity_progress);
  const bySeason = masterDungeonRows(arrayValue(activity?.master_mode_dungeons));
  if (!bySeason.size) return undefined;
  const currentSeason = numericValue(recordValue(body.season)?.season_id);
  const selectedSeason = currentSeason != null && bySeason.has(currentSeason)
    ? currentSeason
    : Math.max(...bySeason.keys());
  return (bySeason.get(selectedSeason) ?? []).reduce((sum, row) => sum + row.score, 0);
}

function formatDuration(value: number | undefined): string {
  if (value == null || value < 0) return "—";
  const seconds = Math.round(value);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function appendFact(target: HTMLDListElement, label: string, value: string): void {
  target.append(element("dt", "", label), element("dd", "", value));
}

function compactValue(value: JsonValue): string {
  if (Array.isArray(value)) return `${value.length} records`;
  const record = recordValue(value);
  if (record) return `${Object.keys(record).length} fields`;
  return displayValue(value);
}

function pair(label: string, value: JsonValue | undefined, suffix = ""): string {
  if (value === null || value === undefined) return "";
  return `${label} ${displayValue(value)}${suffix}`;
}

function joinFacts(values: string[]): string {
  return values.filter(Boolean).join(" · ");
}

function displayNumber(value: JsonValue | undefined): string {
  return typeof value === "number" ? value.toLocaleString() : displayValue(value);
}

function displayValue(value: JsonValue | number | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "string") return value;
  return compactValue(value);
}

function stringValue(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.length ? value : undefined;
}

function numericValue(value: JsonValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function safePresentationImageUrl(value: string | null | undefined): string | undefined {
  if (typeof value !== "string" || value.length > 2_048) return undefined;
  if (value.startsWith("/assets/")) return value;
  return safeImageUrl(value);
}

function safeImageUrl(value: JsonValue | undefined): string | undefined {
  if (typeof value !== "string" || value.length > 2_048) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function resolvePublishedPhotoUrl(
  value: JsonValue | undefined,
  configuredApiBase = apiBase,
): string | undefined {
  if (
    typeof value !== "string" ||
    !/^\/v1\/profiles\/prf_[a-z0-9_]+\/photo-wall\/[1-9][0-9]*$/u.test(value)
  ) {
    return undefined;
  }
  try {
    const base = new URL(configuredApiBase);
    if (
      base.protocol !== "https:" ||
      base.username ||
      base.password ||
      base.pathname !== "/" ||
      base.search ||
      base.hash
    ) {
      return undefined;
    }
    return new URL(value, base).href;
  } catch {
    return undefined;
  }
}

function recordValue(value: JsonValue | undefined): JsonRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : undefined;
}

function arrayValue(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}

function empty(copy: string): HTMLElement {
  return element("p", "empty-state", copy);
}

function title(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function relativeTime(timestamp: number): string {
  const seconds = Math.round((timestamp - Date.now()) / 1_000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}
