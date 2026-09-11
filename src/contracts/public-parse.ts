export type ReconciliationStatus = "single_vantage" | "multiple_reports_no_additional_vantage" | "cross_vantage_evidence_available" | "reconciled";

export interface PublicParseCatalog {
  schema_version: 6 | 7; total_entries: number; offset: number; next_offset?: number | null;
  entries: PublicParseCatalogEntry[]; facets: CatalogFacets;
}
export interface PublicParseCatalogEntry {
  report_id: string; report_ids?: string[]; run_index: number; run_group_id?: string;
  contribution_count?: number; distinct_submitter_count?: number; local_profile_witness_character_count?: number;
  attribution_reconciliation_status?: ReconciliationStatus; created_unix_millis: number; deployment_id: string;
  client_build?: string | null; protocol_pack_digest?: string | null;
  submitter_id?: string; submitter_name?: string;
  region_id: string; activity_id?: string; activity_family_id?: string; activity_category_id?: string;
  scene_id?: number; scene_name?: string; difficulty_family?: string; difficulty_tier?: number;
  terminal_state: string; total_run_time_micros?: number; participant_count: number;
}
export interface MyParseCatalog {
  schema_version: 1 | 2; total_entries: number; offset: number; next_offset?: number | null;
  claimed_character_ids: string[]; entries: MyParseCatalogEntry[];
}
export interface MyParseCatalogEntry extends PublicParseCatalogEntry {
  visibility: "public" | "unlisted" | "private"; submitted_by_you: boolean; matched_character_ids: string[];
}
export type RunAttributionReconciliationStatus = ReconciliationStatus;
export interface CatalogFacets {
  deployments: FacetValue[]; regions: FacetValue[]; activities: FacetValue[];
  scenes: SceneFacetValue[]; difficulties: FacetValue[]; terminal_states: FacetValue[];
}
export interface FacetValue { id: string; count: number }
export interface SceneFacetValue { id: number; label?: string; count: number }

