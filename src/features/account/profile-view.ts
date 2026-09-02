import type { JsonValue } from "../../contracts/website-payload";
import type { PublishedProfile } from "../profiles/published-profile-loader";
import {
  loadProfilePresentation,
  type ProfilePresentationCatalog,
} from "../profiles/profile-presentation";

type JsonRecord = Record<string, JsonValue>;
let presentation: ProfilePresentationCatalog;
let profileDetailModal: ProfileDetailModal;
const apiBase = String(import.meta.env.VITE_RLOGS_API_BASE_URL ?? "").replace(/\/$/u, "");

interface ProfileDetailModal {
  host: HTMLElement;
  show(title: string, content: HTMLElement, trigger: HTMLElement): void;
}

export async function renderSyncedCharacterProfile(profile: PublishedProfile): Promise<HTMLElement> {
  presentation = await loadProfilePresentation();
  const body = profile.envelope.body;
  const root = element("article", "synced-character-profile");
  const characterName = stringValue(body.display_name) ?? profile.entry.label;
  profileDetailModal = createProfileDetailModal(characterName, profile.entry.character_id);
  const heading = element("header", "character-profile-heading");
  const identity = element("div", "character-profile-identity");
  const appearance = recordValue(body.appearance);
  const profileImageUrl = safeImageUrl(appearance?.profile_image_url);
  if (profileImageUrl) {
    const image = document.createElement("img");
    image.className = "character-profile-picture";
    image.src = profileImageUrl;
    image.alt = `${characterName} profile picture`;
    image.loading = "eager";
    image.referrerPolicy = "no-referrer";
    identity.append(image);
  }
  const identityCopy = element("div");
  identityCopy.append(
    element("p", "eyebrow", "Synced character"),
    element("h2", "", characterName),
    element(
      "p",
      "identity-id",
      `UID ${profile.entry.character_id} · ${[profile.entry.region, profile.entry.realm ?? profile.entry.world].filter(Boolean).join(" · ")}`,
    ),
  );
  identity.append(identityCopy);
  heading.append(identity, element("span", "profile-last-seen", `Last seen ${relativeTime(profile.entry.source_updated_unix_millis ?? profile.entry.source_created_unix_millis ?? Date.now())}`));
  root.append(heading);

  const showcase = element("div", "profile-showcase");
  const halfBodyImageUrl = safeImageUrl(appearance?.half_body_image_url);
  if (halfBodyImageUrl) {
    const portraitPanel = element("figure", "character-portrait-panel");
    const portrait = document.createElement("img");
    portrait.className = "character-half-body-picture";
    portrait.src = halfBodyImageUrl;
    portrait.alt = `${characterName} character portrait`;
    portrait.loading = "lazy";
    portrait.referrerPolicy = "no-referrer";
    portraitPanel.append(portrait);
    showcase.append(portraitPanel);
  }
  const photoWall = photoWallSection(body);
  photoWall.classList.add("profile-showcase-photo-wall");
  showcase.append(photoWall);
  if (!halfBodyImageUrl) showcase.classList.add("is-photo-only");
  root.append(showcase);

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
    ["Modules", String(inventory.length)],
    ["Imagines", String(Math.max(arrayValue(body.owned_imagines).length, arrayValue(body.battle_imagine_skills).length))],
  ]) {
    summary.append(stat(label, value));
  }
  root.append(summary);

  const content = element("div", "profile-content");

  const combatGroup = profileSectionGroup(
    "Combat & current build",
    "The newest complete character snapshot, followed by the loadout it describes.",
  );
  const combatSections = element("div", "profile-section-grid");
  combatSections.classList.add("profile-combat-section-grid");
  combatSections.append(
    combatStatsSection(body),
    imagineSection(arrayValue(body.owned_imagines), arrayValue(body.battle_imagine_skills)),
    equipmentSection(body),
    moduleSection(inventory, equippedSlots),
  );
  combatGroup.append(combatSections, skillsSection(body));

  const progressionGroup = profileSectionGroup(
    "Combat progression",
    "Season, Master Score, and activity records derived from verified profile observations.",
  );
  progressionGroup.append(progressSection(body));

  const collectionGroup = profileSectionGroup(
    "Collections, achievements & social",
    "Casual progression and display collections follow the combat-oriented profile.",
  );
  const collectionSections = element("div", "profile-section-grid");
  const collectionPrimary = element("div", "profile-section-column");
  const collectionSecondary = element("div", "profile-section-column");
  collectionPrimary.append(collectionsSection(body));
  collectionSecondary.append(achievementSection(body));
  collectionSections.append(collectionPrimary, collectionSecondary);
  collectionGroup.append(collectionSections);

  content.append(combatGroup, progressionGroup, collectionGroup);
  root.append(content);

  const facts = element("dl", "profile-facts");
  const represented = new Set([
    "equipment",
    "equipment_suit_entries",
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
  const extraGroup = profileSectionGroup(
    "Extra character data",
    "Additional synced fields that do not belong to the combat or collection summaries above.",
  );
  extraGroup.append(profileDetailButton(
    "View all other synced character details",
    "Extra character data",
    () => facts,
  ));
  root.append(extraGroup);
  return root;
}

function createProfileDetailModal(characterName: string, characterId: string): ProfileDetailModal {
  document.body.classList.remove("profile-modal-open");
  document.querySelector("#profile-detail-modal")?.remove();
  const host = element("div", "profile-detail-modal");
  host.id = "profile-detail-modal";
  host.hidden = true;
  const panel = element("section", "profile-detail-modal-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  const heading = element("header", "profile-detail-modal-heading");
  const headingCopy = element("div", "profile-detail-modal-heading-copy");
  const title = element("h2", "");
  const identity = element("p", "profile-detail-modal-identity", `${characterName} · UID ${characterId}`);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "profile-detail-modal-close";
  close.setAttribute("aria-label", "Close profile details");
  close.textContent = "×";
  const content = element("div", "profile-detail-modal-content");
  headingCopy.append(title, identity);
  heading.append(headingCopy, close);
  panel.append(heading, content);
  host.append(panel);
  document.body.append(host);
  let restoreFocus: HTMLElement | null = null;

  const hide = (): void => {
    if (host.hidden) return;
    host.hidden = true;
    document.body.classList.remove("profile-modal-open");
    restoreFocus?.focus();
    restoreFocus = null;
  };
  close.addEventListener("click", hide);
  host.addEventListener("click", (event) => {
    if (event.target === host) hide();
  });
  host.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hide();
  });

  return {
    host,
    show(label, detail, trigger) {
      restoreFocus = trigger;
      title.textContent = label;
      panel.setAttribute("aria-label", label);
      panel.classList.toggle(
        "profile-detail-modal-panel--equipment",
        detail.classList.contains("profile-equipment-modal-detail"),
      );
      content.replaceChildren(detail);
      host.hidden = false;
      document.body.classList.add("profile-modal-open");
      close.focus();
    },
  };
}

function profileDetailButton(
  label: string,
  modalTitle: string,
  buildContent: () => HTMLElement,
): HTMLButtonElement {
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "profile-detail-trigger";
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.textContent = label;
  trigger.addEventListener("click", () => {
    profileDetailModal.show(modalTitle, buildContent(), trigger);
  });
  return trigger;
}

export type CombatStatComponent =
  | "final"
  | "total"
  | "add"
  | "extra_add"
  | "percent"
  | "extra_percent";

export interface CombatStatComponentView {
  attributeId: number;
  component: CombatStatComponent;
  value: number;
  numberType: number;
  formatType: number;
}

export interface CombatStatFamilyView {
  familyId: number;
  name: string;
  components: CombatStatComponentView[];
}

const combatStatComponentOrder: CombatStatComponent[] = [
  "final",
  "total",
  "add",
  "extra_add",
  "percent",
  "extra_percent",
];

