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

  it("requires nullable complete presentation identity fields in schema 2", () => {
    const entry = {
      kind: "nightmare_raid",
      character_id: "3296036",
      display_name: "MarieRose",
      report_id: `rpt_${"a".repeat(32)}`,
      run_index: 0,
      completed_unix_millis: 1_788_000_000_000,
      scene_id: 6500,
      scene_name: "Chaotic Realm",
      difficulty_family: "nightmare",
      difficulty_tier: null,
      total_run_time_micros: 90_000_000,
      deployment_id: "global",
      client_build: "24687926",
      protocol_pack_digest: `sha256:${"a".repeat(64)}`,
    };
    const catalog = { schema_version: 2, total_entries: 1, entries: [entry] };
    expect(isPublicCommunityMilestoneCatalog(catalog)).toBe(true);
    expect(isPublicCommunityMilestoneCatalog({
      ...catalog,
      entries: [{ ...entry, deployment_id: null, client_build: null, protocol_pack_digest: null }],
    })).toBe(true);
    expect(isPublicCommunityMilestoneCatalog({ ...catalog, entries: [{ ...entry, client_build: null }] })).toBe(false);
    const { protocol_pack_digest: _, ...missingDigest } = entry;
    expect(isPublicCommunityMilestoneCatalog({ ...catalog, entries: [missingDigest] })).toBe(false);
  });
});
