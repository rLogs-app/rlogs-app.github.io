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
    const reconciliation = fixture("parse-reconciliation.v1.json") as any;
    expect(reconciliation.schema_version).toBe(17);
    expect(reconciliation.reports.every((report: any) => report.deployment_id === "global" && report.client_build === "24687926")).toBe(true);
    expect(isPublicRunReconciliation(reconciliation)).toBe(true);
  });
  it("requires exact non-empty runtime identity on every schema 17 report source", () => {
    const missingDeployment = fixture("parse-reconciliation.v1.json") as any;
    delete missingDeployment.reports[0].deployment_id;
    expect(isPublicRunReconciliation(missingDeployment)).toBe(false);

    const emptyDeployment = fixture("parse-reconciliation.v1.json") as any;
    emptyDeployment.reports[0].deployment_id = "";
    expect(isPublicRunReconciliation(emptyDeployment)).toBe(false);

    const missingBuild = fixture("parse-reconciliation.v1.json") as any;
    delete missingBuild.reports[1].client_build;
    expect(isPublicRunReconciliation(missingBuild)).toBe(false);

    const emptyBuild = fixture("parse-reconciliation.v1.json") as any;
    emptyBuild.reports[1].client_build = "";
    expect(isPublicRunReconciliation(emptyBuild)).toBe(false);
  });
  it("keeps schema 15 and 16 reconciliations readable without runtime identity fields", () => {
    const schema16 = fixture("parse-reconciliation.v1.json") as any;
    schema16.schema_version = 16;
    schema16.reports.forEach((report: any) => {
      delete report.deployment_id;
      delete report.client_build;
    });
    expect(isPublicRunReconciliation(schema16)).toBe(true);

    const schema15 = structuredClone(schema16);
    schema15.schema_version = 15;
    schema15.timeline.schema_version = 2;
    delete schema15.timeline.rate_clock;
    delete schema15.timeline.rate_clock_complete;
    delete schema15.timeline.omitted.rate_clock_points;
    expect(isPublicRunReconciliation(schema15)).toBe(true);
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
    expect(isPublicParseReport({ ...current, projection_revision: 7 })).toBe(true);
    expect(isPublicParseReport({ ...current, projection_revision: 8 })).toBe(false);

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
  it("requires a complete current report envelope while keeping revision 6 digest-compatible", () => {
    const revision7 = fixture("parse-report.v1.json") as any;
    revision7.projection_revision = 7;
    expect(isPublicParseReport(revision7)).toBe(true);

    for (const field of ["deployment_id", "client_build"]) {
      const missing = structuredClone(revision7);
      delete missing[field];
      expect(isPublicParseReport(missing), field).toBe(false);
    }
    const missingDigest = structuredClone(revision7);
    delete missingDigest.protocol_pack_digest;
    expect(isPublicParseReport(missingDigest)).toBe(false);
    const emptyDigest = structuredClone(revision7);
    emptyDigest.protocol_pack_digest = "";
    expect(isPublicParseReport(emptyDigest)).toBe(false);
    const malformedDigest = structuredClone(revision7);
    malformedDigest.protocol_pack_digest = "pack";
    expect(isPublicParseReport(malformedDigest)).toBe(false);

    const revision6 = structuredClone(revision7);
    revision6.projection_revision = 6;
    delete revision6.protocol_pack_digest;
    expect(isPublicParseReport(revision6)).toBe(true);
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
  it("accepts a complete rate clock that ends at the last full second before a fractional timeline tail", () => {
    const report = fixture("parse-report.v1.json") as any;
    const timeline = report.runs[0].timeline;
    expect(timeline.duration_micros % 1_000_000).toBeGreaterThan(0);
    expect(timeline.rate_clock).toHaveLength(Math.ceil(timeline.duration_micros / 1_000_000));

    timeline.rate_clock.pop();
    expect(timeline.rate_clock).toHaveLength(Math.floor(timeline.duration_micros / 1_000_000));
    expect(isPublicParseReport(report)).toBe(true);

    timeline.rate_clock.pop();
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
  it("accepts schema 18 replay authority while keeping schema 16 and 17 readable", () => {
    const current = fixture("parse-reconciliation.v1.json") as any;
    current.schema_version = 18;
    current.rdps_status = null;
    expect(isPublicRunReconciliation(current)).toBe(true);

    current.status = "reconciled";
    current.attribution_replay_completed = true;
    const report = fixture("parse-report.v1.json") as any;
    current.reconciled_participants = report.runs[0].participants.map((participant: any) => ({
      ...participant, rdps_damage: participant.damage, contribution_given: 0,
      contribution_received: 0, rdps_incomplete: false,
    }));
    current.timeline.source = "reconciled_canonical_spine";
    const damage = current.reconciled_participants.reduce((sum: number, participant: any) => sum + participant.damage, 0);
    current.conservation = { raw_damage: damage, rdps_damage: damage, contribution_given: 0, contribution_received: 0, conserved: true };
    expect(isPublicRunReconciliation(current)).toBe(false);
    current.rdps_status = "partial_packet_proven_rules";
    expect(isPublicRunReconciliation(current)).toBe(true);

    const missingStatus = structuredClone(current);
    delete missingStatus.rdps_status;
    expect(isPublicRunReconciliation(missingStatus)).toBe(false);

    for (const schemaVersion of [16, 17]) {
      const legacy = fixture("parse-reconciliation.v1.json") as any;
      legacy.schema_version = schemaVersion;
      if (schemaVersion === 16) {
        legacy.reports.forEach((source: any) => {
          delete source.deployment_id;
          delete source.client_build;
        });
      }
      expect(isPublicRunReconciliation(legacy)).toBe(true);
    }
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