export interface PublicParseReport {
  schema_version: 6 | 7 | 8 | 9 | 10 | 11 | 12 | 14 | 15 | 16 | 17; projection_revision?: number; report_id: string; visibility: "public" | "unlisted" | "private";
  created_unix_millis: number; game_plugin_id: string; deployment_id: string; region_id: string;
  world_id: string | null; client_build: string; protocol_pack_digest?: string; verification: PublicVerification;
  submission_provenance: PublicSubmissionProvenance; runs: PublicRun[];
}
export interface PublicSubmissionProvenance { submitter_id: string | null; authentication: string }
export interface PublicVerification {
  tier: "replayed" | "corroborated" | "ranked"; artifact_sha256: string; canonical_content_sha256: string;
  event_count: number; privacy_policy_digest: string;
}
export interface PublicRun {
  run_index: number; run_group_id?: string; correlation_method?: "exact_instance_id" | "isolated_artifact";
  activity_id: string | null; activity_family_id: string | null; activity_category_id?: string | null;
  scene_id: number | null; scene_name: string | null; difficulty_family: string | null; difficulty_tier: number | null;
  terminal_state: string; total_run_time_micros: number | null; game_time_micros: number | null;
  active_combat_micros: number; true_time_micros: number | null; retry_count: number; boss_retry_count: number;
  rdps_status: string; data_gap_count: number; authoritative_start: boolean; authoritative_completion: boolean;
  submission_disposition: string; segments: PublicRunSegment[]; participants: PublicParticipant[];
  combat_loadout_phases?: PublicCombatLoadoutPhase[]; timeline?: PublicCombatTimeline;
  rdps_influences?: PublicRdpsInfluence[]; rdps_effects?: PublicRdpsEffectPresentation[];
}
export interface PublicRunSegment {
  index: number; kind: string; wall_time_micros: number; active_combat_micros: number; attempt_count: number; retry_count: number;
}
export interface PublicSeriesPoint {
  second: number; damage: number; effective_healing: number; damage_taken: number;
  rdps_damage?: number; rdps_contribution_given?: number; rdps_contribution_received?: number;
}
export interface PublicParticipant {
  actor_id: string; character_id: string | null; observed_character_key?: string | null; display_name: string | null;
  actor_kind: string | null; class_id: number | null; class_name: string | null; specialization_id: number | null;
  specialization_name: string | null; damage: number; dps: number; encounter_dps: number; hps: number; tps: number;
  rdps: number | null; rdps_incomplete?: boolean; deaths: number; death_seconds?: number[]; abilities?: PublicAbilitySummary[]; series?: PublicSeriesPoint[];
}
export interface PublicAbilitySummary {
  ability_id: string; presentation_name: string | null; presentation_kind: string | null; icon_asset_path: string | null;
  presentation_recount_group_id?: string | null; presentation_recount_group_name?: string | null;
  casts: number; hits: number; critical_hits: number; damage: number; effective_damage: number;
  healing: number; effective_healing: number; shielding: number;
}
export interface PublicRdpsEffectPresentation {
  effect_id: string; presentation_name: string; presentation_kind: string; icon_asset_path: string | null;
}
export interface PublicRationalDamageDelta { numerator: string; denominator: string; contribution_count: number }
export interface PublicRdpsInfluence {
  effect_id: string; attribution_component: string | null; complete_effect: boolean;
  provider_actor_id: string; recipient_actor_id: string; affected_ability_id: string | null; target_actor_id: string | null;
  first_observed_micros: number; last_observed_micros: number; damage_event_count: number; critical_hit_count?: number | null;
  observed_damage: string; exact_integer_delta: string; exact_rational_deltas: PublicRationalDamageDelta[];
  attributed_rdps: string | null; damage_context_complete: boolean;
}
export interface PublicCombatTimeline {
  schema_version: 1 | 2 | 3 | 4 | 5 | 6; source: "single_report" | "reconciled_canonical_spine";
  canonical_report_id: string; canonical_run_index: number; contributing_report_ids: string[]; duration_micros: number;
  time_basis: "run_elapsed" | "capture_observed"; series_bucket_micros: number;
  coverage: { authoritative_start: boolean; authoritative_completion: boolean; data_gap_count: number; gap_timing: "no_known_gaps" | "count_only" };
  clock_anchor?: { at_micros: number; game_time_millis: number; source_report_id: string; event_sequence: number };
  rate_clock?: PublicTimelineRateClockPoint[]; rate_clock_complete?: boolean;
  participant_tracks: Array<{ actor_id: string; character_id: string | null; observed_character_key: string | null;
    display_name: string | null; canonical_participant_index: number; series_point_count: number; omitted_skill_uses?: number }>;
  death_markers: Array<{ actor_id: string; at_micros: number; precision: "exact_microsecond" | "one_second_bucket"; cause?: PublicTimelineDeathCause | null }>;
  loadout_markers: Array<{ character_id: string; at_micros: number; phase_index: number; source_report_id: string }>;
  skill_uses?: PublicTimelineSkillUse[];
  rdps_influence_spans: Array<{ influence_index: number; time_basis: "run_elapsed" | "capture_observed";
    start_micros: number; end_micros: number; complete_lifecycle: boolean }>;
  omitted: { participant_tracks: number; series_points: number; death_markers: number; loadout_markers: number; skill_uses?: number; rdps_influence_spans: number; rate_clock_points?: number };
}
export interface PublicTimelineSkillUse {
  actor_id: string; at_micros: number; action_id: string; action_instance_id?: string;
  state: "started"; action_kind?: string; evidence: PublicTimelineSkillUseEvidence[]; omitted_evidence: number;
}
export interface PublicTimelineSkillUseEvidence {
  source_report_id: string; event_sequence: number; game_time_millis?: number; kind: "exact_wire_cast_start";
}
export interface PublicTimelineRateClockPoint {
  second: number; edps_elapsed_micros: number; adps_elapsed_micros: number;
}
export type ProfileWitnessDisposition = "missing" | "single_report_exact" | "multiple_reports_identical" | "multiple_reports_require_ordering";
export type ModuleSnapshotDisposition = "missing" | "complete" | "invalid";
export interface PublicCombatLoadoutPhase {
  character_id: string; display_name: string | null; observed_micros: number; run_elapsed_micros: number;
  game_time_millis: number | null; segment_index: number | null; encounter_index: number | null; attempt_number: number | null;
  in_active_combat: boolean; class_id: number | null; class_name: string | null; specialization_id: number | null;
  specialization_name: string | null; equipped_skill_ids: string[]; equipped_imagines: PublicCombatImagineLoadout[];
  equipment_count: number | null; equipped_module_count: number | null; module_snapshot_disposition: ModuleSnapshotDisposition;
  equipped_modules: PublicCombatEquippedModule[]; talent_count: number | null;
}
export interface PublicCombatImagineLoadout { skill_id: string; tier: number | null; equipped_slot: number }
export interface PublicCombatEquippedModule { equipped_slot: number; config_id: number; level: number | null; effects: PublicCombatModuleEffect[] }
export interface PublicCombatModuleEffect { effect_id: number; initial_link_points: number | null }
export interface PublicLocalProfileWitness {
  character_id: string; placement: "unspecified" | "pre_run_baseline" | "in_run"; event_sequence: number;
  observed_micros: number; game_time_millis: number | null; payload_sha256: string;
}
export interface PublicLocalStateWitness extends PublicLocalProfileWitness {
  related_character_id?: string; actor_id: number; entity_uuid: number;
  kind: "entity_attributes" | "temporary_attributes" | "resource" | "life_wave_trigger_status" | "life_wave_trigger_healing" | "stat_resonance_status";
  update_kind: string;
}
export interface PublicReconciliationCharacter {
  character_id: string; participant_report_count: number; disposition: ProfileWitnessDisposition; selected_report_id: string | null;
  state_witness_count: number; game_time_aligned_state_witness_count: number; witnesses: PublicCharacterWitnessSource[];
  combat_loadout_disposition?: ProfileWitnessDisposition; selected_combat_loadout_phases?: PublicCombatLoadoutPhase[];
}
export interface PublicCharacterWitnessSource {
  report_id: string; run_index: number; artifact_sha256: string; snapshots: PublicLocalProfileWitness[]; state_snapshots: PublicLocalStateWitness[];
}
export interface PublicRunReconciliation {
  schema_version: 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 15 | 16 | 17 | 18 | 19 | 20; reconciliation_id: string; run_group_id: string; status: ReconciliationStatus;
  canonical_spine: { report_id: string; run_index: number; artifact_sha256: string; authoritative_start: boolean;
    authoritative_completion: boolean; data_gap_count: number; event_count: number };
  reports: Array<{ report_id: string; run_index: number; artifact_sha256: string; deployment_id?: string; client_build?: string; protocol_pack_digest: string;
    created_unix_millis: number; canonical_spine: boolean; local_profile_witnesses: PublicLocalProfileWitness[];
    local_state_witnesses: PublicLocalStateWitness[]; combat_loadout_phases: PublicCombatLoadoutPhase[] }>;
  characters: PublicReconciliationCharacter[];
  participant_character_count: number; local_vantage_character_count: number; complete_local_vantage_coverage: boolean;
  state_replay_readiness: string; state_replay_blockers: string[]; verified_state_input_sha256?: string;
  reconciled_participants: PublicReconciledParticipant[];
  conservation?: PublicAttributionConservation;
  rdps_influences?: PublicRdpsInfluence[]; rdps_effects?: PublicRdpsEffectPresentation[];
  swift_vortex_candidate_audit?: SwiftVortexCandidateAuditReport;
  /** Required in schema 18 and later. Null until conserved replay authors formula coverage. */
  rdps_status?: string | null;
  attribution_replay_completed: boolean; timeline?: PublicCombatTimeline;
}
export interface PublicTimelineDeathCause {
  evidence: "packet_terminal_damage"; final_hit: PublicTimelineDeathHit;
  prior_hits: PublicTimelineDeathHit[]; prior_hits_truncated: boolean;
}
export interface PublicTimelineDeathHit {
  at_micros: number; source_actor_id: string; direct_source_actor_id?: string | null;
  ability_id?: string | null; breakdown_ability_id?: string | null;
  source_presentation?: PublicTimelineDeathActorPresentation;
  direct_source_presentation?: PublicTimelineDeathActorPresentation;
  ability_presentation?: PublicTimelineDeathAbilityPresentation;
  reported_damage: number; effective_damage: number; critical: boolean;
}
export interface PublicTimelineDeathActorPresentation {
  actor_id: string; name: string; provenance: "public_participant" | "exact_build_monster_catalog" | "trusted_monster_catalog_id";
}
export interface PublicTimelineDeathAbilityPresentation {
  ability_id: string; name: string; provenance: "exact_build_action_catalog" | "trusted_action_catalog_id";
}

export interface PublicReconciledParticipant extends PublicParticipant {
  rdps_damage: number | null; contribution_given: number | null; contribution_received: number | null; rdps_incomplete: boolean;
}
export interface PublicAttributionConservation {
  raw_damage: number; rdps_damage: number; contribution_given: number; contribution_received: number; conserved: boolean;
}
export interface SwiftVortexAppliedMagnitude {
  haste_basis_points: number; normal_action_speed_basis_points: number; guide_action_speed_basis_points: number;
}
export interface SwiftVortexCandidateAuditReport {
  schema_version: 1; effect_id: 2110060; candidate_status_event_count: number; exact_application_transition_count: number;
  exact_paired_receipt_count: number; distinct_provider_entity_count: number; distinct_recipient_entity_count: number;
  incomplete_application_count: number; incomplete_removal_count: number; identity_mismatch_event_count: number;
  blockers: Record<string, number>; magnitude_consensus?: SwiftVortexAppliedMagnitude; magnitude_gate_satisfied: boolean;
  production_attribution_enabled: false; receipts: unknown[];
}
export interface UpdateParseVisibilityResponse {
  schema_version: 1; report_id: string; visibility: "public" | "unlisted" | "private"; share_url: string | null;
}

const reportIdPattern = /^rpt_[a-f0-9]{32}$/;
const groupIdPattern = /^run_[a-f0-9]{32}$/;
const reconciliationIdPattern = /^rec_[a-f0-9]{32}$/;
const protocolDigestPattern = /^sha256:[a-f0-9]{64}$/;
const legacyReportSchemas = new Set([6, 7, 8, 9, 10, 11, 12]);
const legacyReconciliationSchemas = new Set([5, 6, 7, 8, 9, 10, 11, 12]);
const reconciliationStatuses = new Set<ReconciliationStatus>(["single_vantage", "multiple_reports_no_additional_vantage", "cross_vantage_evidence_available", "reconciled"]);
const replayReadiness = new Set(["single_vantage", "multiple_reports_no_additional_vantage", "blocked", "partial_coverage_ready", "full_coverage_ready"]);
const profileWitnessDispositions = new Set<ProfileWitnessDisposition>(["missing", "single_report_exact", "multiple_reports_identical", "multiple_reports_require_ordering"]);
const moduleSnapshotDispositions = new Set<ModuleSnapshotDisposition>(["missing", "complete", "invalid"]);