export function resolveCombatStatFamilies(
  snapshotValues: Record<string, JsonValue>,
  catalog: ProfilePresentationCatalog,
): CombatStatFamilyView[] {
  const families = new Map<number, CombatStatFamilyView>();
  for (const [rawAttributeId, rawValue] of Object.entries(snapshotValues)) {
    const attributeId = Number(rawAttributeId);
    const value = numericValue(rawValue);
    const localized = catalog.fight_attributes[rawAttributeId];
    const component = localized?.component;
    const familyId = localized?.family_id;
    if (
      !Number.isSafeInteger(attributeId) ||
      value == null ||
      familyId == null ||
      component == null ||
      localized.displayable === false
    ) continue;
    const family = families.get(familyId) ?? {
      familyId,
      name: localized.name,
      components: [],
    };
    family.components.push({
      attributeId,
      component,
      value,
      numberType: localized.number_type,
      formatType: localized.format_type,
    });
    if (component === "final") family.name = localized.name;
    families.set(familyId, family);
  }
  return [...families.values()]
    .map((family) => ({
      ...family,
      components: family.components.sort(
        (left, right) =>
          combatStatComponentOrder.indexOf(left.component) -
            combatStatComponentOrder.indexOf(right.component) ||
          left.attributeId - right.attributeId,
      ),
    }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.familyId - right.familyId);
}

function combatStatsSection(body: JsonRecord): HTMLElement {
  const combatStats = recordValue(body.combat_stats);
  const snapshotValues = recordValue(combatStats?.snapshot_values) ?? {};
  const families = resolveCombatStatFamilies(snapshotValues, presentation);
  const section = profileSection(
    "Character stats",
    `${families.length.toLocaleString()} localized stat families · newest complete snapshot`,
  );
  if (!families.length) {
    section.append(empty("The latest synced profile did not include a complete character-stat snapshot yet."));
    return section;
  }

  const nonzero = families.filter((family) =>
    family.components.some((component) => component.value !== 0)
  );
  const zero = families.filter((family) =>
    family.components.every((component) => component.value === 0)
  );
  section.append(element(
    "small",
    "profile-observation-note",
    "Profile values come from the newest complete character snapshot. Temporary combat buffs and deltas are shown only in the live Stats overlay.",
  ));
  if (nonzero.length) section.append(combatStatGrid(nonzero.slice(0, 6), false));
  section.append(profileDetailButton(
    `View all ${families.length.toLocaleString()} observed stats`,
    "Character stats",
    () => {
      const detail = element("div", "profile-detail-stack");
      detail.append(
        element("p", "profile-detail-intro", "Current nonzero values and their exact packet components."),
        combatStatGrid(nonzero, true),
      );
      if (zero.length) {
        detail.append(
          element("h3", "profile-detail-subheading", `${zero.length.toLocaleString()} observed zero-value stats`),
          combatStatGrid(zero, true),
        );
      }
      return detail;
    },
  ));
  return section;
}

function combatStatGrid(
  families: CombatStatFamilyView[],
  includeBreakdowns: boolean,
): HTMLElement {
  const grid = element("div", "profile-combat-stat-grid");
  for (const family of families) {
    const final = family.components.find((component) => component.component === "final") ??
      family.components[0];
    if (!final) continue;
    const card = element("article", "profile-combat-stat-card");
    card.append(
      element("strong", "profile-combat-stat-value", formatFightAttributeValue(
        final.value,
        final.numberType,
        final.formatType,
      )),
      element("span", "profile-combat-stat-name", family.name),
    );
    if (includeBreakdowns && family.components.length > 1) {
      const breakdown = element("div", "profile-combat-stat-breakdown");
      const rows = element("div", "profile-compact-list");
      for (const component of family.components) {
        rows.append(compactRow(
          combatStatComponentLabel(component.component),
          formatSignedFightAttributeValue(component.value, component.numberType, component.formatType),
        ));
      }
      breakdown.append(element("small", "profile-detail-label", "Breakdown"), rows);
      card.append(breakdown);
    }
    grid.append(card);
  }
  return grid;
}

function combatStatComponentLabel(component: CombatStatComponent): string {
  return ({
    final: "Final",
    total: "Total",
    add: "Additive",
    extra_add: "Extra additive",
    percent: "Percent",
    extra_percent: "Extra percent",
  } satisfies Record<CombatStatComponent, string>)[component];
}

function equipmentSection(body: JsonRecord): HTMLElement {
  const items = arrayValue(body.equipment);
  const suitEntries = arrayValue(body.equipment_suit_entries);
  const section = profileSection("Current equipment", `${items.length} equipped pieces`);
  const grid = element("div", "profile-item-grid profile-equipment-grid");
  for (const value of items) {
    const item = recordValue(value);
    if (!item) continue;
    const itemId = numericValue(item.item_id);
    const slotId = numericValue(item.slot_id);
    const localized = itemId == null ? undefined : presentation.items[String(itemId)];
    const setId = numericValue(item.set_id) ?? localized?.set_id ?? undefined;
    const setEffects = resolveActiveEquipmentSetEffects(suitEntries, setId, presentation);
    const slotName = slotId == null ? "Equipment" : presentation.equipment_slots[String(slotId)] ?? `Equipment slot ${slotId}`;
    const card = element("article", "profile-item-card profile-equipment-card");
    const equipmentQuality = item.quality ?? localized?.quality;
    const qualityToken = equipmentQualityToken(equipmentQuality);
    if (qualityToken) card.dataset.quality = qualityToken;
    appendPresentationIcon(card, localized?.icon, localized?.name ?? slotName, "profile-item-icon");
    const copy = element("div", "profile-equipment-copy");
    copy.append(
      element("small", "profile-item-kicker", slotName),
      element("strong", "", localized?.name ?? `Unknown equipment ${displayValue(item.item_id)}`),
      element("small", "", joinFacts([
        pair("Item level", resolveEquipmentItemLevel(item, localized)),
        qualityLabel(equipmentQuality),
        pair("Refinement +", item.refinement_level),
      ])),
    );
    card.append(copy);
    const enchantments = arrayValue(item.enchantments);
    if (equipmentAttributeList(item) || enchantments.length || setEffects.length) {
      card.append(profileDetailButton(
        "View details",
        localized?.name ?? slotName,
        () => equipmentDetailPanel(item, setEffects, enchantments),
      ));
    }
    grid.append(card);
  }
  section.append(items.length ? grid : empty("No equipment was present in the latest synced snapshot."));
  return section;
}

function equipmentDetailPanel(
  item: JsonRecord,
  setEffects: ResolvedEquipmentSetEffect[],
  enchantments: JsonValue[],
): HTMLElement {
  const detail = element("div", "profile-detail-stack profile-equipment-modal-detail");
  const attributes = equipmentAttributeList(item);
  if (attributes) {
    detail.append(element("h3", "profile-detail-subheading", "Attributes"), attributes);
  }
  if (setEffects.length) detail.append(equipmentSetEffectList(setEffects));
  if (enchantments.length) {
    detail.append(
      element("h3", "profile-detail-subheading", "Sigils"),
      equipmentSigilList(enchantments),
    );
  }
  return detail;
}

function equipmentSigilList(enchantments: JsonValue[]): HTMLElement {
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
  return sigils;
}

export interface ResolvedEquipmentSetEffect {
  name: string;
  requiredPieces: number;
  effects: string[];
}

export function resolveActiveEquipmentSetEffects(
  entries: JsonValue[],
  setId: number | undefined,
  catalog: ProfilePresentationCatalog,
): ResolvedEquipmentSetEffect[] {
  if (setId == null) return [];
  const resolved: ResolvedEquipmentSetEffect[] = [];
  for (const rawEntry of entries) {
    const entry = recordValue(rawEntry);
    const mapKey = numericValue(entry?.map_key);
    const set = mapKey == null ? undefined : catalog.equipment_sets[String(mapKey)];
    if (!entry || !set || set.suit_id !== setId) continue;
    const effects: string[] = [];
    for (const [attributeId, rawValue] of Object.entries(recordValue(entry.attributes) ?? {})) {
      const rollValue = numericValue(rawValue);
      const attribute = catalog.equipment_attributes[attributeId];
      if (rollValue == null || !attribute) continue;
      for (const effect of attribute.equipment_effects ?? []) {
        const value = interpolateEquipmentAttributeValue(effect.minimum, effect.maximum, rollValue);
        effects.push(`${effect.name} ${formatSignedFightAttributeValue(value, effect.number_type, effect.format_type)}`);
      }
      for (const effect of attribute.equipment_buff_effects ?? []) {
        effects.push(materializeEquipmentBuffDescription(effect.description, effect.parameters, rollValue));
      }
      if (!(attribute.equipment_effects?.length || attribute.equipment_buff_effects?.length)) {
        effects.push(attribute.name);
      }
    }
    if (effects.length) resolved.push({ name: set.name, requiredPieces: set.required_pieces, effects });
  }
  return resolved.sort((left, right) => left.requiredPieces - right.requiredPieces);
}

function equipmentSetEffectList(effects: ResolvedEquipmentSetEffect[]): HTMLElement {
  const panel = element("div", "profile-active-set-effects");
  panel.append(element("strong", "", "Active set effects"));
  for (const effect of effects) {
    panel.append(compactRow(effect.name, effect.effects.join(" · ")));
  }
  return panel;
}

function imagineSection(owned: JsonValue[], skills: JsonValue[]): HTMLElement {
  const records = skills.length ? skills : owned;
  const equipped = records.filter((value) => recordValue(value)?.equipped_slot != null).length;
  const section = profileSection("Battle Imagines", `${records.length} observed · ${equipped} equipped`);
  const sorted = [...records].sort((left, right) => Number(recordValue(right)?.equipped_slot != null) - Number(recordValue(left)?.equipped_slot != null));
  const equippedRecords = sorted.filter((value) => recordValue(value)?.equipped_slot != null);
  const preview = equippedRecords.length ? equippedRecords : sorted.slice(0, 6);
  section.append(
    preview.length
      ? battleImagineGrid(preview)
      : empty("No Battle Imagine data was present in the latest snapshot."),
  );
  const previewSet = new Set(preview);
  const remaining = sorted.filter((value) => !previewSet.has(value));
  if (remaining.length) {
    section.append(profileDetailButton(
      `View all ${sorted.length} Battle Imagines`,
      "Battle Imagine collection",
      () => battleImagineGrid(sorted),
    ));
  }
  return section;
}

function battleImagineGrid(records: JsonValue[]): HTMLElement {
  const grid = element("div", "profile-item-grid profile-imagine-grid");
  for (const value of records) {
    const item = recordValue(value);
    if (!item) continue;
    const skillId = numericValue(item.skill_id ?? item.base_skill_id);
    const imagineId = numericValue(item.imagine_id);
    const localized = skillId == null
      ? Object.values(presentation.imagines).find((entry) => entry.item_id === imagineId)
      : presentation.imagines[String(skillId)];
    const observedTier = numericValue(item.remodel_level ?? item.breakthrough_level) ?? 0;
    const rarity = battleImagineRarityLabel(localized?.rarity, localized?.item_tier);
    const displayName = battleImagineDisplayName(localized?.name);
    const card = element("article", "profile-item-card profile-imagine-card");
    if (rarity) card.dataset.rarity = rarity.toLowerCase();
    card.dataset.tier = String(observedTier);
    appendPresentationIcon(card, localized?.icon, displayName || "Battle Imagine", "profile-item-icon");
    const copy = element("span", "profile-imagine-copy");
    copy.append(
      element("strong", "", displayName || `Unknown Battle Imagine ${displayValue(item.imagine_id ?? item.skill_id)}`),
      element("small", "", battleImagineOwnershipFacts(
        observedTier,
        item.equipped_slot,
        rarity,
      )),
    );
    card.append(copy);
    grid.append(card);
  }
  return grid;
}

export function battleImagineOwnershipFacts(
  tier: JsonValue | undefined,
  equippedSlot: JsonValue | undefined,
  rarity = "",
): string {
  const observedTier = numericValue(tier) ?? 0;
  const sourceSlot = numericValue(equippedSlot);
  const displaySlot = sourceSlot === 7 ? 8 : sourceSlot === 8 ? 9 : sourceSlot;
  return joinFacts([
    `Tier ${observedTier}`,
    rarity,
    displaySlot == null ? "" : `Equipped · Position ${displaySlot}`,
  ]);
}

export function battleImagineRarityLabel(
  rarity: JsonValue | undefined,
  legacyItemTier?: JsonValue | undefined,
): string {
  if (typeof rarity === "string" && ["Epic", "SR", "SSR", "Collab"].includes(rarity)) {
    return rarity;
  }
  const tier = numericValue(legacyItemTier ?? rarity);
  return ({ 3: "Epic", 4: "SR", 5: "SSR" } as Record<number, string>)[tier ?? -1] ?? "";
}

export function battleImagineDisplayName(value: JsonValue | undefined): string {
  if (typeof value !== "string") return "";
  return value.replace(/^Battle Imagine\s*[-–—:]\s*/i, "").trim();
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
  const equippedSlots = resolveEquippedSkillSlots(body);
  const equippedRoleSlots = resolveEquippedRoleSkillSlots(body);
  const tree = resolveTalentTreeLayout(body, presentation);
  const section = profileSection(
    "Combat loadout & talents",
    `${equippedSlots.length} combat actions · ${equippedRoleSlots.length} role skills · ${tree?.selectedCount ?? talents.length} talent points`,
  );
  section.classList.add("profile-combat-talents-section");

  if (equippedSlots.length) {
    section.append(equippedSkillsPanel(body, skills, equippedSlots));
  } else {
    section.append(empty("The latest snapshot did not include an equipped combat loadout."));
  }
  if (equippedRoleSlots.length) section.append(equippedRoleSkillsPanel(body, equippedRoleSlots));

  const equippedSkillIds = new Set(
    [...equippedSlots, ...equippedRoleSlots].map((slot) => slot.skillId),
  );
  const learnedSkills = skills.filter((value) => {
    const skill = recordValue(value);
    const skillId = skill == null ? undefined : numericValue(skill.skill_id ?? skill.base_skill_id);
    return skillId != null && !equippedSkillIds.has(skillId);
  });
  if (learnedSkills.length) section.append(learnedSkillsPanel(learnedSkills));

  if (tree) {
    section.append(profileDetailButton(
      `Open ${tree.specializationName} talent tree`,
      `${tree.specializationName} talent tree`,
      () => talentTreePanel(tree),
    ));
  } else if (talents.length) {
    section.append(empty("Talent points were observed, but this build's exact tree layout is unavailable."));
  }
  return section;
}

export interface EquippedSkillSlotView {
  slotId: number;
  skillId: number;
}

interface TalentTreeNodeView {
  nodeId: number;
  talentId: number;
  branch: number;
  talentStage: number;
  prerequisiteNodeIds: number[];
  x: number;
  y: number;
  selected: boolean;
}

export interface TalentTreeGeometry {
  width: number;
  height: number;
  nodeSize: number;
  scale: number;
  coordinates: Map<number, { x: number; y: number }>;
}

export interface TalentTreeLayoutView {
  nodes: TalentTreeNodeView[];
  selectedCount: number;
  branch: number;
  specializationName: string;
}

const talentTreeNodeSize = 52;
const talentTreeCoordinateScale = 0.32;
const talentTreeMargin = 80;
const talentTreeMinimumWidth = 760;

export function calculateTalentTreeGeometry(nodes: TalentTreeNodeView[]): TalentTreeGeometry {
  const stageCenters = new Map<number, number>();
  for (const talentStage of new Set(nodes.map((node) => node.talentStage))) {
    const stageNodes = nodes.filter((node) => node.talentStage === talentStage);
    const stageMinimumX = Math.min(...stageNodes.map((node) => node.x));
    const stageMaximumX = Math.max(...stageNodes.map((node) => node.x));
    stageCenters.set(talentStage, (stageMinimumX + stageMaximumX) / 2);
  }
  // BPSR stores the shared foundation tree and the selected specialization in
  // separate horizontal coordinate frames. Align their bounds centers before
  // drawing while preserving every within-stage offset and connection.
  const targetCenter = stageCenters.get(0) ?? stageCenters.values().next().value ?? 0;
  const alignedX = (node: TalentTreeNodeView) =>
    node.x - ((stageCenters.get(node.talentStage) ?? targetCenter) - targetCenter);
  const minimumX = Math.min(...nodes.map(alignedX));
  const maximumX = Math.max(...nodes.map(alignedX));
  const minimumY = Math.min(...nodes.map((node) => node.y));
  const maximumY = Math.max(...nodes.map((node) => node.y));
  const contentWidth = (maximumX - minimumX) * talentTreeCoordinateScale + talentTreeNodeSize;
  const width = Math.max(
    talentTreeMinimumWidth,
    Math.round(contentWidth + talentTreeMargin * 2),
  );
  const height = Math.round(
    (maximumY - minimumY) * talentTreeCoordinateScale + talentTreeMargin * 2 + talentTreeNodeSize,
  );
  const horizontalOffset = (width - contentWidth) / 2;
  const coordinates = new Map(nodes.map((node) => [node.nodeId, {
    x: Math.round((alignedX(node) - minimumX) * talentTreeCoordinateScale + horizontalOffset),
    y: Math.round((node.y - minimumY) * talentTreeCoordinateScale + talentTreeMargin),
  }]));
  return {
    width,
    height,
    nodeSize: talentTreeNodeSize,
    scale: talentTreeCoordinateScale,
    coordinates,
  };
}

export function resolveEquippedSkillSlots(body: JsonRecord): EquippedSkillSlotView[] {
  const direct = arrayValue(body.equipped_action_slots)
    .map(recordValue)
    .filter((slot): slot is JsonRecord => slot != null)
    .map((slot) => ({
      slotId: numericValue(slot.slot_id),
      skillId: numericValue(slot.skill_id),
    }))
    .filter((slot): slot is EquippedSkillSlotView =>
      slot.slotId != null && slot.skillId != null && slot.slotId >= 1 && slot.slotId <= 9
    );
  if (direct.length) return uniqueEquippedSkillSlots(direct);

  const classId = numericValue(body.class_id);
  const profession = arrayValue(body.combat_professions)
    .map(recordValue)
    .find((entry) => entry != null && numericValue(entry.profession_id) === classId);
  const slotted = recordValue(profession?.slotted_skill_ids);
  const professionSlots = slotted == null
    ? []
    : Object.entries(slotted)
      .map(([slotId, skillId]) => ({
        slotId: Number(slotId),
        skillId: numericValue(skillId),
      }))
      .filter((slot): slot is EquippedSkillSlotView =>
        Number.isInteger(slot.slotId) &&
        slot.skillId != null &&
        slot.slotId >= 1 &&
        slot.slotId <= 9
      );
  const imagineSlots = arrayValue(body.battle_imagine_skills)
    .map(recordValue)
    .filter((entry): entry is JsonRecord => entry != null)
    .map((entry) => ({
      slotId: numericValue(entry.equipped_slot),
      skillId: numericValue(entry.skill_id),
    }))
    .filter((slot): slot is EquippedSkillSlotView =>
      slot.slotId != null && slot.skillId != null && slot.slotId >= 1 && slot.slotId <= 9
    );
  return uniqueEquippedSkillSlots([...professionSlots, ...imagineSlots]);
}

export function resolveEquippedRoleSkillSlots(body: JsonRecord): EquippedSkillSlotView[] {
  return uniqueEquippedSkillSlots(
    arrayValue(body.equipped_action_slots)
      .map(recordValue)
      .filter((slot): slot is JsonRecord => slot != null)
      .map((slot) => ({
        slotId: numericValue(slot.slot_id),
        skillId: numericValue(slot.skill_id),
      }))
      .filter((slot): slot is EquippedSkillSlotView =>
        slot.slotId != null && slot.skillId != null && slot.slotId >= 21 && slot.slotId <= 24
      ),
  );
}

function uniqueEquippedSkillSlots(slots: EquippedSkillSlotView[]): EquippedSkillSlotView[] {
  return [...new Map(
    slots
      .sort((left, right) => left.slotId - right.slotId)
      .map((slot) => [slot.slotId, slot]),
  ).values()];
}

export function resolveTalentTreeLayout(
  body: JsonRecord,
  catalog: ProfilePresentationCatalog,
): TalentTreeLayoutView | undefined {
  const professionId = numericValue(body.class_id);
  if (professionId == null) return undefined;
  const selectedNodeIds = new Set(
    arrayValue(body.talents)
      .map(recordValue)
      .map((talent) => talent == null
        ? undefined
        : numericValue(talent.node_id ?? talent.talent_id))
      .filter((nodeId): nodeId is number => nodeId != null),
  );
  const indexedTree = catalog.talent_tree_index?.[String(professionId)];
  const indexedSpecialization = indexedTree?.specializations
    .map((specialization) => ({
      ...specialization,
      selectedCount: specialization.node_ids.filter((nodeId) => selectedNodeIds.has(nodeId)).length,
    }))
    .sort((left, right) => right.selectedCount - left.selectedCount || left.branch - right.branch)[0];
  const indexedNodeIds = indexedTree && indexedSpecialization
    ? new Set(indexedSpecialization.node_ids)
    : undefined;
  const candidates = (indexedNodeIds
    ? [...indexedNodeIds].map((nodeId) => [String(nodeId), catalog.talent_nodes[String(nodeId)]] as const)
    : Object.entries(catalog.talent_nodes))
    .map(([nodeId, node]) => {
      const position = node?.position;
      if (
        node == null ||
        node.profession_id !== professionId ||
        node.talent_id == null ||
        node.branch == null ||
        node.talent_stage == null ||
        position == null ||
        !Number.isFinite(position.x) ||
        !Number.isFinite(position.y)
      ) return undefined;
      return {
        nodeId: Number(nodeId),
        talentId: node.talent_id,
        branch: node.branch,
        talentStage: node.talent_stage,
        prerequisiteNodeIds: node.prerequisite_node_ids ?? [],
        x: position.x,
        y: position.y,
        selected: selectedNodeIds.has(Number(nodeId)),
      } satisfies TalentTreeNodeView;
    })
    .filter((node): node is TalentTreeNodeView => node != null && Number.isInteger(node.nodeId));
  if (!candidates.length) return undefined;

  const selectedBranches = new Map<number, number>();
  for (const node of candidates) {
    if (node.talentStage !== 1 || !node.selected) continue;
    selectedBranches.set(node.branch, (selectedBranches.get(node.branch) ?? 0) + 1);
  }
  const branch = indexedSpecialization?.branch ?? [...selectedBranches.entries()]
    .sort((left, right) => right[1] - left[1] || left[0] - right[0])[0]?.[0] ?? 0;
  const nodes = candidates
    .filter((node) => indexedNodeIds != null || (node.talentStage === 1 && node.branch === branch))
    .sort((left, right) => left.y - right.y || left.x - right.x || left.nodeId - right.nodeId);
  if (!nodes.length) return undefined;
  const specializationNode = nodes.find((node) =>
    node.selected && presentationTalent(catalog, node.talentId)?.talent_type === 5
  );
  return {
    nodes,
    selectedCount: nodes.filter((node) => node.selected).length,
    branch,
    specializationName: indexedSpecialization?.name ?? (specializationNode == null
      ? `Specialization branch ${branch + 1}`
      : presentationTalent(catalog, specializationNode.talentId)?.name ?? `Specialization branch ${branch + 1}`),
  };
}

function equippedSkillsPanel(
  body: JsonRecord,
  skills: JsonValue[],
  equippedSlots: EquippedSkillSlotView[],
): HTMLElement {
  const panel = element("div", "profile-loadout-panel");
  panel.append(
    element("h4", "profile-subsection-title", "Equipped combat actions"),
    element("p", "profile-subsection-copy", "Displayed in in-game action-bar order: seven combat actions, then two Battle Imagines."),
  );
  const skillsById = new Map<number, JsonRecord>();
  for (const value of skills) {
    const skill = recordValue(value);
    const skillId = skill == null ? undefined : numericValue(skill.skill_id ?? skill.base_skill_id);
    if (skill != null && skillId != null) skillsById.set(skillId, skill);
  }
  const slotsById = new Map(equippedSlots.map((slot) => [slot.slotId, slot]));
  const bar = element("div", "profile-action-bar");
  for (const { displaySlotId, sourceSlotId } of combatActionDisplaySlots()) {
    const slot = slotsById.get(sourceSlotId);
    const tile = element("article", slot == null ? "profile-action-slot is-empty" : "profile-action-slot");
    tile.append(element("span", "profile-action-key", String(displaySlotId)));
    tile.dataset.sourceSlot = String(sourceSlotId);
    if (slot == null) {
      tile.append(element("span", "profile-action-empty", "Empty"));
      bar.append(tile);
      continue;
    }
    const isBattleImagine = sourceSlotId === 7 || sourceSlotId === 8;
    const action = resolveCombatActionPresentation(body, sourceSlotId, slot.skillId, presentation);
    const localizedImagine = isBattleImagine ? presentation.imagines[String(action.skillId)] : undefined;
    const localizedSkill = presentation.skills[String(action.skillId)];
    const localized = localizedImagine ?? localizedSkill;
    const skill = isBattleImagine
      ? findObservedBattleImagine(body, action.skillId)
      : findObservedSkill(body, action.skillId) ?? skillsById.get(slot.skillId);
    const observedTier = isBattleImagine ? numericValue(skill?.remodel_level) ?? 0 : undefined;
    const rarity = isBattleImagine
      ? battleImagineRarityLabel(localizedImagine?.rarity, localizedImagine?.item_tier)
      : "";
    const name = isBattleImagine
      ? battleImagineDisplayName(localized?.name)
      : localized?.name ?? "";
    if (isBattleImagine) {
      tile.classList.add("profile-imagine-action-slot");
      tile.dataset.tier = String(observedTier);
      if (rarity) tile.dataset.rarity = rarity.toLowerCase();
    }
    appendPresentationIcon(tile, localized?.icon, name || "Equipped skill", "profile-action-icon");
    const progression = isBattleImagine
      ? joinFacts([rarity, `Tier ${observedTier}`])
      : skillProgressFacts(skill?.level, skill?.remodel_level, true, true);
    tile.append(
      element("strong", "profile-action-name", name || `Unknown skill ${slot.skillId}`),
      profileActionMeta([
        combatActionKindLabel(action.kind),
        progression,
      ]),
    );
    tile.title = name || `Skill ${action.skillId}`;
    bar.append(tile);
  }
  panel.append(bar);
  return panel;
}

export interface CombatActionDisplaySlot {
  displaySlotId: number;
  sourceSlotId: number;
}

/**
 * BPSR stores the two primary Battle Imagines in slots 7 and 8 and the final
 * fourth class action in slot 9. The in-game bar displays basic, special, four
 * class actions, and the ultimate before the Imagines, so presentation order
 * is 1-5, 9, 6, 7, 8 without altering the source evidence.
 */
export function combatActionDisplaySlots(): CombatActionDisplaySlot[] {
  return [1, 2, 3, 4, 5, 9, 6, 7, 8].map((sourceSlotId, index) => ({
    displaySlotId: index + 1,
    sourceSlotId,
  }));
}

export type CombatActionKind = "Basic attack" | "Special attack" | "Class / expertise skill" | "Ultimate" | "Battle Imagine";

export interface CombatActionPresentation {
  skillId: number;
  kind: CombatActionKind;
}

export function combatActionKindLabel(kind: CombatActionKind): string {
  switch (kind) {
    case "Basic attack": return "Basic Attack";
    case "Special attack": return "Special Attack";
    case "Class / expertise skill": return "Class Skill";
    case "Ultimate": return "Ultimate";
    case "Battle Imagine": return "Battle Imagine";
  }
}

export function resolveCombatActionPresentation(
  body: JsonRecord,
  sourceSlotId: number,
  sourceSkillId: number,
  catalog: ProfilePresentationCatalog,
): CombatActionPresentation {
  if (sourceSlotId === 7 || sourceSlotId === 8) {
    return { skillId: sourceSkillId, kind: "Battle Imagine" };
  }
  if (sourceSlotId === 1) return { skillId: sourceSkillId, kind: "Basic attack" };
  if (sourceSlotId === 6) return { skillId: sourceSkillId, kind: "Ultimate" };
  if (sourceSlotId !== 2) return { skillId: sourceSkillId, kind: "Class / expertise skill" };

  const selectedTalentIds = new Set(
    arrayValue(body.talents)
      .map(recordValue)
      .map((talent) => numericValue(talent?.node_id))
      .map((nodeId) => nodeId == null ? undefined : catalog.talent_nodes[String(nodeId)]?.talent_id)
      .filter((talentId): talentId is number => talentId != null),
  );
  const replacement = [...selectedTalentIds]
    .map((talentId) => catalog.talents[String(talentId)])
    .filter((talent) => talent?.talent_type === 5)
    .flatMap((talent) => talent.skill_replacements ?? [])
    .find((candidate) => candidate.source_skill_id === sourceSkillId);
  return {
    skillId: replacement?.replacement_skill_id ?? sourceSkillId,
    kind: "Special attack",
  };
}

function equippedRoleSkillsPanel(
  body: JsonRecord,
  equippedSlots: EquippedSkillSlotView[],
): HTMLElement {
  const panel = element("div", "profile-loadout-panel profile-role-loadout-panel");
  panel.append(
    element("h4", "profile-subsection-title", "Equipped role skills"),
    element("p", "profile-subsection-copy", "Displayed in the exact role-slot order observed from the game."),
  );
  const slotsById = new Map(equippedSlots.map((slot) => [slot.slotId, slot]));
  const bar = element("div", "profile-action-bar profile-role-action-bar");
  for (let slotId = 21; slotId <= 24; slotId += 1) {
    const slot = slotsById.get(slotId);
    const tile = element("article", slot == null ? "profile-action-slot is-empty" : "profile-action-slot");
    tile.append(element("span", "profile-action-key", `R${slotId - 20}`));
    if (slot == null) {
      tile.append(element("span", "profile-action-empty", "Empty"));
      bar.append(tile);
      continue;
    }
    const localized = presentation.skills[String(slot.skillId)];
    const skill = findObservedSkill(body, slot.skillId);
    const isImagineRoleSkill = localized?.action_kind === "role_imagine";
    const imagineTier = isImagineRoleSkill
      ? resolveRoleImagineTier(body, slot.skillId, presentation)
      : undefined;
    const sourceImagine = isImagineRoleSkill
      ? resolveRoleImagineName(slot.skillId, presentation)
      : undefined;
    appendPresentationIcon(tile, localized?.icon, localized?.name ?? "Equipped role skill", "profile-action-icon");
    tile.append(
      element("strong", "profile-action-name", localized?.name ?? `Unknown role skill ${slot.skillId}`),
      profileActionMeta(isImagineRoleSkill
        ? [
            "Imagine Role Skill",
            sourceImagine ?? "Source Imagine not observed",
            imagineTier == null ? "Tier not observed" : `Tier ${imagineTier}`,
          ]
        : [
            "Role Skill",
            skillProgressFacts(skill?.level, skill?.remodel_level, true, true),
          ]),
    );
    tile.title = localized?.name ?? `Role skill ${slot.skillId}`;
    bar.append(tile);
  }
  panel.append(bar);
  return panel;
}

function profileActionMeta(lines: string[]): HTMLElement {
  const meta = element("small", "profile-action-meta");
  for (const line of lines.filter(Boolean)) {
    meta.append(element("span", "profile-action-meta-line", line));
  }
  return meta;
}

export function resolveRoleImagineTier(
  body: JsonRecord,
  skillId: number,
  catalog: ProfilePresentationCatalog,
): number | undefined {
  const presentation = catalog.skills[String(skillId)];
  const maximumTier = presentation?.maximum_tier;
  if (presentation?.action_kind !== "role_imagine"
    || presentation.replacement_imagine_skill_id == null
    || typeof maximumTier !== "number"
    || !Number.isInteger(maximumTier)) return undefined;
  const tier = numericValue(findObservedSkill(body, skillId)?.remodel_level);
  if (tier != null && tier >= 1 && tier <= maximumTier) return tier;

  const policy = catalog.role_imagine_tier_policy;
  const coreImagineSkillId = presentation.replacement_imagine_skill_id;
  const members = presentation.archive_member_imagine_skill_ids;
  if (policy == null
    || policy.unobserved_battle_imagine_tier !== 0
    || policy.empty_archive_member_list_uses_all_observed_imagines !== true
    || !Array.isArray(members)) return undefined;

  const battleSkills = arrayValue(body.battle_imagine_skills)
    .map(recordValue)
    .filter((skill): skill is JsonRecord => skill != null);
  const coreTier = observedBattleImagineTier(battleSkills, coreImagineSkillId);
  const totalTier = members.length > 0
    ? members.reduce(
      (sum, imagineSkillId) => sum + observedBattleImagineTier(battleSkills, imagineSkillId),
      0,
    )
    : totalUniqueObservedBattleImagineTiers(battleSkills);
  return policy.requirements
    .filter((requirement) =>
      Number.isInteger(requirement.tier)
      && requirement.tier >= 1
      && requirement.tier <= maximumTier
      && totalTier >= requirement.minimum_total_imagine_tier
      && coreTier >= requirement.minimum_core_imagine_tier)
    .reduce<number | undefined>(
      (highest, requirement) => Math.max(highest ?? 0, requirement.tier),
      undefined,
    );
}

function observedBattleImagineTier(battleSkills: JsonRecord[], skillId: number): number {
  return battleSkills
    .filter((skill) => observedSkillMatches(skill, skillId))
    .map((skill) => numericValue(skill.remodel_level))
    .filter((tier): tier is number => tier != null && Number.isInteger(tier) && tier >= 0 && tier <= 5)
    .reduce((highest, tier) => Math.max(highest, tier), 0);
}

function totalUniqueObservedBattleImagineTiers(battleSkills: JsonRecord[]): number {
  const tiersByImagine = new Map<number, number>();
  for (const skill of battleSkills) {
    const skillId = numericValue(skill.skill_id);
    const canonicalId = numericValue(skill.base_skill_id) ?? skillId;
    if (canonicalId == null) continue;
    const tier = skillId == null ? 0 : observedBattleImagineTier([skill], skillId);
    tiersByImagine.set(canonicalId, Math.max(tiersByImagine.get(canonicalId) ?? 0, tier));
  }
  return [...tiersByImagine.values()].reduce((sum, tier) => sum + tier, 0);
}

export function resolveRoleImagineName(
  skillId: number,
  catalog: ProfilePresentationCatalog,
): string | undefined {
  const imagineSkillId = catalog.skills[String(skillId)]?.replacement_imagine_skill_id;
  if (imagineSkillId == null) return undefined;
  const name = catalog.imagines[String(imagineSkillId)]?.name;
  return name == null ? undefined : battleImagineDisplayName(name);
}

export function skillProgressFacts(
  level: JsonValue | undefined,
  tier: JsonValue | undefined,
  includeLevel = true,
  compactLevel = false,
): string {
  return joinFacts([
    includeLevel ? pair(compactLevel ? "Lv." : "Level", level) : "",
    pair("Tier", tier),
  ]);
}

function findObservedSkill(body: JsonRecord, skillId: number): JsonRecord | undefined {
  const classId = numericValue(body.class_id);
  const professionSkills = arrayValue(body.combat_professions)
    .map(recordValue)
    .filter((profession) =>
      profession != null
      && (classId == null || numericValue(profession.profession_id) === classId))
    .flatMap((profession) => arrayValue(profession?.skills));
  return [...arrayValue(body.active_skills), ...professionSkills]
    .map(recordValue)
    .find((skill) => skill != null && observedSkillMatches(skill, skillId));
}

function findObservedBattleImagine(body: JsonRecord, skillId: number): JsonRecord | undefined {
  return arrayValue(body.battle_imagine_skills)
    .map(recordValue)
    .find((skill) => skill != null && observedSkillMatches(skill, skillId));
}

function observedSkillMatches(skill: JsonRecord, skillId: number): boolean {
  return numericValue(skill.skill_id) === skillId
    || numericValue(skill.base_skill_id) === skillId
    || arrayValue(skill.replacement_skill_ids).some((value) => numericValue(value) === skillId);
}

function learnedSkillsPanel(skills: JsonValue[]): HTMLElement {
  return profileDetailButton(
    `View ${skills.length} other learned skills`,
    "Other learned skills",
    () => learnedSkillList(skills),
  );
}

function learnedSkillList(skills: JsonValue[]): HTMLElement {
  const list = element("div", "profile-compact-list profile-learned-skill-list");
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
      element("small", "", skillProgressFacts(skill.level, skill.remodel_level)),
    );
    row.append(copy);
    list.append(row);
  }
  return list;
}

