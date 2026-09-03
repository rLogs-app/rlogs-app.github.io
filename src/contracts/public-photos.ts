export interface PublicPhotoCatalog {
  schema_version: 1;
  total_entries: number;
  entries: PublicPhotoCatalogEntry[];
}

export interface PublicPhotoCatalogEntry {
  profile_id: string;
  character_id: string;
  display_name: string | null;
  photo_id: number;
  image_path: string;
  uploaded_unix_millis: number;
  like_count: number;
  viewer_liked: boolean;
}

const profileIdPattern = /^prf_[0-9a-f]{32}$/u;
const imagePathPattern = /^\/v1\/profiles\/prf_[0-9a-f]{32}\/photo-wall\/[1-9][0-9]*$/u;

export function isPublicPhotoCatalog(value: unknown): value is PublicPhotoCatalog {
  return (
    isRecord(value) &&
    value.schema_version === 1 &&
    nonnegativeInteger(value.total_entries) &&
    Array.isArray(value.entries) &&
    value.entries.every(isPublicPhotoCatalogEntry)
  );
}

function isPublicPhotoCatalogEntry(value: unknown): value is PublicPhotoCatalogEntry {
  return (
    isRecord(value) &&
    typeof value.profile_id === "string" &&
    profileIdPattern.test(value.profile_id) &&
    typeof value.character_id === "string" &&
    value.character_id.length > 0 &&
    (value.display_name === null || typeof value.display_name === "string") &&
    positiveInteger(value.photo_id) &&
    typeof value.image_path === "string" &&
    imagePathPattern.test(value.image_path) &&
    positiveInteger(value.uploaded_unix_millis) &&
    nonnegativeInteger(value.like_count) &&
    typeof value.viewer_liked === "boolean"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function nonnegativeInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
