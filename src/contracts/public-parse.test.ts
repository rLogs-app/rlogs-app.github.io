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

function completedSchema18Reconciliation(): any {
  const reconciliation = fixture("parse-reconciliation.v1.json") as any;
  const report = fixture("parse-report.v1.json") as any;
  reconciliation.schema_version = 18;
  reconciliation.status = "reconciled";
  reconciliation.attribution_replay_completed = true;
  reconciliation.rdps_status = "partial_packet_proven_rules";
  reconciliation.reconciled_participants = report.runs[0].participants.map((participant: any) => ({
    ...participant,
    rdps_damage: participant.damage,
    contribution_given: 0,
    contribution_received: 0,
    rdps_incomplete: false,
    series: [{
      second: 0,
      damage: participant.damage,
      effective_healing: 0,
      damage_taken: 0,
      rdps_damage: participant.damage,
      rdps_contribution_given: 0,
      rdps_contribution_received: 0,
    }],
  }));
  reconciliation.timeline.source = "reconciled_canonical_spine";
  reconciliation.timeline.participant_tracks = reconciliation.reconciled_participants.map((participant: any, index: number) => ({
    actor_id: participant.actor_id,
    canonical_participant_index: index,
    series_point_count: 1,
  }));
  reconciliation.timeline.omitted.participant_tracks = 0;
  reconciliation.timeline.omitted.series_points = 0;
  const damage = reconciliation.reconciled_participants.reduce((sum: number, participant: any) => sum + participant.damage, 0);
  reconciliation.conservation = { raw_damage: damage, rdps_damage: damage, contribution_given: 0, contribution_received: 0, conserved: true };
  return reconciliation;
}

function reportWithTimelineV4(): any {
  const report = fixture("parse-report.v1.json") as any;
  report.schema_version = 16;
  report.projection_revision = 8;
  report.runs[0].timeline.schema_version = 4;
  return report;
}

function reportWithTimelineV5(): any {
  const report = reportWithTimelineV4();
  report.schema_version = 17;
  report.projection_revision = 9;
  report.runs[0].timeline.schema_version = 5;
  return report;
}

function reportWithTimelineV6(): any {
  const report = reportWithTimelineV5();
  report.projection_revision = 10;
  const timeline = report.runs[0].timeline;
  timeline.schema_version = 6;
  timeline.clock_anchor = {
    at_micros: 0,
    game_time_millis: 1_000,
    source_report_id: report.report_id,
    event_sequence: 1,
  };
  timeline.participant_tracks.forEach((track: any) => { track.omitted_skill_uses = 0; });
  timeline.skill_uses = [{
    actor_id: timeline.participant_tracks[0].actor_id,
    at_micros: 1_500_000,
    action_id: "2203291",
    action_instance_id: "7",
    state: "started",
    action_kind: "skill",
    evidence: [{
      source_report_id: report.report_id,
      event_sequence: 9,
      game_time_millis: 2_500,
      kind: "exact_wire_cast_start",
    }],
    omitted_evidence: 0,
  }];
  timeline.omitted.skill_uses = 0;
  return report;
}