function talentTreePanel(tree: TalentTreeLayoutView): HTMLElement {
  const panel = element("div", "profile-talent-panel");
  const heading = element("div", "profile-talent-heading");
  const headingCopy = element("div", "profile-talent-heading-copy");
  headingCopy.append(
    element("div", "", "Specialization tree"),
    element("small", "", `${tree.specializationName} · ${tree.selectedCount} / ${tree.nodes.length} nodes selected`),
  );
  const legend = element("div", "profile-talent-legend");
  legend.append(
    talentLegendItem("is-selected", "Selected"),
    talentLegendItem("", "Available path"),
  );
  heading.append(headingCopy, legend);

  const detail = element("div", "profile-talent-detail");
  const navigation = element("div", "profile-talent-navigation");
  navigation.append(element("small", "profile-talent-navigation-hint", "Drag or swipe to explore the full tree"));
  const controls = element("div", "profile-talent-controls");
  const viewport = element("div", "profile-talent-viewport");
  viewport.tabIndex = 0;
  viewport.setAttribute("aria-label", `${tree.specializationName} specialization tree. Scroll in both directions to explore.`);
  const zoomSpace = element("div", "profile-talent-zoom-space");
  const canvas = element("div", "profile-talent-canvas");
  const geometry = calculateTalentTreeGeometry(tree.nodes);
  const { width, height, nodeSize, coordinates } = geometry;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("profile-talent-links");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("aria-hidden", "true");
  const displayedNodeIds = new Set(tree.nodes.map((node) => node.nodeId));
  const selectedNodeIds = new Set(tree.nodes.filter((node) => node.selected).map((node) => node.nodeId));
  for (const node of tree.nodes) {
    const target = coordinates.get(node.nodeId);
    if (!target) continue;
    for (const prerequisiteId of node.prerequisiteNodeIds) {
      if (!displayedNodeIds.has(prerequisiteId)) continue;
      const source = coordinates.get(prerequisiteId);
      if (!source) continue;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(source.x + nodeSize / 2));
      line.setAttribute("y1", String(source.y + nodeSize / 2));
      line.setAttribute("x2", String(target.x + nodeSize / 2));
      line.setAttribute("y2", String(target.y + nodeSize / 2));
      if (node.selected && selectedNodeIds.has(prerequisiteId)) line.classList.add("is-selected");
      svg.append(line);
    }
  }
  canvas.append(svg);

  const specializationLabel = element("span", "profile-talent-stage-label", tree.specializationName);
  specializationLabel.style.top = "26px";
  canvas.append(specializationLabel);

  const selectNode = (node: TalentTreeNodeView) => {
    const localized = presentationTalent(presentation, node.talentId);
    detail.replaceChildren();
    appendPresentationIcon(detail, localized?.icon, localized?.name ?? "Talent", "profile-talent-detail-icon");
    const copy = element("span");
    copy.append(
      element("strong", "", localized?.name ?? "Unknown talent"),
      element("small", node.selected ? "is-selected" : "", node.selected ? "Selected" : "Not selected"),
    );
    const description = cleanGameText(localized?.description);
    if (description) copy.append(element("p", "", description));
    detail.append(copy);
  };
  for (const node of tree.nodes) {
    const coordinate = coordinates.get(node.nodeId);
    if (!coordinate) continue;
    const localized = presentationTalent(presentation, node.talentId);
    const button = document.createElement("button");
    button.type = "button";
    button.className = node.selected ? "profile-talent-node is-selected" : "profile-talent-node";
    button.style.left = `${coordinate.x}px`;
    button.style.top = `${coordinate.y}px`;
    button.title = `${localized?.name ?? "Unknown talent"} · ${node.selected ? "Selected" : "Not selected"}`;
    button.setAttribute("aria-label", button.title);
    appendPresentationIcon(button, localized?.icon, localized?.name ?? "Talent", "profile-talent-node-icon");
    button.addEventListener("click", () => selectNode(node));
    canvas.append(button);
  }
  const focusNode = tree.nodes.find((node) =>
    node.selected && presentationTalent(presentation, node.talentId)?.talent_type === 5
  ) ?? tree.nodes.find((node) => node.selected) ?? tree.nodes[0]!;
  let zoom = window.matchMedia("(max-width: 620px)").matches ? 0.3 : 0.4;
  const zoomOutput = element("output", "profile-talent-zoom-value", `${Math.round(zoom * 100)}%`);
  zoomOutput.setAttribute("aria-live", "polite");
  const zoomOut = talentTreeControl("−", "Zoom out");
  const zoomIn = talentTreeControl("+", "Zoom in");
  const center = talentTreeControl("Center selected", "Center the selected specialization node");
  const centerNode = (behavior: ScrollBehavior = "smooth") => {
    const coordinate = coordinates.get(focusNode.nodeId);
    if (!coordinate) return;
    viewport.scrollTo({
      left: Math.max(0, (coordinate.x + nodeSize / 2) * zoom - viewport.clientWidth / 2),
      top: Math.max(0, (coordinate.y - 88) * zoom),
      behavior,
    });
  };
  const applyZoom = (nextZoom: number) => {
    const previousZoom = zoom;
    const centerX = (viewport.scrollLeft + viewport.clientWidth / 2) / previousZoom;
    const centerY = (viewport.scrollTop + viewport.clientHeight / 2) / previousZoom;
    zoom = Math.round(Math.max(0.1, Math.min(1.25, nextZoom)) * 1_000) / 1_000;
    canvas.style.transform = `scale(${zoom})`;
    zoomSpace.style.width = `${Math.round(width * zoom)}px`;
    zoomSpace.style.height = `${Math.round(height * zoom)}px`;
    zoomOutput.value = `${Math.round(zoom * 100)}%`;
    zoomOut.disabled = zoom <= 0.1;
    zoomIn.disabled = zoom >= 1.25;
    requestAnimationFrame(() => viewport.scrollTo({
      left: Math.max(0, centerX * zoom - viewport.clientWidth / 2),
      top: Math.max(0, centerY * zoom - viewport.clientHeight / 2),
    }));
  };
  zoomOut.addEventListener("click", () => applyZoom(zoom - 0.1));
  zoomIn.addEventListener("click", () => applyZoom(zoom + 0.1));
  center.addEventListener("click", () => centerNode());
  controls.append(zoomOut, zoomOutput, zoomIn, center);
  navigation.append(controls);

  let drag: { pointerId: number; x: number; y: number; left: number; top: number } | undefined;
  viewport.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse" || event.button !== 0 || (event.target as Element).closest("button")) return;
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add("is-dragging");
  });
  viewport.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    viewport.scrollLeft = drag.left - (event.clientX - drag.x);
    viewport.scrollTop = drag.top - (event.clientY - drag.y);
  });
  const stopDragging = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag = undefined;
    viewport.classList.remove("is-dragging");
  };
  viewport.addEventListener("pointerup", stopDragging);
  viewport.addEventListener("pointercancel", stopDragging);

  zoomSpace.append(canvas);
  viewport.append(zoomSpace);
  panel.append(heading, detail, navigation, viewport);
  selectNode(focusNode);
  applyZoom(zoom);
  requestAnimationFrame(() => centerNode("auto"));
  return panel;
}

