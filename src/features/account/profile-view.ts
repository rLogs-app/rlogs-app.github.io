import type { JsonValue } from "../../contracts/website-payload";
import type { PublishedProfile } from "../profiles/published-profile-loader";

type JsonRecord = Record<string, JsonValue>;

export function renderSyncedCharacterProfile(profile: PublishedProfile): HTMLElement {
  const body = profile.envelope.body;
  const root = element("article", "synced-character-profile");
  const heading = element("header", "character-profile-heading");
  const identity = element("div");
  identity.append(
    element("p", "eyebrow", "Synced character"),
    element("h2", "", stringValue(body.display_name) ?? profile.entry.label),
    element(
      "p",
      "identity-id",
      `UID ${profile.entry.character_id} · ${[profile.entry.region, profile.entry.realm ?? profile.entry.world].filter(Boolean).join(" · ")}`,
    ),
  );
  heading.append(identity, element("span", "profile-last-seen", `Last seen ${relativeTime(profile.entry.source_updated_unix_millis ?? profile.entry.source_created_unix_millis ?? Date.now())}`));
  root.append(heading);

  const summary = element("div", "profile-stat-grid");
  const modules = recordValue(body.modules);
  const inventory = arrayValue(modules?.inventory);
  const equippedSlots = recordValue(modules?.equipped_slots);
  for (const [label, value] of [
    ["Level", displayValue(body.level)],
    ["Combat power", displayNumber(body.combat_power)],
    ["Season strength", displayNumber(body.season_strength)],
    ["Equipment", String(arrayValue(body.equipment).length)],
    ["Modules", String(inventory.length)],
    ["Imagines", String(arrayValue(body.owned_imagines).length)],
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
    const card = element("article", "profile-item-card");
    card.append(
      element("strong", "", `Slot ${displayValue(item.slot_id)}`),
      element("span", "", `Item ${displayValue(item.item_id)}`),
      element("small", "", joinFacts([
        pair("Level", item.level),
        pair("Quality", item.quality),
        pair("Refinement", item.refinement_level),
        pair("Set", item.set_id),
      ])),
      element("small", "", equipmentAttributeSummary(item)),
    );
    grid.append(card);
  }
  section.append(items.length ? grid : empty("No equipment was present in the latest synced snapshot."));
  return section;
}

function imagineSection(owned: JsonValue[], skills: JsonValue[]): HTMLElement {
  const equipped = owned.filter((value) => recordValue(value)?.equipped_slot != null).length;
  const section = profileSection("Battle Imagines", `${owned.length} unlocked · ${equipped} equipped`);
  const list = element("div", "profile-compact-list");
  for (const value of owned) {
    const item = recordValue(value);
    if (!item) continue;
    list.append(compactRow(
      `Imagine ${displayValue(item.imagine_id)}`,
      joinFacts([pair("Level", item.level), pair("Breakthrough", item.breakthrough_level), pair("Slot", item.equipped_slot)]),
    ));
  }
  if (skills.length) list.append(compactRow("Equipped Imagine skills", `${skills.length} synced skill records`));
  section.append(owned.length || skills.length ? list : empty("No unlocked Imagine data was present in the latest snapshot."));
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
    list.append(compactRow(
      `Slot ${slot} · Module ${displayValue(module?.config_id)}`,
      joinFacts([pair("Level", module?.level), pair("Quality", module?.quality), pair("Success", module?.success_rate, "%")]),
    ));
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
    if (skill) list.append(compactRow(`Skill ${displayValue(skill.skill_id)}`, joinFacts([pair("Level", skill.level), pair("Remodel", skill.remodel_level)])));
  }
  for (const value of talents) {
    const talent = recordValue(value);
    if (talent) list.append(compactRow(`Talent ${displayValue(talent.talent_id)}`, pair("Level", talent.level)));
  }
  if (actions.length) list.append(compactRow("Equipped action slots", `${actions.length} bindings`));
  section.append(list.childElementCount ? list : empty("No skill or talent data was present in the latest snapshot."));
  return section;
}

function collectionsSection(body: JsonRecord): HTMLElement {
  const appearance = recordValue(body.appearance);
  const collection = recordValue(body.collection_summary);
  const social = recordValue(body.social_display);
  const section = profileSection("Collections & appearance", "Privacy-reviewed unlock data");
  const facts = element("dl", "profile-facts");
  for (const [label, value] of [
    ["Fashion points", collection?.fashion_points],
    ["Mount points", collection?.mount_points],
    ["Weapon skin points", collection?.weapon_skin_points],
    ["Profile images unlocked", arrayValue(appearance?.unlocked_profile_image_ids).length],
    ["Fashion owned", arrayValue(collection?.owned_fashion_ids).length],
    ["Mounts owned", arrayValue(collection?.owned_mount_ids).length],
    ["Weapon skins owned", arrayValue(collection?.owned_weapon_skin_ids).length],
    ["Vanity pets", arrayValue(collection?.vanity_pet_ids).length],
    ["Guild", social?.guild_name],
    ["Titles", arrayValue(social?.title_ids).length],
    ["Medals", arrayValue(social?.medal_ids).length],
  ] as Array<[string, JsonValue | number | undefined]>) appendFact(facts, label, displayValue(value));
  section.append(facts);
  return section;
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
    ["Weekly tower highest floor", weekly?.maximum_floor_id],
    ["Challenge dungeons", arrayValue(activity?.challenge_dungeons).length],
    ["Master-mode dungeons", arrayValue(activity?.master_mode_dungeons).length],
    ["Combat professions", combatProfessions.length],
    ["Life professions", lifeProfessions.length],
    ["Reputations", arrayValue(body.reputations).length],
  ] as Array<[string, JsonValue | number | undefined]>) appendFact(facts, label, displayValue(value));
  section.append(facts);
  return section;
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
