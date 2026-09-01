export interface PresentationRecord {
  name: string;
  icon?: string | null;
  quality?: number | null;
  item_id?: number;
  item_tier?: number;
  maximum_tier?: number;
  talent_id?: number;
  dungeon_type_name?: string;
  effects?: string[];
  attribute_library_id?: number | null;
  levels?: Array<{ level: number; enhancement_num: number }>;
  description?: string | null;
  category?: string | null;
  target?: number | null;
  season_id?: number | null;
  achievement_level?: number | null;
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
  equipment_slots: Record<string, string>;
  quality_names: Record<string, string>;
  equipment_attributes: Record<string, PresentationRecord>;
  items: Record<string, PresentationRecord>;
  sigils: Record<string, SigilLevelPresentation[]>;
  titles: Record<string, PresentationRecord>;
  skills: Record<string, PresentationRecord>;
  talents: Record<string, PresentationRecord>;
  talent_nodes: Record<string, PresentationRecord>;
  dungeons: Record<string, PresentationRecord>;
  achievements: Record<string, PresentationRecord>;
  imagines: Record<string, PresentationRecord>;
  modules: Record<string, PresentationRecord>;
  module_effects: Record<string, PresentationRecord>;
}

// The query revision is part of the schema contract. Changing it prevents an
// older immutable browser/CDN response from being paired with newer UI code.
const catalogUrl = `${import.meta.env.BASE_URL}data/bpsr/profile-presentation.en-US.v1.json?schema=8`;
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
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