function talentTreeControl(label: string, ariaLabel: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "profile-talent-control";
  button.textContent = label;
  button.setAttribute("aria-label", ariaLabel);
  return button;
}

function presentationTalent(
  catalog: ProfilePresentationCatalog,
  talentId: number,
): ProfilePresentationCatalog["talents"][string] | undefined {
  return catalog.talents[String(talentId)];
}

function talentLegendItem(className: string, label: string): HTMLElement {
  const item = element("span", className);
  item.append(element("i"), document.createTextNode(label));
  return item;
}

export function talentPresentationFacts(talent: { level?: JsonValue; node_id?: JsonValue }): string {
  return pair("Level", talent.level);
}

function collectionsSection(body: JsonRecord): HTMLElement {
  const appearance = recordValue(body.appearance);
  const collection = recordValue(body.collection_summary);
  const social = recordValue(body.social_display);
  const socialEvidence = resolvedSocialCollectionEvidence(social);
  const equippedTitleId = social?.equipped_title_id ?? arrayValue(social?.title_ids)[0];
  const equippedTitle = equippedTitleId == null ? undefined : presentation.titles[String(equippedTitleId)];
  const medals = orderedMedalEntries(social?.medal_ids, social?.medal_slots);
  const section = profileSection("Collections & appearance", "Latest verified observations");
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
    ["Guild", socialEvidence.guild],
    ["Titles observed", socialEvidence.observedTitleCount],
    ["Equipped title", equippedTitle?.name ?? equippedTitleId],
    ["Equipped title level", social?.equipped_title_level],
    ["Medals", medals.length],
  ] as Array<[string, JsonValue | number | undefined]>) appendFact(facts, label, displayValue(value));
  section.append(
    facts,
    element(
      "small",
      "profile-observation-note",
      "Missing collection values are not treated as zero. Counts include only ownership confirmed by live profile packets.",
    ),
  );
  if (medals.length) section.append(medalCollection(medals));
  return section;
}

