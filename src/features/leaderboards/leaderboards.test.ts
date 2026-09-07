import { describe, expect, it } from "vitest";
import { competitionRank, formatClearTime, isProfileLeaderboard, seasonThreeActivities } from "./leaderboards";

describe("profile leaderboards", () => {
  it("uses all six packet-proven Season 3 Master activities", () => {
    expect(seasonThreeActivities.map(([id]) => id)).toEqual([1150, 1633, 6515, 6525, 6545, 6565]);
  });

  it("formats the game's recorded pass time in minutes and seconds", () => {
    expect(formatClearTime(329)).toBe("5:29");
  });

  it("gives equal profile values the same competition rank", () => {
    const values = [4066, 4066, 3931, 2350];
    expect(values.map((_, index) => competitionRank(values, index))).toEqual([1, 1, 3, 4]);
  });

  it("accepts a compact indexed leaderboard response", () => {
    expect(isProfileLeaderboard({
      schema_version: 1,
      season_id: 3,
      region_id: "north-america",
      activity_id: 6545,
      tier: 20,
      master_scores: [{
        profile_id: "prf_a", character_id: "3296036", display_name: "MarieRose",
        deployment_id: "global", region_id: "north-america", realm_id: null,
        master_score: 3931, observed_unix_millis: 1,
      }],
      dungeon_times: [{
        profile_id: "prf_a", character_id: "3296036", display_name: "MarieRose",
        deployment_id: "global", region_id: "north-america", realm_id: null,
        activity_id: 6545, tier: 20, score: 700, pass_time_seconds: 329,
        completion_count: 12, observed_unix_millis: 1,
      }],
    })).toBe(true);
  });
});
