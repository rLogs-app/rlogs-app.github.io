export type CommunityMilestoneKind = "master_twenty_dungeon" | "nightmare_raid";

export interface PublicCommunityMilestoneCatalog {
  schema_version: 1 | 2;
  total_entries: number;
  entries: PublicCommunityMilestone[];
}

export interface PublicCommunityMilestone {
  kind: CommunityMilestoneKind;
  character_id: string;
  display_name: string | null;
  report_id: string;
  run_index: number;
  completed_unix_millis: number;
  scene_id: number | null;
  scene_name: string | null;
  difficulty_family: string;
  difficulty_tier: number | null;
  total_run_time_micros: number | null;
  deployment_id?: string | null;
  client_build?: string | null;
  protocol_pack_digest?: string | null;
}

const reportIdPattern = /^rpt_[0-9a-f]{32}$/u;

export function isPublicCommunityMilestoneCatalog(
  value: unknown,
): value is PublicCommunityMilestoneCatalog {
  return (
    isRecord(value) &&
    (value.schema_version === 1 || value.schema_version === 2) &&
    nonnegativeInteger(value.total_entries) &&
    Array.isArray(value.entries) &&
    value.entries.every((entry) => isPublicCommunityMilestone(entry, value.schema_version as 1 | 2))
  );
}

function isPublicCommunityMilestone(value: unknown, schemaVersion: 1 | 2): value is PublicCommunityMilestone {
  return (
    isRecord(value) &&
    (value.kind === "master_twenty_dungeon" || value.kind === "nightmare_raid") &&
    typeof value.character_id === "string" &&
    value.character_id.length > 0 &&
    (value.display_name === null || typeof value.display_name === "string") &&
    typeof value.report_id === "string" &&
    reportIdPattern.test(value.report_id) &&
    nonnegativeInteger(value.run_index) &&
    positiveInteger(value.completed_unix_millis) &&
    nullableInteger(value.scene_id) &&
    (value.scene_name === null || typeof value.scene_name === "string") &&
    typeof value.difficulty_family === "string" &&
    nullableNonnegativeInteger(value.difficulty_tier) &&
    nullableNonnegativeInteger(value.total_run_time_micros) &&
    (schemaVersion === 1 || isNullableIdentityTriple(value))
  );
}

function isNullableIdentityTriple(value: Record<string, unknown>): boolean {
  const fields = [value.deployment_id, value.client_build, value.protocol_pack_digest];
  return fields.every((field) => field === null) || (
    typeof value.deployment_id === "string" && value.deployment_id.length > 0 &&
    typeof value.client_build === "string" && value.client_build.length > 0 &&
    typeof value.protocol_pack_digest === "string" && /^sha256:[0-9a-f]{64}$/u.test(value.protocol_pack_digest)
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

function nullableInteger(value: unknown): boolean {
  return value === null || (typeof value === "number" && Number.isSafeInteger(value));
}

function nullableNonnegativeInteger(value: unknown): boolean {
  return value === null || nonnegativeInteger(value);
}