export function resolvedSocialCollectionEvidence(
  social: JsonRecord | undefined,
): { guild: string; observedTitleCount: number } {
  return {
    guild: displayValue(social?.guild_name ?? social?.guild_id ?? "Awaiting live observation"),
    observedTitleCount: arrayValue(social?.title_ids).length,
  };
}

interface OwnedMedalEntry {
  id: number;
  slot?: number;
}

export function orderedMedalEntries(
  medalIds: JsonValue | undefined,
  medalSlots: JsonValue | undefined,
): OwnedMedalEntry[] {
  const owned = arrayValue(medalIds)
    .map(numericValue)
    .filter((value): value is number => value != null);
  const ownedSet = new Set(owned);
  const seen = new Set<number>();
  const entries: OwnedMedalEntry[] = [];
  const slots = recordValue(medalSlots);
  if (slots) {
    for (const [rawSlot, rawMedalId] of Object.entries(slots)
      .map(([slot, medalId]) => [Number(slot), numericValue(medalId)] as const)
      .filter((entry): entry is readonly [number, number] => Number.isSafeInteger(entry[0]) && entry[1] != null)
      .sort(([left], [right]) => left - right)) {
      if (!ownedSet.has(rawMedalId) || seen.has(rawMedalId)) continue;
      entries.push({ id: rawMedalId, slot: rawSlot });
      seen.add(rawMedalId);
    }
  }
  for (const id of owned) {
    if (seen.has(id)) continue;
    entries.push({ id });
    seen.add(id);
  }
  return entries;
}

