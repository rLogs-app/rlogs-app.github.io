import { describe, expect, it } from "vitest";

import type { PublicParseCatalogEntry } from "../../contracts/public-parse";
import { buildSceneRankings } from "./home";
import { regionalSeason } from "./regional-seasons";

const entry = (sceneId: number, sceneName: string, duration: number): PublicParseCatalogEntry => ({
  report_id: `rpt_${String(sceneId).padStart(32, "0")}`,
  run_index: 0,
  created_unix_millis: duration,
  deployment_id: "global",
  region_id: "global",
  activity_id: `scene.${sceneId}`,
  scene_id: sceneId,
  scene_name: sceneName,
  terminal_state: "completed",
  total_run_time_micros: duration,
  participant_count: 5,
});

describe("home rankings", () => {
  it("keeps five fastest entries per ordinary scene", () => {
    const rankings = buildSceneRankings(
      [9, 7, 5, 3, 1, 2].map((duration) => entry(1631, "Tina's Mindrealm", duration)),
    );
    expect(rankings[0]?.entries.map((value) => value.total_run_time_micros)).toEqual([1, 2, 3, 5, 7]);
  });

  it("shows only the highest submitted Stimen floor", () => {
    const rankings = buildSceneRankings([
      entry(30120, "Stimen Remains - Floor 20", 10),
      entry(30121, "Stimen Remains - Floor 21", 12),
      entry(30121, "Stimen Remains - Floor 21", 8),
    ]);
    expect(rankings).toHaveLength(1);
    expect(rankings[0]?.floor).toBe(21);
    expect(rankings[0]?.entries.map((value) => value.total_run_time_micros)).toEqual([8, 12]);
  });

  it("keeps NA and EU together while separating deployments on different seasons", () => {
    const created = Date.parse("2026-09-06T12:00:00Z");
    const northAmerica = { ...entry(1631, "Tina's Mindrealm", 10), created_unix_millis: created, region_id: "north-america" };
    const europe = { ...entry(1631, "Tina's Mindrealm", 11), created_unix_millis: created, region_id: "europe" };
    const china = { ...entry(1631, "Tina's Mindrealm", 12), created_unix_millis: created, deployment_id: "star", region_id: "china" };

    const rankings = buildSceneRankings([northAmerica, europe, china]);

    expect(rankings).toHaveLength(2);
    expect(rankings.find((value) => value.regionLabel === "Global (NA / EU)")?.entries).toHaveLength(2);
    expect(rankings.find((value) => value.regionLabel === "China")?.seasonLabel).toBe("Season 4");
  });
});

describe("regional seasons", () => {
  it("uses the published regional transition instants", () => {
    expect(regionalSeason("global", "north-america", Date.parse("2026-10-08T06:59:59Z")).seasonId).toBe(3);
    expect(regionalSeason("global", "europe", Date.parse("2026-10-08T07:00:00Z")).seasonId).toBe(4);
    expect(regionalSeason("star", "china", Date.parse("2026-09-06T00:00:00Z")).seasonId).toBe(4);
    expect(regionalSeason("starsea-steam", "unknown", Date.parse("2026-09-06T00:00:00Z")).seasonId).toBe(3);
  });
});
