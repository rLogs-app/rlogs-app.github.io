export interface PublicProfileCatalogEntry {
  profile_id: string;
  claimed: boolean;
  package_id: string;
  updated_unix_millis: number;
  source_client_build: string;
  deployment: string;
  region: string;
  realm: string | null;
  world: string | null;
  character_id: string;
  display_name: string | null;
  module_inventory_count: number;
  equipped_module_count: number;
}

export interface PublicProfileCatalog {
  schema_version: 1;
  profiles: PublicProfileCatalogEntry[];
}

const profileIdPattern = /^prf_[0-9a-f]{32}$/u;

export function isPublicProfileCatalog(value: unknown): value is PublicProfileCatalog {
  return (
    isRecord(value) &&
    value.schema_version === 1 &&
    Array.isArray(value.profiles) &&
    value.profiles.every(isPublicProfileCatalogEntry)
  );
}

function isPublicProfileCatalogEntry(value: unknown): value is PublicProfileCatalogEntry {
  return (
    isRecord(value) &&
    typeof value.profile_id === "string" &&
    profileIdPattern.test(value.profile_id) &&
    typeof value.claimed === "boolean" &&
    typeof value.package_id === "string" &&
    positiveSafeInteger(value.updated_unix_millis) &&
    typeof value.source_client_build === "string" &&
    typeof value.deployment === "string" &&
    typeof value.region === "string" &&
    nullableString(value.realm) &&
    nullableString(value.world) &&
    typeof value.character_id === "string" &&
    value.character_id.length > 0 &&
    nullableString(value.display_name) &&
    nonnegativeSafeInteger(value.module_inventory_count) &&
    nonnegativeSafeInteger(value.equipped_module_count)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function positiveSafeInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function nonnegativeSafeInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