function medalCollection(medals: OwnedMedalEntry[]): HTMLElement {
  const collection = element("div", "profile-medal-collection");
  const heading = element("div", "profile-medal-heading");
  heading.append(
    element("strong", "", "Badge collection"),
    element("small", "", `${medals.length.toLocaleString()} observed · in display order`),
  );
  const previewCount = 6;
  collection.append(heading, medalList(medals.slice(0, previewCount)));
  if (medals.length > previewCount) {
    collection.append(profileDetailButton(
      `View all ${medals.length} badges`,
      "Badge collection",
      () => medalList(medals),
    ));
  }
  return collection;
}

function medalList(medals: OwnedMedalEntry[]): HTMLElement {
  const list = element("div", "profile-medal-list");
  for (const medal of medals) {
    const localized = presentation.medals[String(medal.id)];
    const name = localized?.name ?? `Unlocalized medal ${medal.id}`;
    const card = element("article", "profile-medal-card");
    appendPresentationIcon(card, localized?.icon, name, "profile-medal-icon");
    if (!card.querySelector(".profile-medal-icon")) card.classList.add("has-no-icon");
    const copy = element("span", "profile-medal-copy");
    copy.append(
      element("strong", "", name),
      element("small", "", medal.slot == null ? "Observed badge" : `Display slot ${medal.slot}`),
    );
    const description = cleanMedalDescription(localized?.description);
    if (description) {
      copy.append(element("span", "profile-medal-description", description));
      card.title = `${name}\n${description}`;
    }
    card.append(copy);
    list.append(card);
  }
  return list;
}

