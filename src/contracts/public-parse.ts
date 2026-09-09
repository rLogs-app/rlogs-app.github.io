export type ReconciliationStatus = "single_vantage" | "multiple_reports_no_additional_vantage" | "cross_vantage_evidence_available" | "reconciled";

export interface PublicParseCatalog {
  schema_version: 6; total_entries: number; offset: number; next_offset?: number | null;
  entries: PublicParseCatalogEntry[]; facets: CatalogFacets;
}
export interface PublicParseCatalogEntry {
  report_id: string; report_ids: string[]; run_index: number; run_group_id: string;
  contribution_count: number; distinct_submitter_count: number; local_profile_witness_character_count: number;
  attribution_reconciliation_status: ReconciliationStatus; created_unix_millis: number; deployment_id: string;
  region_id: string; activity_id?: string; activity_family_id?: string; activity_category_id?: string;
  scene_id?: number; scene_name?: string; difficulty_family?: string; difficulty_tier?: number;
  terminal_state: string; total_run_time_micros?: number; participant_count: number;
}
export interface CatalogFacets {
  deployments: FacetValue[]; regions: FacetValue[]; activities: FacetValue[];
  scenes: SceneFacetValue[]; difficulties: FacetValue[]; terminal_states: FacetValue[];
}
export interface FacetValue { id: string; count: number }
export interface SceneFacetValue { id: number; label?: string; count: number }

export interface PublicParseReport {
  schema_version: 14; projection_revision: 4; report_id: string; visibility: "public" | "unlisted";
  created_unix_millis: number; game_plugin_id: string; deployment_id: string; region_id: string;
  world_id: string | null; client_build: string; protocol_pack_digest: string; verification: PublicVerification;
  submission_provenance: PublicSubmissionProvenance; runs: PublicRun[];
}
export interface PublicSubmissionProvenance { submitter_id: string | null; authentication: string }
export interface PublicVerification {
  tier: "replayed" | "corroborated" | "ranked"; artifact_sha256: string; canonical_content_sha256: string;
  event_count: number; privacy_policy_digest: string;
}
export interface PublicRun {
  run_index: number; run_group_id: string; correlation_method: "exact_instance_id" | "isolated_artifact";
  activity_id: string | null; activity_family_id: string | null; activity_category_id?: string | null;
  scene_id: number | null; scene_name: string | null; difficulty_family: string | null; difficulty_tier: number | null;
  terminal_state: string; total_run_time_micros: number | null; game_time_micros: number | null;
  active_combat_micros: number; true_time_micros: number | null; retry_count: number; boss_retry_count: number;
  rdps_status: string; data_gap_count: number; authoritative_start: boolean; authoritative_completion: boolean;
  submission_disposition: string; segments: PublicRunSegment[]; participants: PublicParticipant[]; timeline: PublicCombatTimeline;
}
export interface PublicRunSegment {
  index: number; kind: string; wall_time_micros: number; active_combat_micros: number; attempt_count: number; retry_count: number;
}
export interface PublicSeriesPoint { second: number; damage: number; effective_healing: number; damage_taken: number }
export interface PublicParticipant {
  actor_id: string; character_id: string | null; observed_character_key?: string | null; display_name: string | null;
  actor_kind: string | null; class_id: number | null; class_name: string | null; specialization_id: number | null;
  specialization_name: string | null; damage: number; dps: number; encounter_dps: number; hps: number; tps: number;
  rdps: number | null; deaths: number; death_seconds: number[]; series: PublicSeriesPoint[];
}
export interface PublicCombatTimeline {
  schema_version: 1; source: "single_report" | "reconciled_canonical_spine";
  canonical_report_id: string; canonical_run_index: number; contributing_report_ids: string[]; duration_micros: number;
  time_basis: "run_elapsed" | "capture_observed"; series_bucket_micros: number;
  coverage: { authoritative_start: boolean; authoritative_completion: boolean; data_gap_count: number; gap_timing: "no_known_gaps" | "count_only" };
  participant_tracks: Array<{ actor_id: string; character_id: string | null; observed_character_key: string | null;
    display_name: string | null; canonical_participant_index: number; series_point_count: number }>;
  death_markers: Array<{ actor_id: string; at_micros: number; precision: "exact_microsecond" | "one_second_bucket" }>;
  loadout_markers: Array<{ character_id: string; at_micros: number; phase_index: number; source_report_id: string }>;
  rdps_influence_spans: Array<{ influence_index: number; time_basis: "run_elapsed" | "capture_observed";
    start_micros: number; end_micros: number; complete_lifecycle: boolean }>;
  omitted: { participant_tracks: number; series_points: number; death_markers: number; loadout_markers: number; rdps_influence_spans: number };
}
export interface PublicRunReconciliation {
  schema_version: 15; reconciliation_id: string; run_group_id: string; status: ReconciliationStatus;
  canonical_spine: { report_id: string; run_index: number; artifact_sha256: string; authoritative_start: boolean;
    authoritative_completion: boolean; data_gap_count: number; event_count: number };
  reports: Array<{ report_id: string; run_index: number; artifact_sha256: string; protocol_pack_digest: string;
    created_unix_millis: number; canonical_spine: boolean; local_profile_witnesses: unknown[]; local_state_witnesses: unknown[];
    combat_loadout_phases: unknown[] }>;
  participant_character_count: number; local_vantage_character_count: number; complete_local_vantage_coverage: boolean;
  state_replay_readiness: string; state_replay_blockers: string[]; verified_state_input_sha256?: string;
  reconciled_participants: Array<PublicParticipant & { rdps_damage: number | null; contribution_given: number | null;
    contribution_received: number | null; rdps_incomplete: boolean }>;
  conservation?: { raw_damage: number; rdps_damage: number; contribution_given: number; contribution_received: number; conserved: boolean };
  attribution_replay_completed: boolean; timeline: PublicCombatTimeline;
}

