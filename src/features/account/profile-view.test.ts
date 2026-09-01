import { describe, expect, it } from "vitest";

import {
  battleImagineOwnershipFacts,
  formatFightAttributeValue,
  interpolateEquipmentAttributeValue,
  materializeEquipmentBuffDescription,
  orderedMedalEntries,
  photoWallIdentityCount,
  resolvePublishedPhotoUrl,
  resolvedMasterDungeonCount,
  talentPresentationFacts,
} from "./profile-view";

describe("Battle Imagine ownership presentation", () => {
  it("shows tier and equipped slot without the irrelevant character level", () => {
    expect(battleImagineOwnershipFacts(5, 7)).toBe("Tier 5 · Equipped · Slot 7");
    expect(battleImagineOwnershipFacts(5, undefined)).toBe("Tier 5");
  });
});

describe("talent presentation", () => {
  it("shows player-facing progression without leaking an internal tree-node ID", () => {
    expect(talentPresentationFacts({ level: 1, node_id: 3_061 })).toBe("Level 1");
    expect(talentPresentationFacts({ node_id: 3_061 })).toBe("");
    expect(talentPresentationFacts({ level: 1, node_id: 3_061 })).not.toContain("3061");
    expect(talentPresentationFacts({ level: 1, node_id: 3_061 })).not.toContain("Node");
  });
});

describe("equipment attribute values", () => {
  it("uses the exact client interpolation formula for the observed roll scalar", () => {
    expect(interpolateEquipmentAttributeValue(1_935, 3_195, 100)).toBe(3_195);
    expect(interpolateEquipmentAttributeValue(1_935, 3_195, 50)).toBe(2_565);
    expect(interpolateEquipmentAttributeValue(1_935, 3_195, -1)).toBe(1_935);
  });

  it("formats normal, percent, time, and percent-member values like the client", () => {
    expect(formatFightAttributeValue(3_195, 0, 2)).toBe("3,195");
    expect(formatFightAttributeValue(1_710, 1, 2)).toBe("17.1%");
    expect(formatFightAttributeValue(1_500, 2, 2)).toBe("1.5s");
    expect(formatFightAttributeValue(1_234, 0, 4)).toBe("12.34%");
  });

  it("materializes buff-backed equipment effects with their exact rolled parameters", () => {
    expect(materializeEquipmentBuffDescription(
      "Grants {*Decision.unmarkpercent(1)*} PHY Boost bonus while Focus is active.",
      [{ minimum: 600, maximum: 600 }],
      100,
    )).toBe("Grants 6% PHY Boost bonus while Focus is active.");
  });
});

describe("published Photo Wall URLs", () => {
  it("counts displayed wall identities even when the album list is absent", () => {
    expect(photoWallIdentityCount([], { "1": 1 })).toBe(1);
    expect(photoWallIdentityCount([1, 2, 2], { "1": 1, "2": 3 })).toBe(3);
    expect(photoWallIdentityCount([0, -1, "invalid"], { "1": 0 })).toBe(0);
  });

  it("resolves only the server-owned public Photo Wall route", () => {
    expect(
      resolvePublishedPhotoUrl(
        "/v1/profiles/prf_0123456789abcdef/photo-wall/42",
        "https://api.rlogs.example",
      ),
    ).toBe("https://api.rlogs.example/v1/profiles/prf_0123456789abcdef/photo-wall/42");
    expect(resolvePublishedPhotoUrl("https://private-game-cdn.example/photo.png")).toBeUndefined();
    expect(
      resolvePublishedPhotoUrl(
        "/v1/profiles/prf_0123456789abcdef/photo-wall/0",
        "https://api.rlogs.example",
      ),
    ).toBeUndefined();
    expect(
      resolvePublishedPhotoUrl(
        "/v1/profiles/prf_0123456789abcdef/photo-wall/42",
        "http://api.rlogs.example",
      ),
    ).toBeUndefined();
  });
});

describe("published medal ordering", () => {
  it("uses the player's display-slot order before unplaced owned medals", () => {
    expect(orderedMedalEntries(
      [9040008, 9040011, 9040012],
      { "2": 9040011, "1": 9040012 },
    )).toEqual([
      { id: 9040012, slot: 1 },
      { id: 9040011, slot: 2 },
      { id: 9040008 },
    ]);
  });

  it("ignores duplicate and unowned slot references", () => {
    expect(orderedMedalEntries(
      [9040008, 9040008],
      { "1": 9999999, "2": 9040008, "3": 9040008 },
    )).toEqual([{ id: 9040008, slot: 2 }]);
  });
});

describe("master-mode dungeon summary", () => {
  it("counts the six current-season dungeons instead of every observed difficulty row", () => {
    const observation = (seasonId: number, dungeonConfigId: number, masterDifficulty: number) => ({
      season_id: seasonId,
      difficulty_id: dungeonConfigId,
      dungeon: {
        dungeon_id: masterDifficulty,
        score: masterDifficulty * 10,
        pass_time: 100,
      },
    });
    const observations = [
      observation(2, 6101, 1),
      observation(2, 6101, 20),
      observation(3, 6501, 1),
      observation(3, 6501, 16),
      observation(3, 6502, 16),
      observation(3, 6503, 16),
      observation(3, 6504, 16),
      observation(3, 6505, 16),
      observation(3, 6506, 16),
    ];

    expect(resolvedMasterDungeonCount(observations, 3)).toBe(6);
    expect(resolvedMasterDungeonCount(observations, 2)).toBe(1);
    expect(resolvedMasterDungeonCount(observations, undefined)).toBe(6);
  });
});
