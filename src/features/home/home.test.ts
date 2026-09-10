// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import type { PublicParseCatalogEntry } from "../../contracts/public-parse";
import type { PublicCommunityMilestone } from "../../contracts/public-activity";
import type { ParsePresentationCatalog } from "../parse-browser/parse-presentation";
import { buildSceneRankings, catalogEntryDifficultyLabel, catalogEntrySceneLabel, milestonePresentationCopy, parseFeedRow } from "./home";
import { regionalSeason } from "./regional-seasons";

const digest = "sha256:4372050d9d549808b229b16de315080f9bac427efe9602dabd9b93c4502dbbae";
const presentation: ParsePresentationCatalog = {
  schema_version: 5, locale: "en-US", deployment_id: "global", game_build: "24687926",
  protocol_pack_digest: digest, source: "test", actions: {}, effects: {}, imagines: {}, modules: {}, module_effects: {},
  scenes: { "1631": "Tina's Mindrealm", "1633": "Chaotic - Tina's Mindrealm", "6500": "Chaotic Realm", "30120": "Stimen Remains - Floor 20", "30121": "Stimen Remains - Floor 21" }, classes: {}, specializations: {},
};

const entry = (sceneId: number, sceneName: string, duration: number): PublicParseCatalogEntry => ({
  report_id: `rpt_${String(sceneId).padStart(32, "0")}`,
  run_index: 0,
  created_unix_millis: duration,
  deployment_id: "global",
  client_build: "24687926",
  protocol_pack_digest: digest,
  region_id: "global",
  activity_id: `scene.${sceneId}`,
  scene_id: sceneId,
  scene_name: sceneName,
  difficulty_family: "challenge",
  difficulty_tier: sceneId % 100,
  terminal_state: "completed",
  total_run_time_micros: duration,
  participant_count: 5,
});

