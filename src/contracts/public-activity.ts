export type CommunityMilestoneKind = "master_twenty_dungeon" | "nightmare_raid";

export interface PublicCommunityMilestoneCatalog {
  schema_version: 1;
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
}

const reportIdPattern = /^rpt_[0-9a-f]{32}$/u;

export function isPublicCommunityMilestoneCatalog(
  value: unknown,
): value is PublicCommunityMilestoneCatalog {
  return (
    isRecord(value) &&
    value.schema_version === 1 &&
    nonnegativeInteger(value.total_entries) &&
    Array.isArray(value.entries) &&
    value.entries.every(isPublicCommunityMilestone)
  );
}

function isPublicCommunityMilestone(value: unknown): value is PublicCommunityMilestone {
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
    nullableNonnegativeInteger(value.total_run_time_micros)
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
