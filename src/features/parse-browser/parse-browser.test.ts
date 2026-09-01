import { describe, expect, it } from "vitest";

import type { PublicParseCatalogEntry } from "../../contracts/public-parse";
import { filterSearch } from "./parse-browser";

const parse: PublicParseCatalogEntry = {
  report_id: `rpt_${"a".repeat(32)}`,
  run_index: 0,
  created_unix_millis: 1,
  deployment_id: "global",
  region_id: "north-america",
  activity_id: "scene.30120",
  activity_family_id: "stimen-remains",
  scene_id: 30120,
  scene_name: "Stimen Remains - Floor 20",
  difficulty_family: "challenge",
  terminal_state: "completed",
  participant_count: 5,
};

describe("parse search", () => {
  it("matches every word across scene and region fields", () => {
    expect(filterSearch([parse], "stimen america")).toEqual([parse]);
    expect(filterSearch([parse], "stimen europe")).toEqual([]);
  });

  it("can search exact report IDs", () => {
    expect(filterSearch([parse], parse.report_id)).toEqual([parse]);
  });
});
