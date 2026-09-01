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
  local_profile_witness_character_count?: number;
  attribution_reconciliation_status?: RunAttributionReconciliationStatus;
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

export interface MyParseCatalog {
  schema_version: 1;
  total_entries: number;
  offset: number;
  next_offset?: number | null;
  claimed_character_ids: string[];
  entries: MyParseCatalogEntry[];
}

export interface MyParseCatalogEntry extends PublicParseCatalogEntry {
  visibility: "public" | "unlisted" | "private";
  submitted_by_you: boolean;
  matched_character_ids: string[];
}

export type RunAttributionReconciliationStatus =
  | "single_vantage"
  | "multiple_reports_no_additional_vantage"
  | "cross_vantage_evidence_available"
  | "reconciled";

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
  schema_version: 6 | 7;
  report_id: string;
  visibility: "public" | "unlisted" | "private";
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

export interface PublicRunReconciliation {
  schema_version: 5 | 6 | 7;
  reconciliation_id: string;
  run_group_id: string;
  status: RunAttributionReconciliationStatus;
  canonical_spine: PublicCanonicalSpine;
  reports: PublicReconciliationReport[];
  characters: PublicReconciliationCharacter[];
  participant_character_count: number;
  local_vantage_character_count: number;
  complete_local_vantage_coverage: boolean;
  state_replay_readiness:
    | "single_vantage"
    | "multiple_reports_no_additional_vantage"
    | "blocked"
    | "partial_coverage_ready"
    | "full_coverage_ready";
  state_replay_blockers: string[];
  verified_state_input_sha256?: string;
  reconciled_participants: PublicReconciledParticipant[];
  conservation?: PublicAttributionConservation;
  swift_vortex_candidate_audit?: SwiftVortexCandidateAuditReport;
  attribution_replay_completed: boolean;
}

export interface SwiftVortexAppliedMagnitude {
  haste_basis_points: number;
  normal_action_speed_basis_points: number;
  guide_action_speed_basis_points: number;
}

export interface SwiftVortexCandidateAuditReport {
  schema_version: 1;
  effect_id: 2110060;
  candidate_status_event_count: number;
  exact_application_transition_count: number;
  exact_paired_receipt_count: number;
  distinct_provider_entity_count: number;
  distinct_recipient_entity_count: number;
  incomplete_application_count: number;
  incomplete_removal_count: number;
  identity_mismatch_event_count: number;
  blockers: Record<string, number>;
  magnitude_consensus?: SwiftVortexAppliedMagnitude;
  magnitude_gate_satisfied: boolean;
  production_attribution_enabled: false;
  receipts: unknown[];
}

export interface PublicCanonicalSpine {
  report_id: string;
  run_index: number;
  artifact_sha256: string;
  authoritative_start: boolean;
  authoritative_completion: boolean;
  data_gap_count: number;
  event_count: number;
}

export interface PublicReconciliationReport {
  report_id: string;
  run_index: number;
  artifact_sha256: string;
  protocol_pack_digest: string;
  created_unix_millis: number;
  canonical_spine: boolean;
  local_profile_witnesses: unknown[];
  local_state_witnesses: unknown[];
}

export interface PublicReconciliationCharacter {
  character_id: string;
  participant_report_count: number;
  disposition: string;
  selected_report_id?: string;
  state_witness_count: number;
  game_time_aligned_state_witness_count: number;
  witnesses: unknown[];
}

export interface PublicReconciledParticipant extends PublicParticipant {
  rdps_damage: number | null;
  contribution_given: number | null;
  contribution_received: number | null;
  rdps_incomplete: boolean;
}

export interface PublicAttributionConservation {
  raw_damage: number;
  rdps_damage: number;
  contribution_given: number;
  contribution_received: number;
  conserved: boolean;
}

const reportIdPattern = /^rpt_[a-f0-9]{32}$/;
const runGroupIdPattern = /^run_[a-f0-9]{32}$/;
const reconciliationIdPattern = /^rec_[a-f0-9]{32}$/;

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
    (value.schema_version === 6 || value.schema_version === 7) &&
    typeof value.report_id === "string" &&
    reportIdPattern.test(value.report_id) &&
    (value.visibility === "public" ||
      value.visibility === "unlisted" ||
      value.visibility === "private") &&
    isRecord(value.verification) &&
    ["replayed", "corroborated", "ranked"].includes(String(value.verification.tier)) &&
    Array.isArray(value.runs)
  );
}

