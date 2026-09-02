export interface PresentationRecord {
  name: string;
  icon?: string | null;
  quality?: number | null;
  item_id?: number;
  equipment_level?: number | null;
  equipment_levels_by_breakthrough?: Record<string, number>;
  set_id?: number | null;
  item_tier?: number;
  rarity?: string | null;
  maximum_tier?: number;
  talent_id?: number;
  profession_id?: number | null;
  specialization_id?: number | null;
  talent_type?: number | null;
  talent_level?: number | null;
  branch?: number;
  talent_stage?: number;
  prerequisite_node_ids?: number[];
  dependent_node_ids?: number[];
  position?: { x: number; y: number };
  dungeon_type_name?: string;
  effects?: string[];
  equipment_effects?: EquipmentAttributeEffectPresentation[];
  equipment_buff_effects?: EquipmentBuffEffectPresentation[];
  attribute_library_id?: number | null;
  levels?: Array<{ level: number; enhancement_num: number }>;
  description?: string | null;
  category?: string | null;
  target?: number | null;
  season_id?: number | null;
  achievement_level?: number | null;
}

export interface EquipmentBuffEffectPresentation {
  buff_id: number;
  description: string;
  parameters: Array<{ minimum: number; maximum: number }>;
}

export interface EquipmentAttributeEffectPresentation {
  attribute_id: number;
  name: string;
  minimum: number;
  maximum: number;
  number_type: number;
  format_type: number;
}

export interface EquipmentSetPresentation {
  suit_id: number;
  name: string;
  required_pieces: number;
}

export interface FightAttributePresentation {
  name: string;
  description?: string | null;
  number_type: number;
  format_type: number;
  family_id?: number;
  component?: "final" | "total" | "add" | "extra_add" | "percent" | "extra_percent";
  icon?: string | null;
  displayable?: boolean;
}

export interface TalentTreeSpecializationPresentation {
  branch: number;
  name: string;
  talent_id: number;
  node_ids: number[];
}

export interface TalentTreePresentation {
  profession_id: number;
  foundation_node_ids: number[];
  specializations: TalentTreeSpecializationPresentation[];
}

export interface SigilLevelPresentation {
  level: number;
  item_id: number;
  name: string;
  icon?: string | null;
  quality?: number | null;
  effects: Array<{ attribute_id: number; name: string; value: number }>;
}

export interface ProfilePresentationCatalog {
  schema_version?: number;
  locale?: string;
  game_build?: string;
  source?: string;
  source_item_table_sha256?: string;
  source_achievement_table_sha256?: string;
  source_medal_table_sha256?: string;
  source_talent_table_sha256?: string;
  source_talent_tree_table_sha256?: string;
  source_equipment_attribute_table_sha256?: string;
  source_equipment_breakthrough_table_sha256?: string;
  source_equipment_suit_table_sha256?: string;
  source_buff_table_sha256?: string;
  equipment_slots: Record<string, string>;
  quality_names: Record<string, string>;
  equipment_attributes: Record<string, PresentationRecord>;
  equipment_sets: Record<string, EquipmentSetPresentation>;
  fight_attributes: Record<string, FightAttributePresentation>;
  items: Record<string, PresentationRecord>;
  sigils: Record<string, SigilLevelPresentation[]>;
  titles: Record<string, PresentationRecord>;
  skills: Record<string, PresentationRecord>;
  talents: Record<string, PresentationRecord>;
  talent_nodes: Record<string, PresentationRecord>;
  talent_tree_index: Record<string, TalentTreePresentation>;
  dungeons: Record<string, PresentationRecord>;
  achievements: Record<string, PresentationRecord>;
  medals: Record<string, PresentationRecord>;
  imagines: Record<string, PresentationRecord>;
  modules: Record<string, PresentationRecord>;
  module_effects: Record<string, PresentationRecord>;
}

// The query revision is part of the schema contract. Changing it prevents an
// older immutable browser/CDN response from being paired with newer UI code.
const catalogUrl = `${import.meta.env.BASE_URL}data/bpsr/profile-presentation.en-US.v1.json?schema=18`;
let request: Promise<ProfilePresentationCatalog> | undefined;

export function loadProfilePresentation(): Promise<ProfilePresentationCatalog> {
  request ??= fetch(catalogUrl, { cache: "no-cache" })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`BPSR localization catalog request failed with HTTP ${response.status}.`);
      }
      const value = normalizeProfilePresentationCatalog(await response.json());
      if (!value) throw new Error("The BPSR localization catalog is invalid.");
      return value;
    });
  return request;
}

export function normalizeProfilePresentationCatalog(
  value: unknown,
): ProfilePresentationCatalog | undefined {
  if (!isRecord(value)) return undefined;
  if (
    ![
      "equipment_slots",
      "quality_names",
      "equipment_attributes",
      "items",
      "titles",
      "skills",
      "talents",
      "talent_nodes",
      "dungeons",
      "imagines",
      "modules",
      "module_effects",
    ].every((key) => isRecord(value[key]))
  ) {
    return undefined;
  }

  // A Pages edge can briefly pair a newly deployed JavaScript bundle with the
  // preceding catalog response. Keep the rest of the localized profile usable
  // while that immutable deployment converges; exact sigils appear as soon as
  // the current catalog is returned.
  return {
    ...(value as unknown as ProfilePresentationCatalog),
    sigils: isRecord(value.sigils)
      ? (value.sigils as ProfilePresentationCatalog["sigils"])
      : {},
    achievements: isRecord(value.achievements)
      ? (value.achievements as ProfilePresentationCatalog["achievements"])
      : {},
    medals: isRecord(value.medals)
      ? (value.medals as ProfilePresentationCatalog["medals"])
      : {},
    fight_attributes: isRecord(value.fight_attributes)
      ? (value.fight_attributes as ProfilePresentationCatalog["fight_attributes"])
      : {},
    equipment_sets: isRecord(value.equipment_sets)
      ? (value.equipment_sets as ProfilePresentationCatalog["equipment_sets"])
      : {},
    talent_tree_index: isRecord(value.talent_tree_index)
      ? (value.talent_tree_index as unknown as ProfilePresentationCatalog["talent_tree_index"])
      : {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