export function isPublicParseCatalog(value: unknown): value is PublicParseCatalog {
  return isRecord(value) && (value.schema_version === 6 || value.schema_version === 7) && isNonNegativeInteger(value.total_entries) && isNonNegativeInteger(value.offset) &&
    (value.next_offset == null || isNonNegativeInteger(value.next_offset)) && Array.isArray(value.entries) &&
    value.entries.every((entry) => isCatalogEntry(entry, value.schema_version === 7)) && isCatalogFacets(value.facets);
}
export function isPublicParseReport(value: unknown): value is PublicParseReport {
  if (!isRecord(value)) return false;
  if (legacyReportSchemas.has(value.schema_version)) {
    return (value.projection_revision === undefined || isNonNegativeInteger(value.projection_revision)) &&
      typeof value.report_id === "string" && reportIdPattern.test(value.report_id) &&
      (value.visibility === "public" || value.visibility === "unlisted" || value.visibility === "private") &&
      isVerification(value.verification) && Array.isArray(value.runs);
  }
  const timelineSchema = value.schema_version === 14 && value.projection_revision === 4 ? 1
    : value.schema_version === 14 && value.projection_revision === 5 ? 2
    : value.schema_version === 15 && (value.projection_revision === 6 || value.projection_revision === 7) ? 3
    : value.schema_version === 16 && value.projection_revision === 8 ? 4
    : value.schema_version === 17 && value.projection_revision === 9 ? 5
    : value.schema_version === 17 && value.projection_revision === 10 ? 6 : null;
  if (timelineSchema == null) return false;
  const requireProtocolIdentity = (value.schema_version === 15 && value.projection_revision === 7) ||
    (value.schema_version === 16 && value.projection_revision === 8) ||
    (value.schema_version === 17 && (value.projection_revision === 9 || value.projection_revision === 10));
  return typeof value.report_id === "string" &&
    reportIdPattern.test(value.report_id) && (value.visibility === "public" || value.visibility === "unlisted" || value.visibility === "private") &&
    typeof value.deployment_id === "string" && value.deployment_id.length > 0 &&
    typeof value.client_build === "string" && value.client_build.length > 0 &&
    (value.protocol_pack_digest === undefined || (typeof value.protocol_pack_digest === "string" && value.protocol_pack_digest.length > 0)) &&
    (!requireProtocolIdentity || (typeof value.protocol_pack_digest === "string" && protocolDigestPattern.test(value.protocol_pack_digest))) &&
    isVerification(value.verification) && Array.isArray(value.runs) &&
    value.runs.every((run) => isPublicRun(run, value.report_id, timelineSchema));
}
export function isMyParseCatalog(value: unknown): value is MyParseCatalog {
  return isRecord(value) && (value.schema_version === 1 || value.schema_version === 2) && isNonNegativeInteger(value.total_entries) &&
    isNonNegativeInteger(value.offset) && (value.next_offset == null || isNonNegativeInteger(value.next_offset)) &&
    Array.isArray(value.claimed_character_ids) && value.claimed_character_ids.every((id) => typeof id === "string" && id.length > 0) &&
    Array.isArray(value.entries) && value.entries.every((entry) => isRecord(entry) && isCatalogEntry(entry, value.schema_version === 2) &&
      (entry.visibility === "public" || entry.visibility === "unlisted" || entry.visibility === "private") &&
      typeof entry.submitted_by_you === "boolean" && Array.isArray(entry.matched_character_ids) &&
      entry.matched_character_ids.every((id: unknown) => typeof id === "string" && id.length > 0));
}
export function isUpdateParseVisibilityResponse(value: unknown): value is UpdateParseVisibilityResponse {
  return isRecord(value) && value.schema_version === 1 && typeof value.report_id === "string" &&
    reportIdPattern.test(value.report_id) &&
    (value.visibility === "public" || value.visibility === "unlisted" || value.visibility === "private") &&
    (value.share_url == null || typeof value.share_url === "string");
}
export function isPublicRunReconciliation(value: unknown): value is PublicRunReconciliation {
  if (!isRecord(value)) return false;
  if (legacyReconciliationSchemas.has(value.schema_version)) return isLegacyRunReconciliation(value);
  if (!isRecord(value.timeline)) return false;
  const timelineSchema = value.timeline.schema_version;
  if (!((value.schema_version === 15 && (timelineSchema === 1 || timelineSchema === 2)) ||
      ((value.schema_version === 16 || value.schema_version === 17 || value.schema_version === 18) && timelineSchema === 3) ||
      (value.schema_version === 19 && timelineSchema === 4) ||
      (value.schema_version === 20 && (timelineSchema === 5 || timelineSchema === 6)))) return false;
  const requireRuntimeIdentity = value.schema_version === 17 || value.schema_version === 18 || value.schema_version === 19 || value.schema_version === 20;
  const replayRdpsStatusValid = (value.schema_version !== 18 && value.schema_version !== 19 && value.schema_version !== 20) || value.rdps_status === null ||
    (typeof value.rdps_status === "string" && value.rdps_status.length > 0);
  return typeof value.reconciliation_id === "string" && reconciliationIdPattern.test(value.reconciliation_id) &&
    typeof value.run_group_id === "string" && groupIdPattern.test(value.run_group_id) && isReconciliationStatus(value.status) &&
    isCanonicalSpine(value.canonical_spine) && Array.isArray(value.reports) && value.reports.length > 0 &&
    value.reports.every((report) => isReconciliationReport(report, requireRuntimeIdentity)) && unique(value.reports.map((report) => report.report_id)) &&
    value.reports.filter((report) => report.canonical_spine).length === 1 &&
    value.reports.some((report) => report.canonical_spine && report.report_id === value.canonical_spine.report_id &&
      report.run_index === value.canonical_spine.run_index) &&
    isNonNegativeInteger(value.participant_character_count) && isNonNegativeInteger(value.local_vantage_character_count) &&
    typeof value.complete_local_vantage_coverage === "boolean" && replayReadiness.has(value.state_replay_readiness) &&
    Array.isArray(value.state_replay_blockers) && value.state_replay_blockers.every((blocker) => typeof blocker === "string") &&
    typeof value.attribution_replay_completed === "boolean" && replayRdpsStatusValid &&
    isConservation(value.conservation) && isReplayStateConsistent(value) && isCompletedReplayRdpsConsistent(value) &&
    (value.swift_vortex_candidate_audit == null || isSwiftVortexCandidateAudit(value.swift_vortex_candidate_audit)) &&
    Array.isArray(value.characters) && value.characters.length <= 256 && value.characters.every((character) => isReconciliationCharacter(character, value.reports)) &&
    unique(value.characters.map((character: unknown) => isRecord(character) ? character.character_id : character)) &&
    Array.isArray(value.reconciled_participants) && value.reconciled_participants.every((participant) => isParticipant(participant, timelineSchema)) &&
    isTimeline(value.timeline, value.reconciled_participants, value.attribution_replay_completed) &&
    value.timeline.canonical_report_id === value.canonical_spine.report_id &&
    value.timeline.canonical_run_index === value.canonical_spine.run_index &&
    value.reports.every((report) => value.timeline.contributing_report_ids.includes(report.report_id)) &&
    value.timeline.contributing_report_ids.every((id) => value.reports.some((report: unknown) => isRecord(report) && report.report_id === id));
}
export function validateReportId(value: string): boolean { return reportIdPattern.test(value) }
export function validateRunGroupId(value: string): boolean { return groupIdPattern.test(value) }

