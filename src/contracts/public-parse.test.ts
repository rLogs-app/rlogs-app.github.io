import { describe, expect, it } from "vitest";
import { isPublicParseCatalog, validateReportId } from "./public-parse";

describe("public parse contract", () => {
  it("accepts deterministic report identifiers", () => {
    expect(validateReportId(`rpt_${"ab".repeat(16)}`)).toBe(true);
    expect(validateReportId("../../private-log")).toBe(false);
  });

  it("rejects catalog entries without a safe report identifier", () => {
    expect(
      isPublicParseCatalog({
        schema_version: 1,
        entries: [{ report_id: "bad", run_index: 0, region_id: "global", terminal_state: "completed" }],
        facets: {},
      }),
    ).toBe(false);
  });
});
