import { describe, expect, it } from "vitest";

import { isPublicCommunityMilestoneCatalog } from "./public-activity";

describe("public community milestone contract", () => {
  it("accepts a verified first-clear presentation", () => {
    expect(
      isPublicCommunityMilestoneCatalog({
        schema_version: 1,
        total_entries: 1,
        entries: [
          {
            kind: "master_twenty_dungeon",
            character_id: "3296036",
            display_name: "MarieRose",
            report_id: `rpt_${"a".repeat(32)}`,
            run_index: 0,
            completed_unix_millis: 1_788_000_000_000,
            scene_id: 6500,
            scene_name: "Chaotic Realm",
            difficulty_family: "master",
            difficulty_tier: 20,
            total_run_time_micros: 90_000_000,
          },
        ],
      }),
    ).toBe(true);
  });
});
