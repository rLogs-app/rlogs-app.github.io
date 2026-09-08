import { describe, expect, it } from "vitest";
import {
  competitionRank,
  formatClearTime,
  isProfileLeaderboard,
  isTrainingDummyLeaderboard,
  seasonThreeActivities,
  trainingClassFilters,
} from "./leaderboards";

describe("profile leaderboards", () => {
  it("uses all six packet-proven Season 3 Master activities", () => {
    expect(seasonThreeActivities.map(([id]) => id)).toEqual([1150, 1633, 6515, 6525, 6545, 6565]);
  });

  it("defines all playable classes and their two specializations", () => {
    expect(trainingClassFilters).toHaveLength(9);
    expect(trainingClassFilters.every((entry) => entry.specializations.length === 2)).toBe(true);
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

  it("accepts an exact packet-verified three-minute target-dummy result", () => {
    expect(isTrainingDummyLeaderboard({
      schema_version: 1,
      season_id: 3,
      region_id: "north-america",
      class_id: 11,
      specialization_id: 117,
      duration_micros: 180_000_000,
      results: [{
        result_id: "dummy-result",
        character_id: "3296036",
        display_name: "MarieRose",
        deployment_id: "global",
        region_id: "north-america",
        realm_id: null,
        world_id: null,
        season_id: 3,
        class_id: 11,
        specialization_id: 117,
        target_monster_id: 115,
        duration_micros: 180_000_000,
        total_damage: 300_000_000,
        dps: 1_666_666.7,
        created_unix_millis: 1,
        verified_unix_millis: 2,
      }],
    })).toBe(true);
  });

  it("rejects a wrong target or duration", () => {
    const empty = {
      schema_version: 1,
      season_id: 3,
      region_id: null,
      class_id: null,
      specialization_id: null,
      duration_micros: 180_000_000,
      results: [],
    };
    expect(isTrainingDummyLeaderboard({ ...empty, duration_micros: 179_000_000 })).toBe(false);
    expect(isTrainingDummyLeaderboard({
      ...empty,
      results: [{
        result_id: "wrong-target",
        character_id: "3296036",
        display_name: "MarieRose",
        deployment_id: "global",
        region_id: "north-america",
        realm_id: null,
        world_id: null,
        season_id: 3,
        class_id: 11,
        specialization_id: 117,
        target_monster_id: 999,
        duration_micros: 180_000_000,
        total_damage: 1,
        dps: 1,
        created_unix_millis: 1,
        verified_unix_millis: 1,
      }],
    })).toBe(false);
  });
});
