import { describe, expect, it } from "vitest";

import {
  battleImagineOwnershipFacts,
  cleanGameText,
  formatFightAttributeValue,
  interpolateEquipmentAttributeValue,
  materializeEquipmentBuffDescription,
  orderedMedalEntries,
  photoWallIdentityCount,
  resolveEquippedSkillSlots,
  resolveEquippedRoleSkillSlots,
  resolvePublishedPhotoUrl,
  resolvedMasterDungeonCount,
  resolveTalentTreeLayout,
  talentPresentationFacts,
} from "./profile-view";
import type { ProfilePresentationCatalog } from "../profiles/profile-presentation";

describe("Battle Imagine ownership presentation", () => {
  it("shows tier and equipped slot without the irrelevant character level", () => {
    expect(battleImagineOwnershipFacts(5, 7)).toBe("Tier 5 · Equipped · Slot 7");
    expect(battleImagineOwnershipFacts(5, undefined)).toBe("Tier 5");
  });
});

describe("talent presentation", () => {
  it("turns game rich-text markup into readable talent copy", () => {
    expect(cleanGameText(
      'Replaces <style="accent-gn">Special Attack</style>.<br><br><i><size=20>Falcon details.</size></i>',
    )).toBe("Replaces Special Attack.\n\nFalcon details.");
  });

  it("shows player-facing progression without leaking an internal tree-node ID", () => {
    expect(talentPresentationFacts({ level: 1, node_id: 3_061 })).toBe("Level 1");
    expect(talentPresentationFacts({ node_id: 3_061 })).toBe("");
    expect(talentPresentationFacts({ level: 1, node_id: 3_061 })).not.toContain("3061");
    expect(talentPresentationFacts({ level: 1, node_id: 3_061 })).not.toContain("Node");
  });

  it("selects the observed specialization branch and preserves game coordinates", () => {
    const catalog = {
      talent_nodes: {
        "1": {
          talent_id: 100,
          profession_id: 11,
          branch: 0,
          talent_stage: 0,
          prerequisite_node_ids: [],
          position: { x: 0, y: 0 },
        },
        "2": {
          talent_id: 101,
          profession_id: 11,
          branch: 0,
          talent_stage: 1,
          prerequisite_node_ids: [1],
          position: { x: -300, y: 300 },
        },
        "3": {
          talent_id: 102,
          profession_id: 11,
          branch: 1,
          talent_stage: 1,
          prerequisite_node_ids: [1],
          position: { x: 300, y: 300 },
        },
        "4": {
          talent_id: 103,
          profession_id: 11,
          branch: 1,
          talent_stage: 1,
          prerequisite_node_ids: [3],
          position: { x: 300, y: 600 },
        },
      },
      talents: {
        "100": { name: "Foundation" },
        "101": { name: "Other specialization", talent_type: 5 },
        "102": { name: "Falconry Spec", talent_type: 5 },
        "103": { name: "Falcon talent" },
      },
    } as unknown as ProfilePresentationCatalog;
    const layout = resolveTalentTreeLayout({
      class_id: 11,
      talents: [{ talent_id: 1 }, { talent_id: 3 }],
    }, catalog);
    expect(layout?.branch).toBe(1);
    expect(layout?.specializationName).toBe("Falconry Spec");
    expect(layout?.nodes.map((node) => node.nodeId)).toEqual([1, 3, 4]);
    expect(layout?.nodes[2]?.x).toBe(300);
    expect(layout?.nodes[2]?.prerequisiteNodeIds).toEqual([3]);
    expect(layout?.selectedCount).toBe(2);
  });
});

describe("equipped combat skills", () => {
  it("uses exact action-slot evidence and excludes non-combat bindings", () => {
    expect(resolveEquippedSkillSlots({
      class_id: 11,
      equipped_action_slots: [
        { slot_id: 5, skill_id: 2238 },
        { slot_id: 1, skill_id: 2201 },
        { slot_id: 21, skill_id: 3021 },
      ],
    })).toEqual([
      { slotId: 1, skillId: 2201 },
      { slotId: 5, skillId: 2238 },
    ]);
  });

  it("falls back to the current profession and equipped Battle Imagine slot maps", () => {
    expect(resolveEquippedSkillSlots({
      class_id: 11,
      battle_imagine_skills: [
        { equipped_slot: 8, skill_id: 3969 },
        { equipped_slot: 7, skill_id: 3948 },
      ],
      combat_professions: [
        { profession_id: 2, slotted_skill_ids: { "1": 1201 } },
        {
          profession_id: 11,
          slotted_skill_ids: { "9": 2231, "1": 2201, "21": 3021 },
        },
      ],
    })).toEqual([
      { slotId: 1, skillId: 2201 },
      { slotId: 7, skillId: 3948 },
      { slotId: 8, skillId: 3969 },
      { slotId: 9, skillId: 2231 },
    ]);
  });
});

describe("equipped role skills", () => {
  it("uses the game's exact role slots 21 through 24", () => {
    expect(resolveEquippedRoleSkillSlots({
      equipped_action_slots: [
        { slot_id: 1, skill_id: 2201 },
        { slot_id: 24, skill_id: 3022 },
        { slot_id: 22, skill_id: 3612 },
        { slot_id: 201, skill_id: 1101 },
      ],
    })).toEqual([
      { slotId: 22, skillId: 3612 },
      { slotId: 24, skillId: 3022 },
    ]);
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