function packetTerminalDeathCause(atMicros: number): any {
  const hit = (hitMicros: number, sourceActorId: string) => ({
    at_micros: hitMicros,
    source_actor_id: sourceActorId,
    direct_source_actor_id: null,
    ability_id: "2203291",
    breakdown_ability_id: null,
    reported_damage: 100,
    effective_damage: 90,
    critical: true,
  });
  return {
    evidence: "packet_terminal_damage",
    final_hit: hit(atMicros, "12"),
    prior_hits: [hit(atMicros - 2_000_000, "13"), hit(atMicros - 500_000, "14")],
    prior_hits_truncated: false,
  };
}

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

  it("accepts exact schema-v6 skill uses and rejects invented or out-of-run rows", () => {
    const report = reportWithTimelineV6();
    expect(isPublicParseReport(report)).toBe(true);

    for (const mutate of [
      (value: any) => { value.runs[0].timeline.skill_uses[0].actor_id = "not-a-participant"; },
      (value: any) => { value.runs[0].timeline.skill_uses[0].at_micros = value.runs[0].timeline.duration_micros + 1; },
      (value: any) => { value.runs[0].timeline.skill_uses[0].evidence[0].source_report_id = `rpt_${"f".repeat(32)}`; },
      (value: any) => { value.runs[0].timeline.skill_uses[0].evidence[0].kind = "derived_damage_bucket"; },
    ]) {
      const invalid = structuredClone(report);
      mutate(invalid);
      expect(isPublicParseReport(invalid)).toBe(false);
    }
  });

  it("accepts schema-v6 events on the current reconciliation envelope", () => {
    const reconciliation = completedSchema18Reconciliation();
    reconciliation.schema_version = 20;
    reconciliation.timeline.schema_version = 6;
    reconciliation.timeline.clock_anchor = {
      at_micros: 0, game_time_millis: 1_000,
      source_report_id: reconciliation.canonical_spine.report_id, event_sequence: 1,
    };
    reconciliation.timeline.participant_tracks.forEach((track: any) => { track.omitted_skill_uses = 0; });
    reconciliation.timeline.skill_uses = [{
      actor_id: reconciliation.timeline.participant_tracks[0].actor_id,
      at_micros: 500_000, action_id: "2203291", state: "started",
      evidence: [{ source_report_id: reconciliation.canonical_spine.report_id, event_sequence: 2,
        game_time_millis: 1_500, kind: "exact_wire_cast_start" }], omitted_evidence: 0,
    }];
    reconciliation.timeline.omitted.skill_uses = 0;
    expect(isPublicRunReconciliation(reconciliation)).toBe(true);
  });
  it("keeps catalog 6 and My Parses 1 raw-readable while requiring identity on catalog 7 and My Parses 2", () => {
    const legacy = fixture("parse-catalog.v1.json") as any;
    expect(legacy.schema_version).toBe(6);
    expect(isPublicParseCatalog(legacy)).toBe(true);

    const identity = {
      client_build: "24687926",
      protocol_pack_digest: `sha256:${"a".repeat(64)}`,
    };
    const current = { ...legacy, schema_version: 7, entries: legacy.entries.map((entry: any) => ({ ...entry, ...identity })) };
    expect(isPublicParseCatalog(current)).toBe(true);
    expect(isPublicParseCatalog({ ...current, entries: current.entries.map(({ client_build: _, protocol_pack_digest: __, ...entry }: any) => entry) })).toBe(true);
    expect(isPublicParseCatalog({ ...current, entries: current.entries.map((entry: any) => ({ ...entry, client_build: null, protocol_pack_digest: null })) })).toBe(true);
    expect(isPublicParseCatalog({ ...current, entries: current.entries.map((entry: any) => ({ ...entry, protocol_pack_digest: "sha256:nope" })) })).toBe(false);

    const myLegacy = {
      schema_version: 1, total_entries: 1, offset: 0, next_offset: null,
      claimed_character_ids: ["3296036"],
      entries: legacy.entries.map((entry: any) => ({ ...entry, visibility: "private", submitted_by_you: true, matched_character_ids: ["3296036"] })),
    };
    expect(isMyParseCatalog(myLegacy)).toBe(true);
    expect(isMyParseCatalog({ ...myLegacy, schema_version: 2 })).toBe(true);
    expect(isMyParseCatalog({
      ...myLegacy,
      schema_version: 2,
      entries: myLegacy.entries.map((entry: any) => ({ ...entry, client_build: null, protocol_pack_digest: null })),
    })).toBe(true);
    expect(isMyParseCatalog({
      ...myLegacy,
      schema_version: 2,
      entries: myLegacy.entries.map((entry: any) => ({ ...entry, ...identity })),
    })).toBe(true);
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

    const timelineV4 = reportWithTimelineV4();
    expect(isPublicParseReport(timelineV4)).toBe(true);
    expect(isPublicParseReport({ ...timelineV4, schema_version: 15 })).toBe(false);
    expect(isPublicParseReport({ ...timelineV4, projection_revision: 7 })).toBe(false);
    timelineV4.runs[0].timeline.schema_version = 3;
    expect(isPublicParseReport(timelineV4)).toBe(false);

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
  it("accepts optional packet-proven death causes only when the timeline-v4 contract is complete", () => {
    const report = reportWithTimelineV4();
    const marker = report.runs[0].timeline.death_markers[0];
    expect(marker.precision).toBe("one_second_bucket");
    marker.cause = packetTerminalDeathCause(marker.at_micros);
    expect(isPublicParseReport(report)).toBe(false);
    marker.cause = null;
    expect(isPublicParseReport(report)).toBe(true);
    marker.precision = "exact_microsecond";
    expect(isPublicParseReport(report)).toBe(true);
    marker.cause = packetTerminalDeathCause(marker.at_micros);
    expect(isPublicParseReport(report)).toBe(true);

    const legacy = fixture("parse-report.v1.json") as any;
    legacy.runs[0].timeline.death_markers[0].cause = packetTerminalDeathCause(marker.at_micros);
    expect(isPublicParseReport(legacy)).toBe(false);

    const malformedCases = [
      (cause: any) => { cause.evidence = "inferred_damage"; },
      (cause: any) => { delete cause.final_hit.critical; },
      (cause: any) => { cause.final_hit.at_micros -= 1; },
      (cause: any) => { cause.final_hit.source_actor_id = ""; },
      (cause: any) => { cause.final_hit.source_actor_id = "1".repeat(97); },
      (cause: any) => { cause.final_hit.direct_source_actor_id = 12; },
      (cause: any) => { cause.final_hit.ability_id = "1".repeat(97); },
      (cause: any) => { cause.final_hit.reported_damage = 1.5; },
      (cause: any) => { cause.final_hit.effective_damage = -1; },
      (cause: any) => { cause.prior_hits = "not-a-list"; },
      (cause: any) => { cause.prior_hits[0].at_micros -= 1; },
      (cause: any) => { cause.prior_hits.reverse(); },
      (cause: any) => { cause.prior_hits = Array.from({ length: 64 }, () => cause.prior_hits[0]); },
      (cause: any) => { delete cause.prior_hits_truncated; },
    ];
    for (const mutate of malformedCases) {
      const malformed = reportWithTimelineV4();
      const malformedMarker = malformed.runs[0].timeline.death_markers[0];
      malformedMarker.cause = packetTerminalDeathCause(malformedMarker.at_micros);
      mutate(malformedMarker.cause);
      expect(isPublicParseReport(malformed)).toBe(false);
    }
  });
  it("accepts only ID-bound allowlisted death-hit presentation on timeline 5", () => {
    const report = reportWithTimelineV5();
    const marker = report.runs[0].timeline.death_markers[0];
    marker.precision = "exact_microsecond";
    marker.cause = packetTerminalDeathCause(marker.at_micros);
    const hit = marker.cause.final_hit;
    const sourceParticipant = report.runs[0].participants[0];
    const directParticipant = report.runs[0].participants[1];
    hit.source_actor_id = sourceParticipant.actor_id;
    hit.direct_source_actor_id = directParticipant.actor_id;
    hit.breakdown_ability_id = "2203292";
    hit.source_presentation = { actor_id: sourceParticipant.actor_id, name: sourceParticipant.display_name, provenance: "public_participant" };
    hit.direct_source_presentation = { actor_id: directParticipant.actor_id, name: directParticipant.display_name, provenance: "public_participant" };
    hit.ability_presentation = { ability_id: "2203292", name: "Published action", provenance: "exact_build_action_catalog" };
    expect(isPublicParseReport(report)).toBe(true);

    const trustedCatalogLabels = structuredClone(report);
    const trustedHit = trustedCatalogLabels.runs[0].timeline.death_markers[0].cause.final_hit;
    trustedHit.source_actor_id = "monster-1342";
    trustedHit.source_presentation = {
      actor_id: "monster-1342",
      name: "Tina - Void Reverie",
      provenance: "trusted_monster_catalog_id",
    };
    trustedHit.ability_presentation.provenance = "trusted_action_catalog_id";
    expect(isPublicParseReport(trustedCatalogLabels)).toBe(true);

    const invalidCases = [
      (candidate: any) => { candidate.source_presentation.actor_id = "someone-else"; },
      (candidate: any) => { candidate.source_presentation.name = "x".repeat(97); },
      (candidate: any) => { candidate.source_presentation.provenance = "untrusted_projection"; },
      (candidate: any) => { candidate.source_presentation.name = "Mismatched participant name"; },
      (candidate: any) => { candidate.direct_source_presentation.actor_id = sourceParticipant.actor_id; },
      (candidate: any) => { candidate.direct_source_presentation.provenance = "exact_build_action_catalog"; },
      (candidate: any) => { candidate.ability_presentation.ability_id = "different-ability"; },
      (candidate: any) => { candidate.ability_presentation.provenance = "public_participant"; },
      (candidate: any) => { candidate.source_presentation.provenance = "trusted_action_catalog_id"; },
      (candidate: any) => { candidate.ability_presentation.provenance = "trusted_monster_catalog_id"; },
    ];
    for (const mutate of invalidCases) {
      const malformed = structuredClone(report);
      mutate(malformed.runs[0].timeline.death_markers[0].cause.final_hit);
      expect(isPublicParseReport(malformed)).toBe(false);
    }

    const unmatched = structuredClone(report);
    const unmatchedHit = unmatched.runs[0].timeline.death_markers[0].cause.final_hit;
    unmatchedHit.source_actor_id = "unmatched-actor";
    unmatchedHit.source_presentation.actor_id = "unmatched-actor";
    expect(isPublicParseReport(unmatched)).toBe(false);

    const duplicate = structuredClone(report);
    duplicate.runs[0].participants.push({
      ...structuredClone(duplicate.runs[0].participants[0]),
      display_name: duplicate.runs[0].participants[0].display_name,
    });
    expect(isPublicParseReport(duplicate)).toBe(false);

    const noDirectSource = structuredClone(report);
    const noDirectHit = noDirectSource.runs[0].timeline.death_markers[0].cause.final_hit;
    noDirectHit.direct_source_actor_id = null;
    expect(isPublicParseReport(noDirectSource)).toBe(false);

    const timelineV4 = structuredClone(report);
    timelineV4.schema_version = 16;
    timelineV4.projection_revision = 8;
    timelineV4.runs[0].timeline.schema_version = 4;
    expect(isPublicParseReport(timelineV4)).toBe(false);
    for (const candidate of [marker.cause.final_hit, ...marker.cause.prior_hits]) {
      delete candidate.source_presentation;
      delete candidate.direct_source_presentation;
      delete candidate.ability_presentation;
    }
    expect(isPublicParseReport(report)).toBe(true);
  });
  it("accepts only reconciliation 19 with timeline 4 while retaining reconciliation 18 with timeline 3", () => {
    const legacy = fixture("parse-reconciliation.v1.json") as any;
    legacy.schema_version = 18;
    legacy.rdps_status = null;
    expect(isPublicRunReconciliation(legacy)).toBe(true);

    const current = structuredClone(legacy);
    current.schema_version = 19;
    current.timeline.schema_version = 4;
    expect(isPublicRunReconciliation(current)).toBe(true);
    expect(isPublicRunReconciliation({ ...current, schema_version: 18 })).toBe(false);
    current.timeline.schema_version = 3;
    expect(isPublicRunReconciliation(current)).toBe(false);

    const next = structuredClone(legacy);
    next.schema_version = 20;
    next.timeline.schema_version = 5;
    expect(isPublicRunReconciliation(next)).toBe(true);
    expect(isPublicRunReconciliation({ ...next, schema_version: 19 })).toBe(false);
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

    const completed = completedSchema18Reconciliation();
    delete completed.rdps_status;
    expect(isPublicRunReconciliation(completed)).toBe(false);
    completed.rdps_status = "partial_packet_proven_rules";
    expect(isPublicRunReconciliation(completed)).toBe(true);

    const missingStatus = structuredClone(completed);
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
  it("rejects contradictory completed schema 18 aggregate rDPS evidence", () => {
    const validTransfer = completedSchema18Reconciliation();
    validTransfer.reconciled_participants[0].rdps_damage += 1;
    validTransfer.reconciled_participants[0].contribution_given = 1;
    validTransfer.reconciled_participants[0].series[0].rdps_damage += 1;
    validTransfer.reconciled_participants[0].series[0].rdps_contribution_given = 1;
    validTransfer.reconciled_participants[1].rdps_damage -= 1;
    validTransfer.reconciled_participants[1].contribution_received = 1;
    validTransfer.reconciled_participants[1].series[0].rdps_damage -= 1;
    validTransfer.reconciled_participants[1].series[0].rdps_contribution_received = 1;
    validTransfer.conservation.contribution_given = 1;
    validTransfer.conservation.contribution_received = 1;
    expect(isPublicRunReconciliation(validTransfer)).toBe(true);

    for (const [field, value] of [["rdps_damage", null], ["contribution_given", -1], ["contribution_received", 1.5]] as const) {
      const malformed = completedSchema18Reconciliation();
      malformed.reconciled_participants[0][field] = value;
      expect(isPublicRunReconciliation(malformed), `${field}=${value}`).toBe(false);
    }

    const brokenFormula = completedSchema18Reconciliation();
    brokenFormula.reconciled_participants[0].rdps_damage += 1;
    expect(isPublicRunReconciliation(brokenFormula)).toBe(false);

    const falseTotals = completedSchema18Reconciliation();
    falseTotals.conservation.raw_damage += 1;
    falseTotals.conservation.rdps_damage += 1;
    expect(isPublicRunReconciliation(falseTotals)).toBe(false);

    const falseTransfers = completedSchema18Reconciliation();
    falseTransfers.conservation.contribution_given = 1;
    falseTransfers.conservation.contribution_received = 1;
    expect(isPublicRunReconciliation(falseTransfers)).toBe(false);

    const duplicateActor = completedSchema18Reconciliation();
    duplicateActor.reconciled_participants[1].actor_id = duplicateActor.reconciled_participants[0].actor_id;
    duplicateActor.timeline.participant_tracks[1].actor_id = duplicateActor.timeline.participant_tracks[0].actor_id;
    expect(isPublicRunReconciliation(duplicateActor)).toBe(false);
  });
  it("validates complete schema 18 rDPS series without rejecting unavailable or truncated buckets", () => {
    const brokenBucketFormula = completedSchema18Reconciliation();
    brokenBucketFormula.reconciled_participants[0].series[0].rdps_damage += 1;
    expect(isPublicRunReconciliation(brokenBucketFormula)).toBe(false);

    const wrongSeriesTotal = completedSchema18Reconciliation();
    wrongSeriesTotal.reconciled_participants[0].series[0].damage -= 1;
    wrongSeriesTotal.reconciled_participants[0].series[0].rdps_damage -= 1;
    expect(isPublicRunReconciliation(wrongSeriesTotal)).toBe(false);

    const bucketLeak = completedSchema18Reconciliation();
    const participant = bucketLeak.reconciled_participants[0];
    participant.contribution_given = 1;
    participant.contribution_received = 1;
    participant.series = [
      { ...participant.series[0], rdps_damage: participant.damage - 1, rdps_contribution_given: 0, rdps_contribution_received: 1 },
      { second: 1, damage: 0, effective_healing: 0, damage_taken: 0, rdps_damage: 1, rdps_contribution_given: 1, rdps_contribution_received: 0 },
    ];
    bucketLeak.timeline.participant_tracks[0].series_point_count = 2;
    bucketLeak.conservation.contribution_given = 1;
    bucketLeak.conservation.contribution_received = 1;
    expect(isPublicRunReconciliation(bucketLeak)).toBe(false);

    const unavailable = completedSchema18Reconciliation();
    unavailable.reconciled_participants.forEach((row: any) => row.series.forEach((point: any) => {
      delete point.rdps_damage;
      delete point.rdps_contribution_given;
      delete point.rdps_contribution_received;
    }));
    expect(isPublicRunReconciliation(unavailable)).toBe(true);

    const unavailableWrongRawTotal = structuredClone(unavailable);
    unavailableWrongRawTotal.reconciled_participants[0].series[0].damage -= 1;
    expect(isPublicRunReconciliation(unavailableWrongRawTotal)).toBe(false);

    const mixed = completedSchema18Reconciliation();
    delete mixed.reconciled_participants[0].series[0].rdps_damage;
    delete mixed.reconciled_participants[0].series[0].rdps_contribution_given;
    delete mixed.reconciled_participants[0].series[0].rdps_contribution_received;
    expect(isPublicRunReconciliation(mixed)).toBe(false);

    const truncated = completedSchema18Reconciliation();
    truncated.timeline.participant_tracks[0].series_point_count = 0;
    truncated.timeline.omitted.series_points = 1;
    expect(isPublicRunReconciliation(truncated)).toBe(true);

    const inventedOmission = completedSchema18Reconciliation();
    inventedOmission.timeline.omitted.series_points = 1;
    expect(isPublicRunReconciliation(inventedOmission)).toBe(false);

    const hiddenOmission = completedSchema18Reconciliation();
    hiddenOmission.timeline.participant_tracks[0].series_point_count = 0;
    expect(isPublicRunReconciliation(hiddenOmission)).toBe(false);

    const malformedUnretainedSuffix = structuredClone(truncated);
    malformedUnretainedSuffix.reconciled_participants[0].series[0].rdps_damage += 1;
    expect(isPublicRunReconciliation(malformedUnretainedSuffix)).toBe(false);
  });
  it("does not retroactively impose schema 18 arithmetic on completed schema 17 payloads", () => {
    const legacy = completedSchema18Reconciliation();
    legacy.schema_version = 17;
    legacy.reconciled_participants[0].rdps_damage += 1;
    expect(isPublicRunReconciliation(legacy)).toBe(true);
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