const reportIdPattern = /^rpt_[a-f0-9]{32}$/;
const groupIdPattern = /^run_[a-f0-9]{32}$/;
const reconciliationStatuses = new Set<ReconciliationStatus>(["single_vantage", "multiple_reports_no_additional_vantage", "cross_vantage_evidence_available", "reconciled"]);
const replayReadiness = new Set(["single_vantage", "multiple_reports_no_additional_vantage", "blocked", "partial_coverage_ready", "full_coverage_ready"]);

export function isPublicParseCatalog(value: unknown): value is PublicParseCatalog {
  return isRecord(value) && value.schema_version === 6 && isNonNegativeInteger(value.total_entries) && isNonNegativeInteger(value.offset) &&
    (value.next_offset == null || isNonNegativeInteger(value.next_offset)) && Array.isArray(value.entries) &&
    value.entries.every(isCatalogEntry) && isCatalogFacets(value.facets);
}
export function isPublicParseReport(value: unknown): value is PublicParseReport {
  return isRecord(value) && value.schema_version === 14 && value.projection_revision === 4 && typeof value.report_id === "string" &&
    reportIdPattern.test(value.report_id) && (value.visibility === "public" || value.visibility === "unlisted") &&
    isVerification(value.verification) && Array.isArray(value.runs) &&
    value.runs.every((run) => isPublicRun(run, value.report_id));
}
export function isPublicRunReconciliation(value: unknown): value is PublicRunReconciliation {
  return isRecord(value) && value.schema_version === 15 && typeof value.reconciliation_id === "string" &&
    typeof value.run_group_id === "string" && groupIdPattern.test(value.run_group_id) && isReconciliationStatus(value.status) &&
    isCanonicalSpine(value.canonical_spine) && Array.isArray(value.reports) && value.reports.length > 0 &&
    value.reports.every(isReconciliationReport) && unique(value.reports.map((report) => report.report_id)) &&
    value.reports.filter((report) => report.canonical_spine).length === 1 &&
    value.reports.some((report) => report.canonical_spine && report.report_id === value.canonical_spine.report_id &&
      report.run_index === value.canonical_spine.run_index) &&
    isNonNegativeInteger(value.participant_character_count) && isNonNegativeInteger(value.local_vantage_character_count) &&
    typeof value.complete_local_vantage_coverage === "boolean" && replayReadiness.has(value.state_replay_readiness) &&
    Array.isArray(value.state_replay_blockers) && value.state_replay_blockers.every((blocker) => typeof blocker === "string") &&
    typeof value.attribution_replay_completed === "boolean" && isConservation(value.conservation) && isReplayStateConsistent(value) &&
    Array.isArray(value.reconciled_participants) && value.reconciled_participants.every(isParticipant) &&
    isTimeline(value.timeline, value.reconciled_participants, value.attribution_replay_completed) &&
    value.timeline.canonical_report_id === value.canonical_spine.report_id &&
    value.timeline.canonical_run_index === value.canonical_spine.run_index &&
    value.reports.every((report) => value.timeline.contributing_report_ids.includes(report.report_id)) &&
    value.timeline.contributing_report_ids.every((id) => value.reports.some((report: unknown) => isRecord(report) && report.report_id === id));
}
export function validateReportId(value: string): boolean { return reportIdPattern.test(value) }