function cleanMedalDescription(value: string | null | undefined): string | undefined {
  if (!value || /^personalzone_medal_icon_/iu.test(value)) return undefined;
  return value;
}

export function cleanGameText(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<[^>]+>/gu, "")
    .replace(/[ \t]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
  return cleaned || undefined;
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
  const displayEntries = photoWallDisplayEntries(
    photos,
    wall,
    [...assets.keys()].map(Number),
  );
  const photoCount = photoWallIdentityCount(photos, wall);
  const section = profileSection(
    "Photo Wall",
    `${photoCount.toLocaleString()} ${photoCount === 1 ? "photo reference" : "photo references"} · ${placements.length.toLocaleString()} ${placements.length === 1 ? "wall slot" : "wall slots"} · ${assets.size.toLocaleString()} verified ${assets.size === 1 ? "image" : "images"}`,
  );
  const grid = element("div", "profile-item-grid photo-wall-grid");
  for (const { slot, photoId } of displayEntries) {
    const card = element("article", "profile-item-card photo-wall-card");
    const asset = assets.get(String(photoId));
    const imageUrl =
      resolvePublishedPhotoUrl(asset?.image_path) ??
      safeImageUrl(asset?.image_url ?? asset?.thumbnail_url);
    if (imageUrl) {
      const image = document.createElement("img");
      image.className = "photo-wall-image";
      image.src = imageUrl;
      image.alt = stringValue(asset?.alt_text) ?? (slot == null
        ? `Photo Wall image ${photoId}`
        : `Photo Wall image ${slot}`);
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";
      card.append(image);
    }
    card.append(
      element("strong", "", slot == null ? `Photo ${photoId}` : `Wall slot ${slot}`),
      imageUrl ? element("small", "", stringValue(asset?.caption) ?? "Published from the in-game Photo Wall") : element("span", "", `Photo ${displayValue(photoId)} · awaiting exact live image capture`),
    );
    grid.append(card);
  }
  section.append(
    displayEntries.length
      ? grid
      : empty("No Photo Wall identity was present in the latest synced snapshot."),
  );
  return section;
}

export interface PhotoWallDisplayEntry {
  slot: string | null;
  photoId: number;
}

export function photoWallDisplayEntries(
  photoIds: JsonValue[],
  wall: JsonRecord | undefined,
  assetIds: number[] = [],
): PhotoWallDisplayEntry[] {
  const entries: PhotoWallDisplayEntry[] = [];
  const seen = new Set<number>();
  for (const [slot, value] of Object.entries(wall ?? {})) {
    const photoId = numericValue(value);
    if (photoId == null || photoId <= 0 || seen.has(photoId)) continue;
    entries.push({ slot, photoId });
    seen.add(photoId);
  }
  const unplaced = [...photoIds, ...assetIds]
    .map(numericValue)
    .filter((photoId): photoId is number => photoId != null && photoId > 0 && !seen.has(photoId));
  for (const photoId of [...new Set(unplaced)].sort((left, right) => left - right)) {
    entries.push({ slot: null, photoId });
    seen.add(photoId);
  }
  return entries;
}

export function photoWallIdentityCount(
  photoIds: JsonValue[],
  wall: JsonRecord | undefined,
): number {
  const identities = new Set<number>();
  for (const value of photoIds) {
    const photoId = numericValue(value);
    if (photoId != null && photoId > 0) identities.add(photoId);
  }
  for (const value of Object.values(wall ?? {})) {
    const photoId = numericValue(value);
    if (photoId != null && photoId > 0) identities.add(photoId);
  }
  return identities.size;
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

function achievementGroup(label: string, values: JsonValue[]): HTMLButtonElement {
  return profileDetailButton(
    `${label} · ${values.length.toLocaleString()}`,
    label,
    () => achievementList(values),
  );
}

function achievementList(values: JsonValue[]): HTMLElement {
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
  return list;
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
  const masterDungeons = arrayValue(activity?.master_mode_dungeons);
  const masterDungeonCount = resolvedMasterDungeonCount(
    masterDungeons,
    numericValue(season?.season_id),
  );
  const section = profileSection("Progression & activities", "Latest observed progress");
  const facts = element("dl", "profile-facts");
  for (const [label, value] of [
    ["Season", season?.season_id],
    ["Season level", season?.level],
    ["Master score", resolvedMasterScore(body)],
    ["Weekly tower highest floor", weekly?.maximum_floor_id],
    ["Challenge dungeons", arrayValue(activity?.challenge_dungeons).length],
    ["Master-mode dungeons", masterDungeonCount],
    ["Combat professions", combatProfessions.length],
    ["Life professions", lifeProfessions.length],
    ["Reputations", arrayValue(body.reputations).length],
  ] as Array<[string, JsonValue | number | undefined]>) appendFact(facts, label, displayValue(value));
  section.append(facts);
  if (masterDungeons.length) section.append(masterDungeonBreakdown(masterDungeons));
  return section;
}

function masterDungeonBreakdown(values: JsonValue[]): HTMLElement {
  const bySeason = masterDungeonRows(values);
  const container = element("div", "master-score-seasons");
  for (const [seasonId, rows] of [...bySeason.entries()].sort(([left], [right]) => right - left)) {
    const total = rows.reduce((sum, row) => sum + row.score, 0);
    container.append(profileDetailButton(
      `Season ${seasonId} · ${total.toLocaleString()} Master Score`,
      `Season ${seasonId} dungeon scores`,
      () => masterScoreTable(rows),
    ));
  }
  return container;
}

function masterScoreTable(rows: MasterDungeonRow[]): HTMLElement {
  const table = element("div", "master-score-table");
  table.append(masterScoreRow("Dungeon", "Best difficulty", "Score", "Best time", true));
  for (const row of [...rows].sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))) {
    table.append(masterScoreRow(row.name, row.difficultyName, row.score.toLocaleString(), formatDuration(row.passTime), false));
  }
  return table;
}

