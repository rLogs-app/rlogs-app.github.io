export interface ObservedCharacterReportReference {
  report_id: string;
  run_index: number;
  created_unix_millis: number;
  scene_id: number | null;
  scene_name: string | null;
  terminal_state: string;
}

export interface ObservedCharacterEntry {
  observed_character_key: string;
  identity_kind: "verified_uid" | "legacy_name_observation";
  character_id: string | null;
  claimed_profile_id: string | null;
  display_name: string;
  deployment: string;
  region: string;
  class_id: number | null;
  class_name: string | null;
  specialization_id: number | null;
  specialization_name: string | null;
  first_seen_unix_millis: number;
  last_seen_unix_millis: number;
  report_count: number;
  reports: ObservedCharacterReportReference[];
}

export interface ObservedCharacterCatalog {
  schema_version: 1;
  generated_unix_millis: number;
  total_characters: number;
  characters: ObservedCharacterEntry[];
}

export function isObservedCharacterCatalog(value: unknown): value is ObservedCharacterCatalog {
  return isRecord(value)
    && value.schema_version === 1
    && typeof value.generated_unix_millis === "number"
    && Number.isSafeInteger(value.total_characters)
    && Array.isArray(value.characters)
    && value.characters.every(isObservedCharacterEntry);
}

function isObservedCharacterEntry(value: unknown): value is ObservedCharacterEntry {
  return isRecord(value)
    && typeof value.observed_character_key === "string"
    && /^(?:chr|obs)_[0-9a-f]{32}$/u.test(value.observed_character_key)
    && (value.identity_kind === "verified_uid" || value.identity_kind === "legacy_name_observation")
    && nullableString(value.character_id)
    && nullableString(value.claimed_profile_id)
    && typeof value.display_name === "string"
    && typeof value.deployment === "string"
    && typeof value.region === "string"
    && nullableNumber(value.class_id)
    && nullableString(value.class_name)
    && nullableNumber(value.specialization_id)
    && nullableString(value.specialization_name)
    && positiveInteger(value.first_seen_unix_millis)
    && positiveInteger(value.last_seen_unix_millis)
    && positiveInteger(value.report_count)
    && Array.isArray(value.reports)
    && value.reports.every(isReportReference);
}

function isReportReference(value: unknown): value is ObservedCharacterReportReference {
  return isRecord(value)
    && /^rpt_[A-Za-z0-9_-]+$/u.test(String(value.report_id ?? ""))
    && nonnegativeInteger(value.run_index)
    && positiveInteger(value.created_unix_millis)
    && (value.scene_id === null || Number.isSafeInteger(value.scene_id))
    && nullableString(value.scene_name)
    && typeof value.terminal_state === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function nullableNumber(value: unknown): boolean {
  return value === null || Number.isSafeInteger(value);
}

function positiveInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function nonnegativeInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
