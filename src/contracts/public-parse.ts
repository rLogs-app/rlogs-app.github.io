export interface PublicParseCatalog {
  schema_version: 5;
  total_entries: number;
  offset: number;
  next_offset?: number | null;
  entries: PublicParseCatalogEntry[];
  facets: CatalogFacets;
}

export interface PublicParseCatalogEntry {
  report_id: string;
  report_ids?: string[];
  run_index: number;
  run_group_id?: string;
  contribution_count?: number;
  distinct_submitter_count?: number;
  created_unix_millis: number;
  deployment_id: string;
  region_id: string;
  activity_id?: string;
  activity_family_id?: string;
  scene_id?: number;
  scene_name?: string;
  difficulty_family?: string;
  difficulty_tier?: number;
  terminal_state: string;
  total_run_time_micros?: number;
  participant_count: number;
}

export interface CatalogFacets {
  deployments: FacetValue[];
  regions: FacetValue[];
  activities: FacetValue[];
  scenes: SceneFacetValue[];
  difficulties: FacetValue[];
  terminal_states: FacetValue[];
}

export interface FacetValue {
  id: string;
  count: number;
}

export interface SceneFacetValue {
  id: number;
  label?: string;
  count: number;
}

export interface PublicParseReport {
  schema_version: 6;
  report_id: string;
  visibility: "public" | "unlisted";
  created_unix_millis: number;
  game_plugin_id: string;
  deployment_id: string;
  region_id: string;
  world_id: string | null;
  client_build: string;
  protocol_pack_digest: string;
  verification: PublicVerification;
  submission_provenance?: PublicSubmissionProvenance;
  runs: PublicRun[];
}

export interface PublicSubmissionProvenance {
  submitter_id: string | null;
  authentication: string;
}

export interface PublicVerification {
  tier: "replayed" | "corroborated" | "ranked";
  artifact_sha256: string;
  canonical_content_sha256: string;
  event_count: number;
  privacy_policy_digest: string;
}

export interface PublicRun {
  run_index: number;
  run_group_id?: string;
  correlation_method?: "exact_instance_id" | "isolated_artifact";
  activity_id: string | null;
  activity_family_id: string | null;
  scene_id: number | null;
  scene_name: string | null;
  difficulty_family: string | null;
  difficulty_tier: number | null;
  terminal_state: string;
  total_run_time_micros: number | null;
  game_time_micros: number | null;
  active_combat_micros: number;
  true_time_micros: number | null;
  retry_count: number;
  boss_retry_count: number;
  rdps_status: string;
  data_gap_count: number;
  authoritative_start: boolean;
  authoritative_completion: boolean;
  submission_disposition: string;
  segments: PublicRunSegment[];
  participants: PublicParticipant[];
}

export interface PublicRunSegment {
  index: number;
  kind: string;
  wall_time_micros: number;
  active_combat_micros: number;
  attempt_count: number;
  retry_count: number;
}

export interface PublicParticipant {
  actor_id: string;
  character_id: string | null;
  display_name: string | null;
  actor_kind: string | null;
  class_id: number | null;
  class_name: string | null;
  specialization_id: number | null;
  specialization_name: string | null;
  damage: number;
  dps: number;
  encounter_dps: number;
  hps: number;
  tps: number;
  rdps: number | null;
  deaths: number;
}

const reportIdPattern = /^rpt_[a-f0-9]{32}$/;

export function isPublicParseCatalog(value: unknown): value is PublicParseCatalog {
  if (
    !isRecord(value) ||
    value.schema_version !== 5 ||
    !Number.isSafeInteger(value.total_entries) ||
    !Number.isSafeInteger(value.offset) ||
    !(value.next_offset == null || Number.isSafeInteger(value.next_offset)) ||
    !Array.isArray(value.entries) ||
    !isCatalogFacets(value.facets)
  ) {
    return false;
  }
  return value.entries.every(
    (entry) =>
      isRecord(entry) &&
      typeof entry.report_id === "string" &&
      reportIdPattern.test(entry.report_id) &&
      Number.isSafeInteger(entry.run_index) &&
      typeof entry.region_id === "string" &&
      typeof entry.terminal_state === "string",
  );
}

function isCatalogFacets(value: unknown): value is CatalogFacets {
  return (
    isRecord(value) &&
    Array.isArray(value.deployments) &&
    Array.isArray(value.regions) &&
    Array.isArray(value.activities) &&
    Array.isArray(value.scenes) &&
    Array.isArray(value.difficulties) &&
    Array.isArray(value.terminal_states)
  );
}

export function isPublicParseReport(value: unknown): value is PublicParseReport {
  return (
    isRecord(value) &&
    value.schema_version === 6 &&
    typeof value.report_id === "string" &&
    reportIdPattern.test(value.report_id) &&
    (value.visibility === "public" || value.visibility === "unlisted") &&
    isRecord(value.verification) &&
    ["replayed", "corroborated", "ranked"].includes(String(value.verification.tier)) &&
    Array.isArray(value.runs)
  );
}

export function validateReportId(value: string): boolean {
  return reportIdPattern.test(value);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