export function isMyParseCatalog(value: unknown): value is MyParseCatalog {
  return (
    isRecord(value) &&
    value.schema_version === 1 &&
    nonnegativeSafeInteger(value.total_entries) &&
    nonnegativeSafeInteger(value.offset) &&
    (value.next_offset == null || nonnegativeSafeInteger(value.next_offset)) &&
    Array.isArray(value.claimed_character_ids) &&
    value.claimed_character_ids.every((characterId) => typeof characterId === "string" && characterId.length > 0) &&
    Array.isArray(value.entries) &&
    value.entries.every(isMyParseCatalogEntry)
  );
}

function isMyParseCatalogEntry(value: unknown): value is MyParseCatalogEntry {
  return (
    isRecord(value) &&
    typeof value.report_id === "string" &&
    reportIdPattern.test(value.report_id) &&
    Number.isSafeInteger(value.run_index) &&
    typeof value.region_id === "string" &&
    typeof value.terminal_state === "string" &&
    (value.visibility === "public" ||
      value.visibility === "unlisted" ||
      value.visibility === "private") &&
    typeof value.submitted_by_you === "boolean" &&
    Array.isArray(value.matched_character_ids) &&
    value.matched_character_ids.every(
      (characterId) => typeof characterId === "string" && characterId.length > 0,
    )
  );
}

export function isPublicRunReconciliation(value: unknown): value is PublicRunReconciliation {
  if (
    !isRecord(value) ||
    (value.schema_version !== 5 && value.schema_version !== 6 && value.schema_version !== 7) ||
    typeof value.reconciliation_id !== "string" ||
    !reconciliationIdPattern.test(value.reconciliation_id) ||
    typeof value.run_group_id !== "string" ||
    !runGroupIdPattern.test(value.run_group_id) ||
    !isReconciliationStatus(value.status) ||
    !isRecord(value.canonical_spine) ||
    typeof value.canonical_spine.report_id !== "string" ||
    !reportIdPattern.test(value.canonical_spine.report_id) ||
    !Array.isArray(value.reports) ||
    !Array.isArray(value.characters) ||
    !Array.isArray(value.state_replay_blockers) ||
    !value.state_replay_blockers.every((blocker) => typeof blocker === "string") ||
    !Array.isArray(value.reconciled_participants) ||
    typeof value.attribution_replay_completed !== "boolean" ||
    !(value.swift_vortex_candidate_audit == null ||
      isSwiftVortexCandidateAudit(value.swift_vortex_candidate_audit))
  ) {
    return false;
  }
  return value.reconciled_participants.every(
    (participant) =>
      isRecord(participant) &&
      typeof participant.actor_id === "string" &&
      Number.isSafeInteger(participant.damage) &&
      (participant.rdps_damage == null || Number.isSafeInteger(participant.rdps_damage)) &&
      (participant.contribution_given == null || Number.isSafeInteger(participant.contribution_given)) &&
      (participant.contribution_received == null || Number.isSafeInteger(participant.contribution_received)) &&
      typeof participant.rdps_incomplete === "boolean",
  );
}

function isSwiftVortexCandidateAudit(value: unknown): value is SwiftVortexCandidateAuditReport {
  return (
    isRecord(value) &&
    value.schema_version === 1 &&
    value.effect_id === 2110060 &&
    nonnegativeSafeInteger(value.candidate_status_event_count) &&
    nonnegativeSafeInteger(value.exact_application_transition_count) &&
    nonnegativeSafeInteger(value.exact_paired_receipt_count) &&
    nonnegativeSafeInteger(value.distinct_provider_entity_count) &&
    nonnegativeSafeInteger(value.distinct_recipient_entity_count) &&
    nonnegativeSafeInteger(value.incomplete_application_count) &&
    nonnegativeSafeInteger(value.incomplete_removal_count) &&
    nonnegativeSafeInteger(value.identity_mismatch_event_count) &&
    isRecord(value.blockers) &&
    Object.values(value.blockers).every(nonnegativeSafeInteger) &&
    (value.magnitude_consensus == null || isSwiftVortexMagnitude(value.magnitude_consensus)) &&
    typeof value.magnitude_gate_satisfied === "boolean" &&
    value.production_attribution_enabled === false &&
    Array.isArray(value.receipts)
  );
}

function isSwiftVortexMagnitude(value: unknown): value is SwiftVortexAppliedMagnitude {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.haste_basis_points) &&
    Number.isSafeInteger(value.normal_action_speed_basis_points) &&
    Number.isSafeInteger(value.guide_action_speed_basis_points)
  );
}

function nonnegativeSafeInteger(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

export function validateRunGroupId(value: string): boolean {
  return runGroupIdPattern.test(value);
}

export function validateReportId(value: string): boolean {
  return reportIdPattern.test(value);
}

function isReconciliationStatus(value: unknown): value is RunAttributionReconciliationStatus {
  return [
    "single_vantage",
    "multiple_reports_no_additional_vantage",
    "cross_vantage_evidence_available",
    "reconciled",
  ].includes(String(value));
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
