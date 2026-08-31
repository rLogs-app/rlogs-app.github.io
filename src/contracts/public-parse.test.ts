import { describe, expect, it } from "vitest";
import { isPublicParseCatalog, isPublicParseReport, validateReportId } from "./public-parse";

describe("public parse contract", () => {
  it("accepts deterministic report identifiers", () => {
    expect(validateReportId(`rpt_${"ab".repeat(16)}`)).toBe(true);
    expect(validateReportId("../../private-log")).toBe(false);
  });

  it("rejects catalog entries without a safe report identifier", () => {
    expect(
      isPublicParseCatalog({
        schema_version: 5,
        entries: [{ report_id: "bad", run_index: 0, region_id: "global", terminal_state: "completed" }],
        facets: {},
      }),
    ).toBe(false);
  });

  it("accepts the current server catalog and report schema versions", () => {
    expect(
      isPublicParseCatalog({
        schema_version: 5,
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
        schema_version: 6,
        report_id: `rpt_${"ab".repeat(16)}`,
        visibility: "unlisted",
        verification: { tier: "replayed" },
        runs: [],
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
});