describe("home rankings", () => {
  it("keeps five fastest entries per ordinary scene", () => {
    const rankings = buildSceneRankings(
      [9, 7, 5, 3, 1, 2].map((duration) => entry(1631, "Tina's Mindrealm", duration)),
      presentation,
      7,
    );
    expect(rankings[0]?.entries.map((value) => value.total_run_time_micros)).toEqual([1, 2, 3, 5, 7]);
  });

  it("shows only the highest submitted Stimen floor", () => {
    const rankings = buildSceneRankings([
      entry(30120, "Stimen Remains - Floor 20", 10),
      entry(30121, "Stimen Remains - Floor 21", 12),
      entry(30121, "Stimen Remains - Floor 21", 8),
    ], presentation, 7);
    expect(rankings).toHaveLength(1);
    expect(rankings[0]?.floor).toBe(21);
    expect(rankings[0]?.entries.map((value) => value.total_run_time_micros)).toEqual([8, 12]);
  });

  it("keeps NA and EU together while separating deployments on different seasons", () => {
    const created = Date.parse("2026-09-06T12:00:00Z");
    const northAmerica = { ...entry(1631, "Tina's Mindrealm", 10), created_unix_millis: created, region_id: "north-america" };
    const europe = { ...entry(1631, "Tina's Mindrealm", 11), created_unix_millis: created, region_id: "europe" };
    const china = { ...entry(1631, "Tina's Mindrealm", 12), created_unix_millis: created, deployment_id: "star", region_id: "china" };

    const rankings = buildSceneRankings([northAmerica, europe, china], presentation, 7);

    expect(rankings).toHaveLength(2);
    expect(rankings.find((value) => value.regionLabel === "Global (NA / EU)")?.entries).toHaveLength(2);
    expect(rankings.find((value) => value.regionLabel === "China")?.seasonLabel).toBe("Season 4");
  });

  it("shows only the highest submitted difficulty tier for a scene ranking", () => {
    const master17 = { ...entry(1633, "Tina's Mindrealm", 10), difficulty_family: "master", difficulty_tier: 17 };
    const master20 = { ...entry(1633, "Tina's Mindrealm", 8), difficulty_family: "master", difficulty_tier: 20 };
    const rankings = buildSceneRankings([master17, master20], presentation, 7);
    expect(rankings).toHaveLength(1);
    expect(rankings[0]?.difficultyLabel).toBe("Master 20");
    expect(rankings[0]?.entries).toEqual([master20]);
  });

  it("keeps tierless rankings only when no numbered tier was submitted", () => {
    const hard = { ...entry(1633, "Tina's Mindrealm", 10), difficulty_family: "hard", difficulty_tier: undefined };
    expect(buildSceneRankings([hard], presentation, 7)[0]?.difficultyLabel).toBe("Hard");
    expect(buildSceneRankings([
      hard,
      { ...hard, difficulty_family: "master", difficulty_tier: 20 },
    ], presentation, 7).map((group) => group.difficultyLabel)).toEqual(["Master 20"]);
  });

  it("does not fold legacy or wrong-identity scene ranges into Stimen families", () => {
    const legacyEntries = [
      entry(30120, "Stimen Remains - Floor 20", 10),
      entry(30121, "Stimen Remains - Floor 21", 8),
    ];
    const rankings = buildSceneRankings(legacyEntries, presentation, 6);
    expect(rankings).toHaveLength(2);
    expect(rankings.map((group) => group.label)).toEqual(["Stimen Remains - Floor 20", "Stimen Remains - Floor 21"]);
    expect(rankings.every((group) => group.floor === undefined)).toBe(true);
  });

  it("keeps mixed identities in separate ranking groups and raw-renders unauthorized feeds", () => {
    const exact = entry(1631, "Tina's Mindrealm", 10);
    const wrong = {
      ...entry(1631, "Spoofed Tina Name", 11),
      protocol_pack_digest: `sha256:${"f".repeat(64)}`,
      activity_id: "synthetic.activity",
      difficulty_family: "synthetic-family",
    };
    const rankings = buildSceneRankings([exact, wrong], presentation, 7);
    expect(rankings).toHaveLength(2);
    expect(rankings.map((group) => group.label).sort()).toEqual(["Tina's Mindrealm", "Tina's Mindrealm"]);

    const name = catalogEntrySceneLabel(wrong, presentation, 7);
    expect(name).toBe("Tina's Mindrealm");
    expect(name).not.toContain("Spoofed Tina Name");
    expect(name).not.toContain("synthetic.activity");
  });

  it("renders catalog scene labels across identities while keeping difficulty semantics exact", () => {
    const exact = { ...entry(1633, "Chaotic - Tina's Mindrealm", 10), difficulty_family: "master", difficulty_tier: 17 };
    const authorized = parseFeedRow(exact, presentation, 7);
    expect(authorized).toContain("Chaotic - Tina's Mindrealm");
    expect(authorized).toContain("Master 17 · Submitted by Unknown submitter · 5 players");
    expect(authorized).not.toContain("Scene #1633");
    expect(catalogEntryDifficultyLabel(exact, presentation, 7)).toBe("Master 17");

    const wrongDigest = {
      ...exact,
      protocol_pack_digest: `sha256:${"f".repeat(64)}`,
    };
    expect(parseFeedRow(wrongDigest, presentation, 7)).toContain("Chaotic - Tina's Mindrealm");
    expect(parseFeedRow(wrongDigest, presentation, 7)).toContain("Tier 17");
    expect(parseFeedRow(wrongDigest, presentation, 7)).not.toContain("Master 17");
    expect(parseFeedRow(exact, presentation, 6)).toContain("Chaotic - Tina's Mindrealm");
  });

  it("omits difficulty from a recent parse when no trusted tier or family exists", () => {
    const noDifficulty = { ...entry(12023, "Guild Hunt", 10), difficulty_family: undefined, difficulty_tier: undefined };
    const html = parseFeedRow(noDifficulty, presentation, 7);
    expect(catalogEntryDifficultyLabel(noDifficulty, presentation, 7)).toBeUndefined();
    expect(html).toContain("Submitted by Unknown submitter · 5 players");
    expect(html).not.toContain("Difficulty unresolved");

    const hard = { ...noDifficulty, difficulty_family: "hard" };
    expect(catalogEntryDifficultyLabel(hard, presentation, 7)).toBe("Hard");
    expect(parseFeedRow(hard, presentation, 7)).toContain("Hard · Submitted by Unknown submitter");
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

describe("home milestones", () => {
  const milestone: PublicCommunityMilestone = {
    kind: "nightmare_raid",
    character_id: "3296036",
    display_name: "MarieRose",
    report_id: `rpt_${"a".repeat(32)}`,
    run_index: 0,
    completed_unix_millis: 1,
    scene_id: 6500,
    scene_name: "Chaotic Realm",
    difficulty_family: "nightmare",
    difficulty_tier: 20,
    total_run_time_micros: 90_000_000,
    deployment_id: "global",
    client_build: "24687926",
    protocol_pack_digest: digest,
  };

  it("uses semantic milestone copy only for an exact schema 2 identity", () => {
    expect(milestonePresentationCopy(milestone, presentation, 2)).toEqual({
      activity: "Chaotic Realm",
      achievement: "first Nightmare clear",
    });

    const wrong = { ...milestone, protocol_pack_digest: `sha256:${"f".repeat(64)}` };
    const unavailable = { ...milestone, deployment_id: null, client_build: null, protocol_pack_digest: null };
    for (const [candidate, schema] of [[wrong, 2], [unavailable, 2], [milestone, 1]] as const) {
      const copy = milestonePresentationCopy(candidate, presentation, schema);
      expect(copy).toEqual({ activity: "Chaotic Realm", achievement: "Tier 20 · verified clear" });
      expect(`${copy.activity} ${copy.achievement}`).not.toContain("Nightmare");
    }
  });

  it("renders schema 2 unknown/null producer fallbacks as neutral raw evidence", () => {
    const unavailable: PublicCommunityMilestone = {
      ...milestone,
      kind: "unknown",
      difficulty_family: null,
      difficulty_tier: null,
      deployment_id: null,
      client_build: null,
      protocol_pack_digest: null,
    };
    const copy = milestonePresentationCopy(unavailable, presentation, 2);
    expect(copy).toEqual({ activity: "Chaotic Realm", achievement: "verified clear" });
    expect(JSON.stringify(copy)).not.toContain("Nightmare");

    expect(milestonePresentationCopy({
      ...unavailable,
      deployment_id: "global",
      client_build: "24687926",
      protocol_pack_digest: digest,
    }, presentation, 2)).toEqual({ activity: "Chaotic Realm", achievement: "verified clear" });
  });
});
