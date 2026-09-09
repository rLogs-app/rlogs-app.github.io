import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isPublicParseCatalog, isPublicParseReport, isPublicRunReconciliation, validateReportId } from "./public-parse";

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`../../public/fixtures/${name}`, import.meta.url), "utf8"));

describe("public parse contract", () => {
  it("accepts deterministic report identifiers", () => {
    expect(validateReportId(`rpt_${"ab".repeat(16)}`)).toBe(true);
    expect(validateReportId("../../private-log")).toBe(false);
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
    expect(current.projection_revision).toBe(5);
    expect(current.runs[0].timeline.schema_version).toBe(2);
    expect(isPublicParseReport(current)).toBe(true);
    expect(isPublicParseReport({ ...current, projection_revision: 4 })).toBe(false);

    const legacy = structuredClone(current);
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
