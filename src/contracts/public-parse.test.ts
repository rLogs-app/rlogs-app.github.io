import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isMyParseCatalog,
  isPublicParseCatalog,
  isPublicParseReport,
  isPublicRunReconciliation,
  isUpdateParseVisibilityResponse,
  validateReportId,
  validateRunGroupId,
} from "./public-parse";

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`../../public/fixtures/${name}`, import.meta.url), "utf8"));

describe("public parse contract", () => {
  it("accepts deterministic report identifiers", () => {
    expect(validateReportId(`rpt_${"ab".repeat(16)}`)).toBe(true);
    expect(validateReportId("../../private-log")).toBe(false);
    expect(validateRunGroupId(`run_${"cd".repeat(16)}`)).toBe(true);
    expect(validateRunGroupId("../../private-run")).toBe(false);
  });
  it("preserves authenticated private parse contracts", () => {
    const report = fixture("parse-report.v1.json") as any;
    report.visibility = "private";
    expect(isPublicParseReport(report)).toBe(true);

    const catalog = fixture("parse-catalog.v1.json") as any;
    expect(isMyParseCatalog({
      schema_version: 1,
      total_entries: 1,
      offset: 0,
      next_offset: null,
      claimed_character_ids: ["3296036"],
      entries: [{ ...catalog.entries[0], visibility: "private", submitted_by_you: true, matched_character_ids: ["3296036"] }],
    })).toBe(true);
    expect(isUpdateParseVisibilityResponse({
      schema_version: 1,
      report_id: report.report_id,
      visibility: "private",
      share_url: null,
    })).toBe(true);
  });
  it("accepts current catalog, projection, timeline, and reconciliation fixtures", () => {
    expect(isPublicParseCatalog(fixture("parse-catalog.v1.json"))).toBe(true);
    expect(isPublicParseReport(fixture("parse-report.v1.json"))).toBe(true);
    expect(isPublicRunReconciliation(fixture("parse-reconciliation.v1.json"))).toBe(true);
  });
  it("fails closed on stale schema and projection revisions", () => {
    const catalog = fixture("parse-catalog.v1.json") as Record<string, unknown>;
    const report = fixture("parse-report.v1.json") as Record<string, unknown>;
    expect(isPublicParseCatalog({ ...catalog, schema_version: 5 })).toBe(false);
    expect(isPublicParseReport({ ...report, schema_version: 13 })).toBe(false);
    expect(isPublicParseReport({ ...report, projection_revision: 3 })).toBe(false);
  });
  it("allows only the exact projection and timeline compatibility pairs", () => {
    const current = fixture("parse-report.v1.json") as any;
    expect(current.schema_version).toBe(15);
    expect(current.projection_revision).toBe(6);
    expect(current.runs[0].timeline.schema_version).toBe(3);
    expect(isPublicParseReport(current)).toBe(true);
    expect(isPublicParseReport({ ...current, projection_revision: 5 })).toBe(false);

    const legacy = structuredClone(current);
    legacy.schema_version = 14;
    legacy.projection_revision = 5;
    legacy.runs[0].timeline.schema_version = 2;
    delete legacy.runs[0].timeline.rate_clock;
    delete legacy.runs[0].timeline.rate_clock_complete;
    delete legacy.runs[0].timeline.omitted.rate_clock_points;
    expect(isPublicParseReport(legacy)).toBe(true);

    legacy.projection_revision = 4;
    legacy.runs[0].timeline.schema_version = 1;
    legacy.runs[0].participants.forEach((participant: any) => {
      delete participant.rdps_incomplete;
      participant.series.forEach((point: any) => {
        delete point.rdps_damage;
        delete point.rdps_contribution_given;
        delete point.rdps_contribution_received;
      });
    });
    expect(isPublicParseReport(legacy)).toBe(true);
    legacy.runs[0].timeline.schema_version = 2;
    expect(isPublicParseReport(legacy)).toBe(false);
  });
  it("keeps published legacy reports and reconciliations readable without weakening current schemas", () => {
    const legacyReport = fixture("parse-report.v1.json") as any;
    legacyReport.schema_version = 12;
    legacyReport.projection_revision = 1;
    delete legacyReport.runs[0].timeline;
    delete legacyReport.runs[0].combat_loadout_phases;
    legacyReport.runs[0].participants.forEach((participant: any) => {
      delete participant.death_seconds;
      delete participant.series;
    });
    expect(isPublicParseReport(legacyReport)).toBe(true);

    const malformedCurrentReport = structuredClone(legacyReport);
    malformedCurrentReport.schema_version = 14;
    malformedCurrentReport.projection_revision = 4;
    expect(isPublicParseReport(malformedCurrentReport)).toBe(false);

    const legacyReconciliation = fixture("parse-reconciliation.v1.json") as any;
    legacyReconciliation.schema_version = 12;
    delete legacyReconciliation.timeline;
    expect(isPublicRunReconciliation(legacyReconciliation)).toBe(true);

    const malformedCurrentReconciliation = structuredClone(legacyReconciliation);
    malformedCurrentReconciliation.schema_version = 16;
    expect(isPublicRunReconciliation(malformedCurrentReconciliation)).toBe(false);
  });
  it("requires a complete monotonic reducer-authored rate clock for timeline v3", () => {
    const report = fixture("parse-report.v1.json") as any;
    const timeline = report.runs[0].timeline;
    expect(timeline.rate_clock[9]).toEqual({ second: 9, edps_elapsed_micros: 10_000_000, adps_elapsed_micros: 8_000_000 });
    expect(timeline.rate_clock[14]).toEqual({ second: 14, edps_elapsed_micros: 10_000_000, adps_elapsed_micros: 8_000_000 });
    expect(timeline.rate_clock[24]).toEqual({ second: 24, edps_elapsed_micros: 15_000_000, adps_elapsed_micros: 11_000_000 });
    expect(isPublicParseReport(report)).toBe(true);

    timeline.rate_clock[24].adps_elapsed_micros = 99_000_000;
    expect(isPublicParseReport(report)).toBe(false);
  });
  it("accepts an explicitly incomplete empty clock but rejects plausible fallback points", () => {
    const report = fixture("parse-report.v1.json") as any;
    const timeline = report.runs[0].timeline;
    timeline.rate_clock_complete = false;
    timeline.rate_clock = [];
    expect(isPublicParseReport(report)).toBe(true);
    timeline.rate_clock = [{ second: 0, edps_elapsed_micros: 1_000_000, adps_elapsed_micros: 1_000_000 }];
    expect(isPublicParseReport(report)).toBe(false);
  });
  it("validates bounded privacy-safe loadout phases and fail-closed reconciliation selection", () => {
    const report = fixture("parse-report.v1.json") as any;
    expect(report.runs[0].combat_loadout_phases[0].equipped_modules[0]).not.toHaveProperty("instance_id");
    expect(isPublicParseReport(report)).toBe(true);
    delete report.runs[0].combat_loadout_phases;
    expect(isPublicParseReport(report)).toBe(false);

    const reconciliation = fixture("parse-reconciliation.v1.json") as any;
    const conflict = reconciliation.characters.find((character: any) => character.character_id === "c8");
    expect(conflict.combat_loadout_disposition).toBe("multiple_reports_require_ordering");
    expect(conflict.selected_combat_loadout_phases).toEqual([]);
    expect(isPublicRunReconciliation(reconciliation)).toBe(true);
    conflict.selected_combat_loadout_phases = [reconciliation.reports[0].combat_loadout_phases[1]];
    expect(isPublicRunReconciliation(reconciliation)).toBe(false);

    const contradictory = fixture("parse-reconciliation.v1.json") as any;
    const secondC7 = contradictory.reports[1].combat_loadout_phases.find((phase: any) => phase.character_id === "c7");
    secondC7.equipped_modules[0].effects[0].initial_link_points = 19;
    expect(isPublicRunReconciliation(contradictory)).toBe(false);
  });
  it("preserves audit-only Swift Vortex evidence without promoting it", () => {
    const reconciliation = fixture("parse-reconciliation.v1.json") as any;
    reconciliation.swift_vortex_candidate_audit = {
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
      magnitude_consensus: { haste_basis_points: 500, normal_action_speed_basis_points: 300, guide_action_speed_basis_points: 600 },
      magnitude_gate_satisfied: true,
      production_attribution_enabled: false,
      receipts: [],
    };
    expect(isPublicRunReconciliation(reconciliation)).toBe(true);
    reconciliation.swift_vortex_candidate_audit.production_attribution_enabled = true;
    expect(isPublicRunReconciliation(reconciliation)).toBe(false);
  });
  it("rejects partial module facts for missing or invalid snapshots", () => {
    const report = fixture("parse-report.v1.json") as any;
    const phase = report.runs[0].combat_loadout_phases[0];
    phase.module_snapshot_disposition = "invalid";
    expect(isPublicParseReport(report)).toBe(false);
    phase.equipped_modules = [];
    expect(isPublicParseReport(report)).toBe(true);
  });
  it("validates v2 rDPS buckets as complete non-negative safe-integer triples", () => {
    const report = fixture("parse-report.v1.json") as any;
    const point = report.runs[0].participants[0].series[0];
    point.rdps_damage = 1.5;
    expect(isPublicParseReport(report)).toBe(false);
    point.rdps_damage = 1;
    delete point.rdps_contribution_received;
    expect(isPublicParseReport(report)).toBe(false);
    point.rdps_contribution_received = -1;
    expect(isPublicParseReport(report)).toBe(false);
  });
  it("rejects capture-clock data as a run-elapsed timeline", () => {
    const report = fixture("parse-report.v1.json") as any;
    report.runs[0].timeline.time_basis = "capture_observed";
    expect(isPublicParseReport(report)).toBe(false);
  });
  it("rejects participant tracks that cannot index the canonical series", () => {
    const report = fixture("parse-report.v1.json") as any;
    report.runs[0].timeline.participant_tracks[0].canonical_participant_index = 99;
    expect(isPublicParseReport(report)).toBe(false);
    report.runs[0].timeline.participant_tracks[0].canonical_participant_index = 0;
    report.runs[0].timeline.participant_tracks[0].actor_id = "wrong-actor";
    expect(isPublicParseReport(report)).toBe(false);
  });
});
