export interface ObservedCharacterReportReference {
  report_id: string;
  run_index: number;
  created_unix_millis: number;
  scene_id: number | null;
  scene_name: string | null;
  terminal_state: string;
  deployment_id?: string | null;
  client_build?: string | null;
  protocol_pack_digest?: string | null;
}

export interface ObservedPresentationAuthority {
  deployment_id: string;
  client_build: string;
  protocol_pack_digest: string;
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
  presentation_authority?: ObservedPresentationAuthority | null;
}

export interface ObservedCharacterCatalog {
  schema_version: 1 | 2;
  generated_unix_millis: number;
  total_characters: number;
  characters: ObservedCharacterEntry[];
}

export function isObservedCharacterCatalog(value: unknown): value is ObservedCharacterCatalog {
  return isRecord(value)
    && (value.schema_version === 1 || value.schema_version === 2)
    && typeof value.generated_unix_millis === "number"
    && Number.isSafeInteger(value.total_characters)
    && Array.isArray(value.characters)
    && value.characters.every((entry) => isObservedCharacterEntry(entry, value.schema_version as 1 | 2));
}

function isObservedCharacterEntry(value: unknown, schemaVersion: 1 | 2): value is ObservedCharacterEntry {
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
    && (schemaVersion === 1 || isNullablePresentationAuthority(value.presentation_authority))
    && value.reports.every((report) => isReportReference(report, schemaVersion));
}

function isReportReference(value: unknown, schemaVersion: 1 | 2): value is ObservedCharacterReportReference {
  return isRecord(value)
    && /^rpt_[A-Za-z0-9_-]+$/u.test(String(value.report_id ?? ""))
    && nonnegativeInteger(value.run_index)
    && positiveInteger(value.created_unix_millis)
    && (value.scene_id === null || Number.isSafeInteger(value.scene_id))
    && nullableString(value.scene_name)
    && typeof value.terminal_state === "string"
    && (schemaVersion === 1 || isNullableIdentityTriple(value));
}

function isNullablePresentationAuthority(value: unknown): boolean {
  return value === null || (isRecord(value) && isCompleteIdentityTriple(value));
}

function isNullableIdentityTriple(value: Record<string, unknown>): boolean {
  const fields = [value.deployment_id, value.client_build, value.protocol_pack_digest];
  return fields.every((field) => field === null) || isCompleteIdentityTriple(value);
}

function isCompleteIdentityTriple(value: Record<string, unknown>): boolean {
  return typeof value.deployment_id === "string" && value.deployment_id.length > 0
    && typeof value.client_build === "string" && value.client_build.length > 0
    && typeof value.protocol_pack_digest === "string"
    && /^sha256:[0-9a-f]{64}$/u.test(value.protocol_pack_digest);
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
