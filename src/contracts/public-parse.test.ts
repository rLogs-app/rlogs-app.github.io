import { describe, expect, it } from "vitest";
import {
  isPublicParseCatalog,
  isMyParseCatalog,
  isPublicParseReport,
  isPublicRunReconciliation,
  isUpdateParseVisibilityResponse,
  validateReportId,
  validateRunGroupId,
} from "./public-parse";

describe("public parse contract", () => {
  it("accepts deterministic report identifiers", () => {
    expect(validateReportId(`rpt_${"ab".repeat(16)}`)).toBe(true);
    expect(validateReportId("../../private-log")).toBe(false);
  });

  it("rejects catalog entries without a safe report identifier", () => {
    expect(
      isPublicParseCatalog({
        schema_version: 6,
        entries: [{ report_id: "bad", run_index: 0, region_id: "global", terminal_state: "completed" }],
        facets: {},
      }),
    ).toBe(false);
  });

  it("accepts the current server catalog and report schema versions", () => {
    expect(
      isPublicParseCatalog({
        schema_version: 6,
        total_entries: 0,
        offset: 0,
        next_offset: null,
        entries: [],
        facets: {
          deployments: [],
          regions: [],
          activities: [],
          scenes: [],
          difficulties: [],
          terminal_states: [],
        },
      }),
    ).toBe(true);
    expect(
      isPublicParseReport({
        schema_version: 9,
        report_id: `rpt_${"ab".repeat(16)}`,
        visibility: "unlisted",
        verification: { tier: "replayed" },
        runs: [],
      }),
    ).toBe(true);
  });

  it("accepts a server-authoritative visibility update receipt", () => {
    expect(
      isUpdateParseVisibilityResponse({
        schema_version: 1,
        report_id: `rpt_${"ab".repeat(16)}`,
        visibility: "public",
        share_url: `/parses/?report=rpt_${"ab".repeat(16)}&run=0`,
      }),
    ).toBe(true);
    expect(
      isUpdateParseVisibilityResponse({
        schema_version: 1,
        report_id: "../../another-report",
        visibility: "public",
        share_url: null,
      }),
    ).toBe(false);
  });

  it("accepts authenticated My Parses membership without making it a public catalog", () => {
    expect(
      isMyParseCatalog({
        schema_version: 1,
        total_entries: 1,
        offset: 0,
        next_offset: null,
        claimed_character_ids: ["3296036"],
        entries: [
          {
            report_id: `rpt_${"ab".repeat(16)}`,
            run_index: 0,
            region_id: "global",
            terminal_state: "completed",
            visibility: "unlisted",
            submitted_by_you: false,
            matched_character_ids: ["3296036"],
          },
        ],
      }),
    ).toBe(true);
  });

  it("fails closed on stale server schema versions", () => {
    expect(
      isPublicParseCatalog({
        schema_version: 1,
        total_entries: 0,
        offset: 0,
        next_offset: null,
        entries: [],
        facets: {
          deployments: [],
          regions: [],
          activities: [],
          scenes: [],
          difficulties: [],
          terminal_states: [],
        },
      }),
    ).toBe(false);
  });

  it("accepts a conserved cross-vantage reconciliation product", () => {
    const reportId = `rpt_${"ab".repeat(16)}`;
    const runGroupId = `run_${"cd".repeat(16)}`;
    expect(validateRunGroupId(runGroupId)).toBe(true);
    expect(validateRunGroupId("../../private-run")).toBe(false);
    expect(
      isPublicRunReconciliation({
        schema_version: 10,
        reconciliation_id: `rec_${"ef".repeat(16)}`,
        run_group_id: runGroupId,
        status: "reconciled",
        canonical_spine: { report_id: reportId },
        reports: [],
        characters: [],
        participant_character_count: 2,
        local_vantage_character_count: 2,
        complete_local_vantage_coverage: true,
        state_replay_readiness: "full_coverage_ready",
        state_replay_blockers: [],
        reconciled_participants: [
          {
            actor_id: "11",
            damage: 90,
            rdps_damage: 100,
            contribution_given: 20,
            contribution_received: 10,
            rdps_incomplete: false,
          },
        ],
        attribution_replay_completed: true,
      }),
    ).toBe(true);
  });

  it("rejects reconciliation rows with non-integral conserved damage", () => {
    expect(
      isPublicRunReconciliation({
        schema_version: 5,
        reconciliation_id: `rec_${"ef".repeat(16)}`,
        run_group_id: `run_${"cd".repeat(16)}`,
        status: "reconciled",
        canonical_spine: { report_id: `rpt_${"ab".repeat(16)}` },
        reports: [],
        characters: [],
        state_replay_blockers: [],
        reconciled_participants: [
          {
            actor_id: "11",
            damage: 90,
            rdps_damage: 99.5,
            contribution_given: 10,
            contribution_received: 0,
            rdps_incomplete: false,
          },
        ],
        attribution_replay_completed: true,
      }),
    ).toBe(false);
  });

  it("accepts schema 6 candidate evidence without treating it as production attribution", () => {
    const value = {
      schema_version: 6,
      reconciliation_id: `rec_${"ef".repeat(16)}`,
      run_group_id: `run_${"cd".repeat(16)}`,
      status: "reconciled",
      canonical_spine: { report_id: `rpt_${"ab".repeat(16)}` },
      reports: [],
      characters: [],
      state_replay_blockers: [],
      reconciled_participants: [],
      attribution_replay_completed: true,
      swift_vortex_candidate_audit: {
        schema_version: 1,
        effect_id: 2110060,
        candidate_status_event_count: 8,
        exact_application_transition_count: 4,
        exact_paired_receipt_count: 4,
        distinct_provider_entity_count: 2,
        distinct_recipient_entity_count: 2,
        incomplete_application_count: 0,
        incomplete_removal_count: 0,
        identity_mismatch_event_count: 0,
        blockers: {},
        magnitude_consensus: {
          haste_basis_points: 500,
          normal_action_speed_basis_points: 300,
          guide_action_speed_basis_points: 600,
        },
        magnitude_gate_satisfied: true,
        production_attribution_enabled: false,
        receipts: [],
      },
    };
    expect(isPublicRunReconciliation(value)).toBe(true);
    value.swift_vortex_candidate_audit.production_attribution_enabled = true;
    expect(isPublicRunReconciliation(value)).toBe(false);
  });
});
