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
}

export interface ProfilePresentationCatalog {
  equipment_slots: Record<string, string>;
  quality_names: Record<string, string>;
  equipment_attributes: Record<string, PresentationRecord>;
  items: Record<string, PresentationRecord>;
  titles: Record<string, PresentationRecord>;
  skills: Record<string, PresentationRecord>;
  talents: Record<string, PresentationRecord>;
  talent_nodes: Record<string, PresentationRecord>;
  dungeons: Record<string, PresentationRecord>;
  imagines: Record<string, PresentationRecord>;
  modules: Record<string, PresentationRecord>;
  module_effects: Record<string, PresentationRecord>;
}

// The query revision is part of the schema contract. Changing it prevents an
// older immutable browser/CDN response from being paired with newer UI code.
const catalogUrl = `${import.meta.env.BASE_URL}data/bpsr/profile-presentation.en-US.v1.json?schema=3`;
let request: Promise<ProfilePresentationCatalog> | undefined;

export function loadProfilePresentation(): Promise<ProfilePresentationCatalog> {
  request ??= fetch(catalogUrl, { cache: "no-cache" })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`BPSR localization catalog request failed with HTTP ${response.status}.`);
      }
      const value: unknown = await response.json();
      if (!isCatalog(value)) throw new Error("The BPSR localization catalog is invalid.");
      return value;
    });
  return request;
}

function isCatalog(value: unknown): value is ProfilePresentationCatalog {
  if (!isRecord(value)) return false;
  return [
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
  ].every((key) => isRecord(value[key]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