function isCatalogEntry(value: unknown): boolean {
  return isRecord(value) && typeof value.report_id === "string" && reportIdPattern.test(value.report_id) &&
    Array.isArray(value.report_ids) && value.report_ids.every((id) => typeof id === "string" && reportIdPattern.test(id)) &&
    isNonNegativeInteger(value.run_index) && typeof value.run_group_id === "string" && groupIdPattern.test(value.run_group_id) &&
    isNonNegativeInteger(value.contribution_count) && isNonNegativeInteger(value.distinct_submitter_count) &&
    isNonNegativeInteger(value.local_profile_witness_character_count) && isReconciliationStatus(value.attribution_reconciliation_status) &&
    typeof value.region_id === "string" && typeof value.terminal_state === "string" && isNonNegativeInteger(value.participant_count);
}
function isCatalogFacets(value: unknown): boolean {
  return isRecord(value) && ["deployments", "regions", "activities", "scenes", "difficulties", "terminal_states"].every((key) => Array.isArray(value[key]));
}
function isVerification(value: unknown): boolean {
  return isRecord(value) && ["replayed", "corroborated", "ranked"].includes(String(value.tier)) &&
    typeof value.artifact_sha256 === "string" && isNonNegativeInteger(value.event_count);
}
function isPublicRun(value: unknown, reportId: string): boolean {
  return isRecord(value) && isNonNegativeInteger(value.run_index) && typeof value.run_group_id === "string" &&
    groupIdPattern.test(value.run_group_id) && Array.isArray(value.participants) && value.participants.every(isParticipant) &&
    isTimeline(value.timeline, value.participants, true) && value.timeline.canonical_report_id === reportId &&
    value.timeline.canonical_run_index === value.run_index;
}
function isParticipant(value: unknown): boolean {
  return isRecord(value) && typeof value.actor_id === "string" && value.actor_id.length > 0 && isFiniteNumber(value.damage) && isFiniteNumber(value.dps) &&
    Array.isArray(value.series) && value.series.length <= 604_800 && value.series.every((point) => isRecord(point) &&
      isNonNegativeInteger(point.second) && isNonNegativeInteger(point.damage) && isNonNegativeInteger(point.effective_healing) &&
      isNonNegativeInteger(point.damage_taken)) && strictlyAscending(value.series.map((point) => point.second));
}
function isTimeline(value: unknown, participants: readonly unknown[], requireResolvedTracks: boolean): value is PublicCombatTimeline {
  return isRecord(value) && value.schema_version === 1 && (value.source === "single_report" || value.source === "reconciled_canonical_spine") &&
    typeof value.canonical_report_id === "string" && reportIdPattern.test(value.canonical_report_id) &&
    isNonNegativeInteger(value.canonical_run_index) && Array.isArray(value.contributing_report_ids) &&
    value.contributing_report_ids.length > 0 && value.contributing_report_ids.every((id) => typeof id === "string" && reportIdPattern.test(id)) &&
    unique(value.contributing_report_ids) &&
    value.time_basis === "run_elapsed" && isNonNegativeInteger(value.duration_micros) && value.duration_micros <= 604_800_000_000 &&
    value.series_bucket_micros === 1_000_000 && Array.isArray(value.participant_tracks) && value.participant_tracks.length <= 256 &&
    value.participant_tracks.every((track) => isTimelineTrack(track, participants, value.duration_micros, requireResolvedTracks)) &&
    unique(value.participant_tracks.map((track: unknown) => isRecord(track) ? track.canonical_participant_index : track)) &&
    Array.isArray(value.death_markers) && value.death_markers.length <= 4_096 && value.death_markers.every((marker) => isDeathMarker(marker, value.duration_micros)) &&
    value.death_markers.every((marker) => value.participant_tracks.some((track: unknown) => isRecord(track) && track.actor_id === marker.actor_id)) &&
    Array.isArray(value.loadout_markers) && value.loadout_markers.length <= 4_096 && value.loadout_markers.every((marker) => isLoadoutMarker(marker, value.duration_micros)) &&
    value.loadout_markers.every((marker) => value.contributing_report_ids.includes(marker.source_report_id)) &&
    Array.isArray(value.rdps_influence_spans) && value.rdps_influence_spans.length <= 65_536 && value.rdps_influence_spans.every((span) => isRdpsSpan(span, value.duration_micros)) &&
    isCoverage(value.coverage) && isOmitted(value.omitted);
}
function isCanonicalSpine(value: unknown): value is PublicRunReconciliation["canonical_spine"] {
  return isRecord(value) && typeof value.report_id === "string" && reportIdPattern.test(value.report_id) &&
    isNonNegativeInteger(value.run_index) && typeof value.artifact_sha256 === "string" &&
    typeof value.authoritative_start === "boolean" && typeof value.authoritative_completion === "boolean" &&
    isNonNegativeInteger(value.data_gap_count) && isNonNegativeInteger(value.event_count);
}
function isReconciliationReport(value: unknown): value is PublicRunReconciliation["reports"][number] {
  return isRecord(value) && typeof value.report_id === "string" && reportIdPattern.test(value.report_id) &&
    isNonNegativeInteger(value.run_index) && typeof value.artifact_sha256 === "string" && typeof value.protocol_pack_digest === "string" &&
    isNonNegativeInteger(value.created_unix_millis) && typeof value.canonical_spine === "boolean" &&
    Array.isArray(value.local_profile_witnesses) && Array.isArray(value.local_state_witnesses) && Array.isArray(value.combat_loadout_phases);
}
function isConservation(value: unknown): boolean {
  return value == null || (isRecord(value) && Number.isSafeInteger(value.raw_damage) && Number.isSafeInteger(value.rdps_damage) &&
    Number.isSafeInteger(value.contribution_given) && Number.isSafeInteger(value.contribution_received) && typeof value.conserved === "boolean" &&
    (!value.conserved || (value.raw_damage === value.rdps_damage && value.contribution_given === value.contribution_received)));
}
function isReplayStateConsistent(value: Record<string, any>): boolean {
  if (!value.attribution_replay_completed) return true;
  return value.status === "reconciled" && isRecord(value.conservation) && value.conservation.conserved === true &&
    Array.isArray(value.reconciled_participants) && value.reconciled_participants.length > 0 &&
    value.timeline?.source === "reconciled_canonical_spine";
}
function isTimelineTrack(value: unknown, participants: readonly unknown[], durationMicros: number, requireResolved: boolean): boolean {
  if (!isRecord(value) || typeof value.actor_id !== "string" || !isNonNegativeInteger(value.canonical_participant_index) ||
      value.canonical_participant_index >= 256 || !isNonNegativeInteger(value.series_point_count) || value.series_point_count > 262_144) return false;
  const participant = participants[value.canonical_participant_index];
  if (!requireResolved && participant == null) return true;
  if (!isRecord(participant) || participant.actor_id !== value.actor_id || !Array.isArray(participant.series) ||
      value.series_point_count > participant.series.length) return false;
  const maximumSecond = Math.floor(durationMicros / 1_000_000);
  return participant.series.slice(0, value.series_point_count).every((point) => isRecord(point) && point.second <= maximumSecond);
}
function isDeathMarker(value: unknown, durationMicros: number): boolean {
  return isRecord(value) && typeof value.actor_id === "string" && isNonNegativeInteger(value.at_micros) &&
    value.at_micros <= durationMicros && (value.precision === "exact_microsecond" || value.precision === "one_second_bucket");
}
function isLoadoutMarker(value: unknown, durationMicros: number): boolean {
  return isRecord(value) && typeof value.character_id === "string" && isNonNegativeInteger(value.at_micros) &&
    value.at_micros <= durationMicros && isNonNegativeInteger(value.phase_index) &&
    typeof value.source_report_id === "string" && reportIdPattern.test(value.source_report_id);
}
function isRdpsSpan(value: unknown, durationMicros: number): boolean {
  return isRecord(value) && isNonNegativeInteger(value.influence_index) &&
    (value.time_basis === "run_elapsed" || value.time_basis === "capture_observed") &&
    isNonNegativeInteger(value.start_micros) && isNonNegativeInteger(value.end_micros) &&
    value.end_micros >= value.start_micros &&
    (value.time_basis === "capture_observed" || value.end_micros <= durationMicros) &&
    typeof value.complete_lifecycle === "boolean";
}
function isCoverage(value: unknown): boolean {
  return isRecord(value) && typeof value.authoritative_start === "boolean" &&
    typeof value.authoritative_completion === "boolean" && isNonNegativeInteger(value.data_gap_count) &&
    (value.gap_timing === "no_known_gaps" || value.gap_timing === "count_only") &&
    (value.data_gap_count === 0 ? value.gap_timing === "no_known_gaps" : value.gap_timing === "count_only");
}
function isOmitted(value: unknown): boolean {
  return isRecord(value) && ["participant_tracks", "series_points", "death_markers", "loadout_markers", "rdps_influence_spans"]
    .every((key) => isNonNegativeInteger(value[key]));
}
function isReconciliationStatus(value: unknown): value is ReconciliationStatus {
  return typeof value === "string" && reconciliationStatuses.has(value as ReconciliationStatus);
}
function isNonNegativeInteger(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0 }
function isFiniteNumber(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) }
function strictlyAscending(values: readonly number[]): boolean { return values.every((value, index) => index === 0 || value > values[index - 1]!) }
function unique(values: readonly unknown[]): boolean { return new Set(values).size === values.length }
function isRecord(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value) }