function isCatalogEntry(value: unknown, requirePresentationIdentity: boolean): boolean {
  return isRecord(value) && typeof value.report_id === "string" && reportIdPattern.test(value.report_id) &&
    (value.report_ids === undefined || (Array.isArray(value.report_ids) && value.report_ids.every((id) => typeof id === "string" && reportIdPattern.test(id)))) &&
    isNonNegativeInteger(value.run_index) && (value.run_group_id === undefined || (typeof value.run_group_id === "string" && groupIdPattern.test(value.run_group_id))) &&
    (value.contribution_count === undefined || isNonNegativeInteger(value.contribution_count)) &&
    (value.distinct_submitter_count === undefined || isNonNegativeInteger(value.distinct_submitter_count)) &&
    (value.local_profile_witness_character_count === undefined || isNonNegativeInteger(value.local_profile_witness_character_count)) &&
    (value.attribution_reconciliation_status === undefined || isReconciliationStatus(value.attribution_reconciliation_status)) &&
    (!requirePresentationIdentity || (typeof value.deployment_id === "string" && value.deployment_id.length > 0 &&
      (value.client_build == null || (typeof value.client_build === "string" && value.client_build.length > 0)) &&
      (value.protocol_pack_digest == null || (typeof value.protocol_pack_digest === "string" && protocolDigestPattern.test(value.protocol_pack_digest))))) &&
    typeof value.region_id === "string" && typeof value.terminal_state === "string" && isNonNegativeInteger(value.participant_count);
}
function isCatalogFacets(value: unknown): boolean {
  return isRecord(value) && ["deployments", "regions", "activities", "scenes", "difficulties", "terminal_states"].every((key) => Array.isArray(value[key]));
}
function isVerification(value: unknown): boolean {
  return isRecord(value) && ["replayed", "corroborated", "ranked"].includes(String(value.tier)) &&
    typeof value.artifact_sha256 === "string" && isNonNegativeInteger(value.event_count);
}
function isPublicRun(value: unknown, reportId: string, timelineSchema: 1 | 2 | 3 | 4 | 5 | 6): boolean {
  return isRecord(value) && isNonNegativeInteger(value.run_index) && typeof value.run_group_id === "string" &&
    groupIdPattern.test(value.run_group_id) && isRecord(value.timeline) && value.timeline.schema_version === timelineSchema &&
    (timelineSchema < 3 ? value.combat_loadout_phases === undefined || isLoadoutPhases(value.combat_loadout_phases, value.timeline.duration_micros)
      : isLoadoutPhases(value.combat_loadout_phases, value.timeline.duration_micros)) &&
    Array.isArray(value.participants) && value.participants.every((participant) => isParticipant(participant, timelineSchema)) &&
    isTimeline(value.timeline, value.participants, true) && value.timeline.canonical_report_id === reportId &&
    value.timeline.canonical_run_index === value.run_index;
}
function isParticipant(value: unknown, timelineSchema: 1 | 2 | 3 | 4 | 5 | 6): boolean {
  return isRecord(value) && typeof value.actor_id === "string" && value.actor_id.length > 0 && isFiniteNumber(value.damage) && isFiniteNumber(value.dps) &&
    (timelineSchema === 1 ? value.rdps_incomplete === undefined || typeof value.rdps_incomplete === "boolean" : typeof value.rdps_incomplete === "boolean") &&
    Array.isArray(value.series) && value.series.length <= 604_800 && value.series.every((point) => isSeriesPoint(point, timelineSchema)) &&
    strictlyAscending(value.series.map((point) => point.second));
}
function isTimeline(value: unknown, participants: readonly unknown[], requireResolvedTracks: boolean): value is PublicCombatTimeline {
  return isRecord(value) && (value.schema_version === 1 || value.schema_version === 2 || value.schema_version === 3 || value.schema_version === 4 || value.schema_version === 5 || value.schema_version === 6) && (value.source === "single_report" || value.source === "reconciled_canonical_spine") &&
    typeof value.canonical_report_id === "string" && reportIdPattern.test(value.canonical_report_id) &&
    isNonNegativeInteger(value.canonical_run_index) && Array.isArray(value.contributing_report_ids) &&
    value.contributing_report_ids.length > 0 && value.contributing_report_ids.every((id) => typeof id === "string" && reportIdPattern.test(id)) &&
    unique(value.contributing_report_ids) &&
    value.time_basis === "run_elapsed" && isNonNegativeInteger(value.duration_micros) && value.duration_micros <= 604_800_000_000 &&
    value.series_bucket_micros === 1_000_000 && isRateClock(value, value.duration_micros) &&
    Array.isArray(value.participant_tracks) && value.participant_tracks.length <= 256 &&
    value.participant_tracks.every((track) => isTimelineTrack(track, participants, value.duration_micros, requireResolvedTracks)) &&
    unique(value.participant_tracks.map((track: unknown) => isRecord(track) ? track.canonical_participant_index : track)) &&
    Array.isArray(value.death_markers) && value.death_markers.length <= 4_096 && value.death_markers.every((marker) => isDeathMarker(marker, value.duration_micros, value.schema_version, participants)) &&
    value.death_markers.every((marker) => value.participant_tracks.some((track: unknown) => isRecord(track) && track.actor_id === marker.actor_id)) &&
    Array.isArray(value.loadout_markers) && value.loadout_markers.length <= 4_096 && value.loadout_markers.every((marker) => isLoadoutMarker(marker, value.duration_micros)) &&
    value.loadout_markers.every((marker) => value.contributing_report_ids.includes(marker.source_report_id)) &&
    isTimelineSkillUses(value, value.duration_micros) &&
    Array.isArray(value.rdps_influence_spans) && value.rdps_influence_spans.length <= 65_536 && value.rdps_influence_spans.every((span) => isRdpsSpan(span, value.duration_micros)) &&
    isCoverage(value.coverage) && isOmitted(value.omitted);
}
function isSeriesPoint(value: unknown, timelineSchema: 1 | 2 | 3 | 4 | 5 | 6): boolean {
  if (!isRecord(value) || !isNonNegativeInteger(value.second) || !isNonNegativeInteger(value.damage) ||
      !isNonNegativeInteger(value.effective_healing) || !isNonNegativeInteger(value.damage_taken)) return false;
  const attribution = [value.rdps_damage, value.rdps_contribution_given, value.rdps_contribution_received];
  if (timelineSchema === 1) return attribution.every((field) => field === undefined);
  const present = attribution.filter((field) => field !== undefined).length;
  return present === 0 || (present === attribution.length && attribution.every(isNonNegativeInteger));
}
function isRateClock(value: Record<string, any>, durationMicros: number): boolean {
  if (value.schema_version !== 3 && value.schema_version !== 4 && value.schema_version !== 5 && value.schema_version !== 6) {
    return value.rate_clock === undefined && value.rate_clock_complete === undefined &&
      (!isRecord(value.omitted) || value.omitted.rate_clock_points === undefined);
  }
  if (!Array.isArray(value.rate_clock) || typeof value.rate_clock_complete !== "boolean" ||
      !isRecord(value.omitted) || !isNonNegativeInteger(value.omitted.rate_clock_points)) return false;
  if (!value.rate_clock_complete) return value.rate_clock.length === 0;
  // The reducer clock and canonical event bounds are independent evidence. A
  // fractional canonical tail may therefore have either a projected endpoint
  // or only the last completed one-second clock point.
  const completedSecondPoints = Math.floor(durationMicros / 1_000_000);
  const partialFinalPoint = durationMicros % 1_000_000 === 0 ? 0 : 1;
  if (value.omitted.rate_clock_points !== 0 ||
      (value.rate_clock.length !== completedSecondPoints && value.rate_clock.length !== completedSecondPoints + partialFinalPoint)) return false;
  let priorEdps = 0, priorAdps = 0;
  return value.rate_clock.every((point: unknown, index: number) => {
    const boundaryMicros = Math.min((index + 1) * 1_000_000, durationMicros);
    if (!isRecord(point) || point.second !== index || !isNonNegativeInteger(point.edps_elapsed_micros) ||
        !isNonNegativeInteger(point.adps_elapsed_micros) || point.edps_elapsed_micros < priorEdps ||
        point.adps_elapsed_micros < priorAdps || point.adps_elapsed_micros > point.edps_elapsed_micros ||
        point.edps_elapsed_micros > boundaryMicros) return false;
    priorEdps = point.edps_elapsed_micros;
    priorAdps = point.adps_elapsed_micros;
    return true;
  });
}
function isCanonicalSpine(value: unknown): value is PublicRunReconciliation["canonical_spine"] {
  return isRecord(value) && typeof value.report_id === "string" && reportIdPattern.test(value.report_id) &&
    isNonNegativeInteger(value.run_index) && typeof value.artifact_sha256 === "string" &&
    typeof value.authoritative_start === "boolean" && typeof value.authoritative_completion === "boolean" &&
    isNonNegativeInteger(value.data_gap_count) && isNonNegativeInteger(value.event_count);
}
function isReconciliationReport(value: unknown, requireRuntimeIdentity: boolean): value is PublicRunReconciliation["reports"][number] {
  return isRecord(value) && typeof value.report_id === "string" && reportIdPattern.test(value.report_id) &&
    isNonNegativeInteger(value.run_index) && typeof value.artifact_sha256 === "string" &&
    (value.deployment_id === undefined || typeof value.deployment_id === "string") &&
    (value.client_build === undefined || typeof value.client_build === "string") &&
    (!requireRuntimeIdentity || (typeof value.deployment_id === "string" && value.deployment_id.length > 0 &&
      typeof value.client_build === "string" && value.client_build.length > 0)) &&
    typeof value.protocol_pack_digest === "string" &&
    isNonNegativeInteger(value.created_unix_millis) && typeof value.canonical_spine === "boolean" &&
    Array.isArray(value.local_profile_witnesses) && value.local_profile_witnesses.length <= 65_536 && value.local_profile_witnesses.every(isLocalProfileWitness) &&
    Array.isArray(value.local_state_witnesses) && value.local_state_witnesses.length <= 262_144 && value.local_state_witnesses.every(isLocalStateWitness) &&
    isLoadoutPhases(value.combat_loadout_phases);
}
function isReconciliationCharacter(value: unknown, reports: readonly unknown[]): boolean {
  if (!isRecord(value) || typeof value.character_id !== "string" || !value.character_id ||
      !isNonNegativeInteger(value.participant_report_count) || !profileWitnessDispositions.has(value.disposition) ||
      !isNonNegativeInteger(value.state_witness_count) || !isNonNegativeInteger(value.game_time_aligned_state_witness_count) ||
      !Array.isArray(value.witnesses) || value.witnesses.length > 256 || !value.witnesses.every(isCharacterWitnessSource) ||
      !profileWitnessDispositions.has(value.combat_loadout_disposition) || !isLoadoutPhases(value.selected_combat_loadout_phases)) return false;
  if (value.selected_report_id !== null && (typeof value.selected_report_id !== "string" ||
      !reports.some((report) => isRecord(report) && report.report_id === value.selected_report_id))) return false;
  const selected = value.combat_loadout_disposition === "single_report_exact" || value.combat_loadout_disposition === "multiple_reports_identical";
  if (!selected) return value.selected_combat_loadout_phases.length === 0;
  if (value.selected_report_id === null || value.selected_combat_loadout_phases.length === 0 ||
      !value.selected_combat_loadout_phases.every((phase: PublicCombatLoadoutPhase) => phase.character_id === value.character_id)) return false;
  const sourceSets = reports.flatMap((report) => {
    if (!isRecord(report) || !Array.isArray(report.combat_loadout_phases)) return [];
    const phases = report.combat_loadout_phases.filter((phase: unknown) => isRecord(phase) && phase.character_id === value.character_id) as PublicCombatLoadoutPhase[];
    return phases.length ? [{ report_id: report.report_id, phases }] : [];
  });
  const selectedSource = sourceSets.find((source) => source.report_id === value.selected_report_id);
  if (!selectedSource || loadoutSemanticKey(selectedSource.phases) !== loadoutSemanticKey(value.selected_combat_loadout_phases)) return false;
  return value.combat_loadout_disposition !== "multiple_reports_identical" ||
    (sourceSets.length >= 2 && sourceSets.every((source) => loadoutSemanticKey(source.phases) === loadoutSemanticKey(selectedSource.phases)));
}
function loadoutSemanticKey(phases: readonly PublicCombatLoadoutPhase[]): string {
  return JSON.stringify(phases.map((phase) => ({
    segment_index: phase.segment_index, encounter_index: phase.encounter_index, attempt_number: phase.attempt_number,
    in_active_combat: phase.in_active_combat, class_id: phase.class_id, specialization_id: phase.specialization_id,
    equipment_count: phase.equipment_count, equipped_module_count: phase.equipped_module_count,
    module_snapshot_disposition: phase.module_snapshot_disposition,
    equipped_modules: [...phase.equipped_modules].sort((left, right) => left.equipped_slot - right.equipped_slot),
    talent_count: phase.talent_count, equipped_skill_ids: [...phase.equipped_skill_ids].sort(),
    equipped_imagines: [...phase.equipped_imagines].sort((left, right) => left.equipped_slot - right.equipped_slot),
  })));
}
function isCharacterWitnessSource(value: unknown): boolean {
  return isRecord(value) && typeof value.report_id === "string" && reportIdPattern.test(value.report_id) &&
    isNonNegativeInteger(value.run_index) && typeof value.artifact_sha256 === "string" &&
    Array.isArray(value.snapshots) && value.snapshots.length <= 65_536 && value.snapshots.every(isLocalProfileWitness) &&
    Array.isArray(value.state_snapshots) && value.state_snapshots.length <= 262_144 && value.state_snapshots.every(isLocalStateWitness);
}
function isLocalProfileWitness(value: unknown): boolean {
  return isRecord(value) && typeof value.character_id === "string" && value.character_id.length > 0 &&
    (value.placement === "unspecified" || value.placement === "pre_run_baseline" || value.placement === "in_run") &&
    isNonNegativeInteger(value.event_sequence) && isNonNegativeInteger(value.observed_micros) &&
    (value.game_time_millis === null || Number.isSafeInteger(value.game_time_millis)) && typeof value.payload_sha256 === "string";
}
function isLocalStateWitness(value: unknown): boolean {
  return isLocalProfileWitness(value) && isRecord(value) &&
    (value.related_character_id === undefined || typeof value.related_character_id === "string") &&
    Number.isInteger(value.actor_id) && Number.isInteger(value.entity_uuid) &&
    ["entity_attributes", "temporary_attributes", "resource", "life_wave_trigger_status", "life_wave_trigger_healing", "stat_resonance_status"].includes(String(value.kind)) &&
    typeof value.update_kind === "string";
}
function isLoadoutPhases(value: unknown, durationMicros?: number): value is PublicCombatLoadoutPhase[] {
  return Array.isArray(value) && value.length <= 4_096 && value.every((phase) => isLoadoutPhase(phase, durationMicros));
}
function isLoadoutPhase(value: unknown, durationMicros?: number): value is PublicCombatLoadoutPhase {
  if (!isRecord(value) || typeof value.character_id !== "string" || !value.character_id ||
      !(value.display_name === null || typeof value.display_name === "string") || !isNonNegativeInteger(value.observed_micros) ||
      !isNonNegativeInteger(value.run_elapsed_micros) || (durationMicros !== undefined && value.run_elapsed_micros > durationMicros) ||
      !(value.game_time_millis === null || Number.isSafeInteger(value.game_time_millis)) ||
      !optionalNonNegativeInteger(value.segment_index) || !optionalNonNegativeInteger(value.encounter_index) || !optionalNonNegativeInteger(value.attempt_number) ||
      typeof value.in_active_combat !== "boolean" || !optionalInteger(value.class_id) || !optionalText(value.class_name) ||
      !optionalInteger(value.specialization_id) || !optionalText(value.specialization_name) ||
      !Array.isArray(value.equipped_skill_ids) || value.equipped_skill_ids.length > 256 || !value.equipped_skill_ids.every((id) => typeof id === "string") ||
      !Array.isArray(value.equipped_imagines) || value.equipped_imagines.length > 16 || !value.equipped_imagines.every(isImagineLoadout) ||
      !optionalNonNegativeInteger(value.equipment_count) || !optionalNonNegativeInteger(value.equipped_module_count) ||
      !moduleSnapshotDispositions.has(value.module_snapshot_disposition) || !Array.isArray(value.equipped_modules) ||
      value.equipped_modules.length > 16 || !value.equipped_modules.every(isEquippedModule) || !optionalNonNegativeInteger(value.talent_count)) return false;
  const slots = value.equipped_modules.map((module: PublicCombatEquippedModule) => module.equipped_slot);
  if (!unique(slots)) return false;
  return value.module_snapshot_disposition === "complete"
    ? value.equipped_module_count === value.equipped_modules.length && value.equipped_modules.every((module: PublicCombatEquippedModule) =>
      module.effects.every((effect) => effect.initial_link_points !== null))
    : value.equipped_modules.length === 0;
}
function isImagineLoadout(value: unknown): boolean {
  return isRecord(value) && typeof value.skill_id === "string" && optionalNonNegativeInteger(value.tier) && Number.isSafeInteger(value.equipped_slot);
}
function isEquippedModule(value: unknown): boolean {
  return isRecord(value) && Number.isSafeInteger(value.equipped_slot) && Number.isSafeInteger(value.config_id) &&
    optionalNonNegativeInteger(value.level) && Array.isArray(value.effects) && value.effects.length <= 16 &&
    value.effects.every((effect) => isRecord(effect) && Number.isSafeInteger(effect.effect_id) &&
      (effect.initial_link_points === null || Number.isSafeInteger(effect.initial_link_points)));
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
    value.timeline?.source === "reconciled_canonical_spine" &&
    ((value.schema_version !== 18 && value.schema_version !== 19 && value.schema_version !== 20) ||
      (typeof value.rdps_status === "string" && value.rdps_status.length > 0));
}
function isCompletedReplayRdpsConsistent(value: Record<string, any>): boolean {
  if ((value.schema_version !== 18 && value.schema_version !== 19 && value.schema_version !== 20) || value.attribution_replay_completed !== true) return true;
  if (!Array.isArray(value.reconciled_participants) || !isRecord(value.conservation)) return false;
  const conservationFields = ["raw_damage", "rdps_damage", "contribution_given", "contribution_received"] as const;
  if (!conservationFields.every((field) => isNonNegativeInteger(value.conservation[field]))) return false;

  if (!unique(value.reconciled_participants.map((participant: unknown) =>
    isRecord(participant) ? participant.actor_id : participant))) return false;
  const totals = { raw: 0n, rdps: 0n, given: 0n, received: 0n };
  for (const participant of value.reconciled_participants) {
    if (!isRecord(participant) || ![participant.damage, participant.rdps_damage, participant.contribution_given,
      participant.contribution_received].every(isNonNegativeInteger)) return false;
    const raw = BigInt(participant.damage);
    const rdps = BigInt(participant.rdps_damage);
    const given = BigInt(participant.contribution_given);
    const received = BigInt(participant.contribution_received);
    if (rdps !== raw + given - received) return false;
    totals.raw += raw;
    totals.rdps += rdps;
    totals.given += given;
    totals.received += received;
  }
  if (totals.raw !== BigInt(value.conservation.raw_damage) || totals.rdps !== BigInt(value.conservation.rdps_damage) ||
      totals.given !== BigInt(value.conservation.contribution_given) ||
      totals.received !== BigInt(value.conservation.contribution_received)) return false;

  if (!isRecord(value.timeline) || !Array.isArray(value.timeline.participant_tracks) || !isRecord(value.timeline.omitted)) return false;
  const participantSeries = new Map<number, Array<Record<string, any>>>();
  let hasRdpsBuckets = false;
  let hasRawOnlyBuckets = false;
  for (let index = 0; index < value.reconciled_participants.length; index += 1) {
    const participant = value.reconciled_participants[index];
    if (!isRecord(participant) || !Array.isArray(participant.series)) return false;
    const points = participant.series as Array<Record<string, any>>;
    for (const point of points) {
      if (!isRecord(point) || !isNonNegativeInteger(point.damage)) return false;
      const attribution = [point.rdps_damage, point.rdps_contribution_given, point.rdps_contribution_received];
      const present = attribution.filter((field) => field !== undefined).length;
      if (present === 0) {
        hasRawOnlyBuckets = true;
        continue;
      }
      if (present !== attribution.length || !attribution.every(isNonNegativeInteger)) return false;
      hasRdpsBuckets = true;
      if (BigInt(point.rdps_damage) !== BigInt(point.damage) + BigInt(point.rdps_contribution_given) -
          BigInt(point.rdps_contribution_received)) return false;
    }
    participantSeries.set(index, points);
  }
  // The schema-18 producer either authors every attribution bucket or clears
  // them all. Mixed availability would make range and party conservation
  // claims depend on which row happened to retain attribution evidence.
  if (hasRdpsBuckets && hasRawOnlyBuckets) return false;

  if (!isNonNegativeInteger(value.timeline.omitted.participant_tracks) ||
      !isNonNegativeInteger(value.timeline.omitted.series_points)) return false;
  const trackedIndexes = new Set<number>();
  let retainedPointCount = 0;
  for (const track of value.timeline.participant_tracks) {
    if (!isRecord(track) || !isNonNegativeInteger(track.canonical_participant_index) ||
        !isNonNegativeInteger(track.series_point_count) || trackedIndexes.has(track.canonical_participant_index)) return false;
    const participant = value.reconciled_participants[track.canonical_participant_index];
    if (!isRecord(participant) || participant.actor_id !== track.actor_id || !Array.isArray(participant.series) ||
        track.series_point_count > participant.series.length) return false;
    trackedIndexes.add(track.canonical_participant_index);
    retainedPointCount += track.series_point_count;
  }
  const totalPointCount = [...participantSeries.values()].reduce((sum, points) => sum + points.length, 0);
  const expectedOmittedTracks = value.reconciled_participants.length - trackedIndexes.size;
  const expectedOmittedPoints = totalPointCount - retainedPointCount;
  if (value.timeline.omitted.participant_tracks !== expectedOmittedTracks ||
      value.timeline.omitted.series_points !== expectedOmittedPoints) return false;
  const globallyComplete = expectedOmittedTracks === 0 && expectedOmittedPoints === 0;
  if (!globallyComplete) return true;
  for (const [index, points] of participantSeries) {
    const participant = value.reconciled_participants[index];
    const rawTotal = points.reduce((sum, point) => sum + BigInt(point.damage), 0n);
    if (rawTotal !== BigInt(participant.damage)) return false;
    if (hasRdpsBuckets) {
      const seriesTotals = points.reduce((sum, point) => ({
        rdps: sum.rdps + BigInt(point.rdps_damage),
        given: sum.given + BigInt(point.rdps_contribution_given),
        received: sum.received + BigInt(point.rdps_contribution_received),
      }), { rdps: 0n, given: 0n, received: 0n });
      if (seriesTotals.rdps !== BigInt(participant.rdps_damage) ||
          seriesTotals.given !== BigInt(participant.contribution_given) ||
          seriesTotals.received !== BigInt(participant.contribution_received)) return false;
    }
  }
  if (!hasRdpsBuckets) return true;
  const buckets = new Map<number, { raw: bigint; rdps: bigint; given: bigint; received: bigint }>();
  for (const points of participantSeries.values()) {
    for (const point of points) {
      const bucket = buckets.get(point.second) ?? { raw: 0n, rdps: 0n, given: 0n, received: 0n };
      bucket.raw += BigInt(point.damage);
      bucket.rdps += BigInt(point.rdps_damage);
      bucket.given += BigInt(point.rdps_contribution_given);
      bucket.received += BigInt(point.rdps_contribution_received);
      buckets.set(point.second, bucket);
    }
  }
  return [...buckets.values()].every((bucket) => bucket.raw === bucket.rdps && bucket.given === bucket.received);
}
function isLegacyRunReconciliation(value: Record<string, any>): boolean {
  if (typeof value.reconciliation_id !== "string" || !reconciliationIdPattern.test(value.reconciliation_id) ||
      typeof value.run_group_id !== "string" || !groupIdPattern.test(value.run_group_id) ||
      !isReconciliationStatus(value.status) || !isRecord(value.canonical_spine) ||
      typeof value.canonical_spine.report_id !== "string" || !reportIdPattern.test(value.canonical_spine.report_id) ||
      !Array.isArray(value.reports) || !Array.isArray(value.characters) ||
      !Array.isArray(value.state_replay_blockers) || !value.state_replay_blockers.every((blocker: unknown) => typeof blocker === "string") ||
      !Array.isArray(value.reconciled_participants) || typeof value.attribution_replay_completed !== "boolean" ||
      !(value.swift_vortex_candidate_audit == null || isSwiftVortexCandidateAudit(value.swift_vortex_candidate_audit))) return false;
  return value.reconciled_participants.every((participant: unknown) => isRecord(participant) &&
    typeof participant.actor_id === "string" && Number.isSafeInteger(participant.damage) &&
    (participant.rdps_damage == null || Number.isSafeInteger(participant.rdps_damage)) &&
    (participant.contribution_given == null || Number.isSafeInteger(participant.contribution_given)) &&
    (participant.contribution_received == null || Number.isSafeInteger(participant.contribution_received)) &&
    typeof participant.rdps_incomplete === "boolean");
}
function isSwiftVortexCandidateAudit(value: unknown): value is SwiftVortexCandidateAuditReport {
  return isRecord(value) && value.schema_version === 1 && value.effect_id === 2110060 &&
    isNonNegativeInteger(value.candidate_status_event_count) && isNonNegativeInteger(value.exact_application_transition_count) &&
    isNonNegativeInteger(value.exact_paired_receipt_count) && isNonNegativeInteger(value.distinct_provider_entity_count) &&
    isNonNegativeInteger(value.distinct_recipient_entity_count) && isNonNegativeInteger(value.incomplete_application_count) &&
    isNonNegativeInteger(value.incomplete_removal_count) && isNonNegativeInteger(value.identity_mismatch_event_count) &&
    isRecord(value.blockers) && Object.values(value.blockers).every(isNonNegativeInteger) &&
    (value.magnitude_consensus == null || isSwiftVortexMagnitude(value.magnitude_consensus)) &&
    typeof value.magnitude_gate_satisfied === "boolean" && value.production_attribution_enabled === false &&
    Array.isArray(value.receipts);
}
function isSwiftVortexMagnitude(value: unknown): value is SwiftVortexAppliedMagnitude {
  return isRecord(value) && Number.isSafeInteger(value.haste_basis_points) &&
    Number.isSafeInteger(value.normal_action_speed_basis_points) && Number.isSafeInteger(value.guide_action_speed_basis_points);
}
function isTimelineTrack(value: unknown, participants: readonly unknown[], durationMicros: number, requireResolved: boolean): boolean {
  if (!isRecord(value) || typeof value.actor_id !== "string" || !isNonNegativeInteger(value.canonical_participant_index) ||
      value.canonical_participant_index >= 256 || !isNonNegativeInteger(value.series_point_count) || value.series_point_count > 262_144 ||
      (value.omitted_skill_uses !== undefined && !isNonNegativeInteger(value.omitted_skill_uses))) return false;
  const participant = participants[value.canonical_participant_index];
  if (!requireResolved && participant == null) return true;
  if (!isRecord(participant) || participant.actor_id !== value.actor_id || !Array.isArray(participant.series) ||
      value.series_point_count > participant.series.length) return false;
  const maximumSecond = Math.floor(durationMicros / 1_000_000);
  return participant.series.slice(0, value.series_point_count).every((point) => isRecord(point) && point.second <= maximumSecond);
}
function isDeathMarker(value: unknown, durationMicros: number, timelineSchema: number, participants: readonly unknown[]): boolean {
  if (!isRecord(value) || typeof value.actor_id !== "string" || !isNonNegativeInteger(value.at_micros) ||
      value.at_micros > durationMicros || (value.precision !== "exact_microsecond" && value.precision !== "one_second_bucket")) return false;
  if (timelineSchema < 4) return value.cause === undefined;
  if (value.cause == null) return true;
  return value.precision === "exact_microsecond" && isTimelineDeathCause(value.cause, value.at_micros, timelineSchema, participants);
}
function isTimelineDeathCause(value: unknown, deathMicros: number, timelineSchema: number, participants: readonly unknown[]): value is PublicTimelineDeathCause {
  if (!isRecord(value) || value.evidence !== "packet_terminal_damage" ||
      !isTimelineDeathHit(value.final_hit, deathMicros, timelineSchema, participants) || value.final_hit.at_micros !== deathMicros ||
      !Array.isArray(value.prior_hits) || value.prior_hits.length > 63 ||
      !value.prior_hits.every((hit) => isTimelineDeathHit(hit, deathMicros, timelineSchema, participants)) ||
      typeof value.prior_hits_truncated !== "boolean") return false;
  return value.prior_hits.every((hit, index) => index === 0 || hit.at_micros >= value.prior_hits[index - 1].at_micros);
}
function isTimelineDeathHit(value: unknown, deathMicros: number, timelineSchema: number, participants: readonly unknown[]): value is PublicTimelineDeathHit {
  const earliestMicros = Math.max(0, deathMicros - 2_000_000);
  if (!isRecord(value) || !isNonNegativeInteger(value.at_micros) || value.at_micros < earliestMicros || value.at_micros > deathMicros ||
      !isBoundedIdentifierText(value.source_actor_id) || !optionalBoundedIdentifierText(value.direct_source_actor_id) ||
      !optionalBoundedIdentifierText(value.ability_id) || !optionalBoundedIdentifierText(value.breakdown_ability_id) ||
      !isNonNegativeInteger(value.reported_damage) || !isNonNegativeInteger(value.effective_damage) || typeof value.critical !== "boolean") return false;
  const presentations = [value.source_presentation, value.direct_source_presentation, value.ability_presentation];
  if (timelineSchema <= 4) return presentations.every((presentation) => presentation === undefined);
  return optionalDeathActorPresentation(value.source_presentation, value.source_actor_id, participants) &&
    (value.direct_source_actor_id == null
      ? value.direct_source_presentation === undefined
      : optionalDeathActorPresentation(value.direct_source_presentation, value.direct_source_actor_id, participants)) &&
    optionalDeathAbilityPresentation(value.ability_presentation, value.ability_id, value.breakdown_ability_id);
}
function optionalDeathActorPresentation(value: unknown, actorId: unknown, participants: readonly unknown[]): boolean {
  if (value === undefined) return true;
  if (!isRecord(value) || value.actor_id !== actorId || !isBoundedPresentationName(value.name)) return false;
  if (value.provenance === "exact_build_monster_catalog" ||
      value.provenance === "trusted_monster_catalog_id") return true;
  if (value.provenance !== "public_participant") return false;
  const matchingNames = participants.flatMap((participant) =>
    isRecord(participant) && participant.actor_id === actorId ? [participant.display_name] : []);
  return matchingNames.length === 1 && matchingNames[0] === value.name;
}
function optionalDeathAbilityPresentation(value: unknown, abilityId: unknown, breakdownAbilityId: unknown): boolean {
  return value === undefined || (isRecord(value) && isBoundedIdentifierText(value.ability_id) &&
    (value.ability_id === abilityId || value.ability_id === breakdownAbilityId) && isBoundedPresentationName(value.name) &&
    (value.provenance === "exact_build_action_catalog" ||
      value.provenance === "trusted_action_catalog_id"));
}
function isBoundedPresentationName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 96;
}
function isLoadoutMarker(value: unknown, durationMicros: number): boolean {
  return isRecord(value) && typeof value.character_id === "string" && isNonNegativeInteger(value.at_micros) &&
    value.at_micros <= durationMicros && isNonNegativeInteger(value.phase_index) &&
    typeof value.source_report_id === "string" && reportIdPattern.test(value.source_report_id);
}
function isTimelineSkillUses(value: Record<string, any>, durationMicros: number): boolean {
  if (value.schema_version < 6) return value.skill_uses === undefined && value.clock_anchor === undefined;
  if (!Array.isArray(value.skill_uses) || value.skill_uses.length > 65_536 ||
      !value.skill_uses.every((skill: unknown) => isTimelineSkillUse(skill, durationMicros, value.contributing_report_ids)) ||
      !value.skill_uses.every((skill: PublicTimelineSkillUse) => value.participant_tracks.some((track: unknown) =>
        isRecord(track) && track.actor_id === skill.actor_id))) return false;
  if (value.clock_anchor !== undefined && (!isRecord(value.clock_anchor) ||
      !isNonNegativeInteger(value.clock_anchor.at_micros) || value.clock_anchor.at_micros > durationMicros ||
      !Number.isSafeInteger(value.clock_anchor.game_time_millis) ||
      typeof value.clock_anchor.source_report_id !== "string" || !value.contributing_report_ids.includes(value.clock_anchor.source_report_id) ||
      !isNonNegativeInteger(value.clock_anchor.event_sequence))) return false;
  return isRecord(value.omitted) && isNonNegativeInteger(value.omitted.skill_uses) &&
    value.participant_tracks.every((track: unknown) => isRecord(track) && isNonNegativeInteger(track.omitted_skill_uses));
}
function isTimelineSkillUse(value: unknown, durationMicros: number, reports: readonly unknown[]): value is PublicTimelineSkillUse {
  return isRecord(value) && isBoundedIdentifierText(value.actor_id) && isNonNegativeInteger(value.at_micros) &&
    value.at_micros <= durationMicros && isBoundedIdentifierText(value.action_id) &&
    (value.action_instance_id === undefined || isBoundedIdentifierText(value.action_instance_id)) &&
    value.state === "started" && (value.action_kind === undefined || isBoundedIdentifierText(value.action_kind)) &&
    Array.isArray(value.evidence) && value.evidence.length <= 8 && value.evidence.every((evidence: unknown) =>
      isRecord(evidence) && typeof evidence.source_report_id === "string" && reports.includes(evidence.source_report_id) &&
      isNonNegativeInteger(evidence.event_sequence) &&
      (evidence.game_time_millis === undefined || Number.isSafeInteger(evidence.game_time_millis)) &&
      evidence.kind === "exact_wire_cast_start") && isNonNegativeInteger(value.omitted_evidence);
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
    .every((key) => isNonNegativeInteger(value[key])) &&
    (value.skill_uses === undefined || isNonNegativeInteger(value.skill_uses));
}
function isReconciliationStatus(value: unknown): value is ReconciliationStatus {
  return typeof value === "string" && reconciliationStatuses.has(value as ReconciliationStatus);
}
function isNonNegativeInteger(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0 }
function optionalNonNegativeInteger(value: unknown): boolean { return value === null || isNonNegativeInteger(value) }
function optionalInteger(value: unknown): boolean { return value === null || Number.isSafeInteger(value) }
function optionalText(value: unknown): boolean { return value === null || typeof value === "string" }
function isBoundedIdentifierText(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 96 }
function optionalBoundedIdentifierText(value: unknown): boolean { return value == null || isBoundedIdentifierText(value) }
function isFiniteNumber(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) }
function strictlyAscending(values: readonly number[]): boolean { return values.every((value, index) => index === 0 || value > values[index - 1]!) }
function unique(values: readonly unknown[]): boolean { return new Set(values).size === values.length }
function isRecord(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value) }
