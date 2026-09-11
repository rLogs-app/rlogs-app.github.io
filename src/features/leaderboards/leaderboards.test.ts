// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ParsePresentationCatalog } from "../parse-browser/parse-presentation";
import * as parsePresentation from "../parse-browser/parse-presentation";
import {
  competitionRank,
  formatClearTime,
  isProfileLeaderboard,
  isTrainingDummyLeaderboard,
  mountLeaderboards,
  seasonThreeActivities,
  trainingClassFilters,
} from "./leaderboards";

const presentation: ParsePresentationCatalog = {
  schema_version: 5,
  locale: "en-US",
  deployment_id: "global",
  game_build: "24687926",
  protocol_pack_digest: "sha256:test",
  source: "test",
  actions: {},
  effects: {},
  imagines: {},
  modules: {},
  module_effects: {},
  scenes: {
    "1150": "Chaotic - Towering Ruin",
    "1633": "Chaotic - Tina's Mindrealm",
    "6515": "Cursed Radiant Tomb",
    "6525": "Chaotic - Mech Facility",
    "6545": "Chaotic - Mistveil Hunting Ground",
    "6565": "Chaotic - Sea-Ringed Reef",
  },
  classes: { "1": "Stormblade", "11": "Marksman" },
  specializations: {
    "101": "Iaido Slash Spec",
    "102": "Moonstrike Spec",
    "116": "Wildpack Spec",
    "117": "Falconry Spec",
  },
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("profile leaderboards", () => {
  it("uses all six packet-proven Season 3 Master activities", () => {
    expect(seasonThreeActivities.map(([id]) => id)).toEqual([1150, 1633, 6515, 6525, 6545, 6565]);
  });

  it("defines all playable classes and their two specializations", () => {
    expect(trainingClassFilters).toHaveLength(9);
    expect(trainingClassFilters.every((entry) => entry.specializations.length === 2)).toBe(true);
  });

  it("uses the trusted presentation catalog for filter labels without changing filter ids", async () => {
    installLeaderboardDom();
    vi.spyOn(parsePresentation, "loadParsePresentation").mockResolvedValue(presentation);

    await mountLeaderboards();

    expect(optionLabels("leaderboard-activity")).toContainEqual(["1633", "Chaotic - Tina's Mindrealm"]);
    expect(optionLabels("leaderboard-activity").map(([value]) => Number(value))).toEqual(
      seasonThreeActivities.map(([id]) => id),
    );
    expect(optionLabels("training-dummy-class")).toContainEqual(["11", "Marksman"]);
    expect(optionLabels("training-dummy-class").slice(1).map(([value]) => Number(value))).toEqual(
      trainingClassFilters.map(({ id }) => id),
    );
    const trainingClass = document.querySelector<HTMLSelectElement>("#training-dummy-class")!;
    trainingClass.value = "";
    trainingClass.dispatchEvent(new Event("change"));
    expect(optionLabels("training-dummy-specialization")).toContainEqual([
      "101",
      "Stormblade · Iaido Slash Spec",
    ]);
    expect(optionLabels("training-dummy-specialization").slice(1).map(([value]) => Number(value))).toEqual(
      trainingClassFilters.flatMap(({ specializations }) => specializations.map(([id]) => id)),
    );

    trainingClass.value = "11";
    trainingClass.dispatchEvent(new Event("change"));
    expect(optionLabels("training-dummy-specialization")).toContainEqual(["116", "Wildpack Spec"]);
  });

  it("keeps the existing labels when the trusted presentation catalog cannot load", async () => {
    installLeaderboardDom();
    vi.spyOn(parsePresentation, "loadParsePresentation").mockRejectedValue(new Error("offline"));

    await mountLeaderboards();

    expect(optionLabels("leaderboard-activity")).toContainEqual(["1633", "Void - Tina's Mindrealm"]);
    expect(optionLabels("training-dummy-class")).toContainEqual(["11", "Marksman"]);
    expect(optionLabels("training-dummy-specialization")).toContainEqual(["101", "Iaido Slash"]);
  });

  it("keeps whitelisted English labels when a valid presentation catalog is sparse", async () => {
    installLeaderboardDom();
    vi.spyOn(parsePresentation, "loadParsePresentation").mockResolvedValue({
      ...presentation,
      scenes: {},
      classes: {},
      specializations: {},
    });

    await mountLeaderboards();

    expect(optionLabels("leaderboard-activity")).toContainEqual(["1633", "Void - Tina's Mindrealm"]);
    expect(optionLabels("training-dummy-class")).toContainEqual(["11", "Marksman"]);
    expect(optionLabels("training-dummy-specialization")).toContainEqual(["101", "Iaido Slash"]);
    expect(optionLabels("leaderboard-activity").map(([value]) => Number(value))).toEqual(
      seasonThreeActivities.map(([id]) => id),
    );
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

function installLeaderboardDom(): void {
  vi.stubGlobal("Option", function optionConstructor(text = "", value = "") {
    const option = document.createElement("option");
    option.text = text;
    option.value = value;
    return option;
  });
  document.body.innerHTML = `
    <select id="leaderboard-season"><option value="3">Season 3</option></select>
    <select id="leaderboard-region"><option value="">All regions</option></select>
    <select id="leaderboard-activity"></select>
    <select id="leaderboard-tier"></select>
    <select id="training-dummy-season"><option value="3">Season 3</option></select>
    <select id="training-dummy-region"><option value="">All regions</option></select>
    <select id="training-dummy-class"><option value="">All classes</option></select>
    <select id="training-dummy-specialization"></select>
    <div id="leaderboard-status"></div>
    <ol id="master-score-ranking"></ol>
    <ol id="master-time-ranking"></ol>
    <div id="training-dummy-status"></div>
    <ol id="training-dummy-ranking"></ol>
  `;
}

function optionLabels(id: string): Array<[string, string]> {
  const select = document.querySelector<HTMLSelectElement>(`#${id}`)!;
  return [...select.options].map((option) => [option.value, option.text]);
}