function masterScoreRow(dungeon: string, difficulty: string, score: string, time: string, heading: boolean): HTMLElement {
  const row = element("div", heading ? "master-score-row master-score-heading" : "master-score-row");
  const values = [
    ["Dungeon", dungeon],
    ["Best difficulty", difficulty],
    ["Score", score],
    ["Best time", time],
  ] as const;
  for (const [label, value] of values) {
    const cell = element(heading && label === "Dungeon" ? "strong" : "span", "", value);
    cell.dataset.label = label;
    row.append(cell);
  }
  return row;
}

function profileSection(titleText: string, subtitle: string): HTMLElement {
  const section = element("section", "profile-data-section");
  const heading = element("div", "profile-data-heading");
  heading.append(element("h3", "", titleText), element("small", "", subtitle));
  section.append(heading);
  return section;
}

function profileSectionGroup(titleText: string, subtitle: string): HTMLElement {
  const group = element("section", "profile-section-group");
  const heading = element("header", "profile-section-group-heading");
  heading.append(element("p", "eyebrow", titleText), element("p", "", subtitle));
  group.append(heading);
  return group;
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

export function resolveEquipmentItemLevel(
  item: Record<string, JsonValue>,
  localized: ProfilePresentationCatalog["items"][string] | undefined,
): number | undefined {
  const observedLevel = numericValue(item.level);
  if (observedLevel != null) return observedLevel;
  const breakthroughCount = numericValue(recordValue(item.attributes)?.breakthrough_count);
  if (breakthroughCount != null) {
    const breakthroughLevel = localized?.equipment_levels_by_breakthrough?.[String(breakthroughCount)];
    if (breakthroughLevel != null) return breakthroughLevel;
  }
  return localized?.equipment_level ?? undefined;
}

function equipmentAttributeSummary(item: JsonRecord, setEffectCount = 0): string {
  const attributes = recordValue(item.attributes);
  const count = attributes == null ? 0 : ["base", "basic", "advanced", "recast", "rare_quality"]
    .reduce((sum, key) => sum + Object.keys(recordValue(attributes[key]) ?? {}).length, 0);
  const sigilCount = arrayValue(item.enchantments).length;
  return joinFacts([
    count ? `${count} stat ${count === 1 ? "roll" : "rolls"}` : "Stats awaiting sync",
    `${sigilCount} ${sigilCount === 1 ? "sigil" : "sigils"}`,
    setEffectCount ? `${setEffectCount} active set ${setEffectCount === 1 ? "effect" : "effects"}` : "",
  ]);
}

function equipmentAttributeList(item: JsonRecord): HTMLElement | undefined {
  const attributes = recordValue(item.attributes);
  if (!attributes) return undefined;
  const rows = element("div", "profile-compact-list profile-equipment-attributes");
  for (const key of ["base", "basic", "advanced", "recast", "rare_quality"] as const) {
    for (const [attributeId, value] of Object.entries(recordValue(attributes[key]) ?? {})) {
      const rollValue = numericValue(value);
      if (key === "base") {
        const fightAttribute = presentation.fight_attributes[attributeId];
        rows.append(compactRow(
          fightAttribute?.name ?? `Unknown fight attribute ${attributeId}`,
          rollValue == null || !fightAttribute
            ? "Value unavailable"
            : formatSignedFightAttributeValue(rollValue, fightAttribute.number_type, fightAttribute.format_type),
        ));
        continue;
      }
      const localized = presentation.equipment_attributes[attributeId];
      const effects = rollValue == null
        ? []
        : (localized?.equipment_effects ?? []).map((effect) => ({
            name: effect.name,
            value: interpolateEquipmentAttributeValue(effect.minimum, effect.maximum, rollValue),
            numberType: effect.number_type,
            formatType: effect.format_type,
          }));
      const buffDescriptions = rollValue == null
        ? []
        : (localized?.equipment_buff_effects ?? []).map((effect) =>
            materializeEquipmentBuffDescription(effect.description, effect.parameters, rollValue)
          );
      const effectDetails = effects.map((effect) =>
        `${effect.name} ${formatSignedFightAttributeValue(effect.value, effect.numberType, effect.formatType)}`
      );
      for (const effect of effectDetails) {
        const match = /^(.*?)\s+([+-].*)$/u.exec(effect);
        rows.append(compactRow(match?.[1] ?? localized?.name ?? "Equipment attribute", match?.[2] ?? effect));
      }
      for (const description of buffDescriptions) rows.append(compactRow("Equipment effect", description));
      if (!effectDetails.length && !buffDescriptions.length) {
        rows.append(compactRow(localized?.name ?? `Unknown equipment attribute ${attributeId}`, "Value unavailable"));
      }
    }
  }
  return rows.childElementCount ? rows : undefined;
}

export function interpolateEquipmentAttributeValue(
  minimum: number,
  maximum: number,
  rollValue: number,
): number {
  const normalizedRoll = rollValue < 0 ? 0 : rollValue;
  return Math.floor(normalizedRoll * (maximum - minimum) / 100 + minimum);
}

export function formatFightAttributeValue(
  value: number,
  numberType: number,
  formatType: number,
): string {
  if (numberType === 1 || (numberType === 0 && formatType === 4)) {
    return `${formatReadableNumber(value / 100)}%`;
  }
  if (numberType === 2) return `${formatReadableNumber(value / 1_000)}s`;
  return formatReadableNumber(value);
}

export function materializeEquipmentBuffDescription(
  description: string,
  parameters: Array<{ minimum: number; maximum: number }>,
  rollValue: number,
): string {
  const values = parameters.map((parameter) =>
    interpolateEquipmentAttributeValue(parameter.minimum, parameter.maximum, rollValue)
  );
  return description
    .replace(
      /\{\*Decision\.(marknormal|unmarknormal|markpercent|unmarkpercent|marktime|unmarktime)\((\d+)\)\*\}/gu,
      (_match, formatter: string, index: string) => {
        const value = values[Number(index) - 1];
        if (value == null) return "?";
        const marked = formatter.startsWith("mark");
        const numberType = formatter.endsWith("percent") ? 1 : formatter.endsWith("time") ? 2 : 0;
        const formatted = formatFightAttributeValue(value, numberType, 0);
        return marked && value > 0 ? `+${formatted}` : formatted;
      },
    )
    .replace(/<[^>]+>/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function formatSignedFightAttributeValue(
  value: number,
  numberType: number,
  formatType: number,
): string {
  const formatted = formatFightAttributeValue(value, numberType, formatType);
  return value > 0 ? `+${formatted}` : formatted;
}

function formatReadableNumber(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
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

export function equipmentQualityToken(value: JsonValue | undefined): string {
  const quality = numericValue(value);
  return ({
    0: "raw",
    1: "common",
    2: "rare",
    3: "epic",
    4: "legendary",
    5: "mythic",
  } as Record<number, string>)[quality ?? -1] ?? "";
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

export function masterDungeonRows(
  values: JsonValue[],
  catalog: ProfilePresentationCatalog = presentation,
): Map<number, MasterDungeonRow[]> {
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
    const localizedDungeon = catalog.dungeons[String(difficultyId)];
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

export function resolvedMasterDungeonCount(
  values: JsonValue[],
  currentSeason: number | undefined,
): number {
  const bySeason = new Map<number, Set<number>>();
  for (const value of values) {
    const entry = recordValue(value);
    const dungeon = recordValue(entry?.dungeon);
    const seasonId = numericValue(entry?.season_id);
    const dungeonConfigId = numericValue(entry?.difficulty_id);
    const masterDifficulty = numericValue(dungeon?.dungeon_id);
    if (
      seasonId == null
      || dungeonConfigId == null
      || masterDifficulty == null
      || masterDifficulty < 1
      || masterDifficulty > 20
    ) continue;
    const dungeonIds = bySeason.get(seasonId) ?? new Set<number>();
    dungeonIds.add(dungeonConfigId);
    bySeason.set(seasonId, dungeonIds);
  }
  if (!bySeason.size) return 0;
  const selectedSeason = currentSeason != null && bySeason.has(currentSeason)
    ? currentSeason
    : Math.max(...bySeason.keys());
  return Math.min(bySeason.get(selectedSeason)?.size ?? 0, 6);
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
