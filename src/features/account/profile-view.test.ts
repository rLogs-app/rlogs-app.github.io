import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  battleImagineDisplayName,
  battleImagineOwnershipFacts,
  battleImagineRarityLabel,
  calculateTalentTreeGeometry,
  cleanGameText,
  combatActionDisplaySlots,
  equipmentQualityToken,
  formatFightAttributeValue,
  interpolateEquipmentAttributeValue,
  materializeEquipmentBuffDescription,
  masterDungeonRows,
  orderedMedalEntries,
  photoWallDisplayEntries,
  photoWallIdentityCount,
  resolveCombatStatFamilies,
  resolveCombatActionPresentation,
  resolveActiveEquipmentSetEffects,
  resolveEquippedSkillSlots,
  resolveEquippedRoleSkillSlots,
  resolveEquipmentItemLevel,
  resolvePublishedPhotoUrl,
  resolveRoleImagineName,
  resolveRoleImagineTier,
  resolvedSocialCollectionEvidence,
  resolvedMasterDungeonCount,
  resolveTalentTreeLayout,
  skillProgressFacts,
  talentPresentationFacts,
} from "./profile-view";
import type { ProfilePresentationCatalog } from "../profiles/profile-presentation";

const allTreesCatalog = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../public/data/bpsr/profile-presentation.en-US.v1.json", import.meta.url)),
    "utf8",
  ),
) as ProfilePresentationCatalog;

describe("Battle Imagine ownership presentation", () => {
  it("shows tier and equipped slot without the irrelevant character level", () => {
    expect(battleImagineOwnershipFacts(5, 7, "SSR")).toBe("Tier 5 · SSR · Equipped · Position 8");
    expect(battleImagineOwnershipFacts(5, 8, "SSR")).toBe("Tier 5 · SSR · Equipped · Position 9");
    expect(battleImagineOwnershipFacts(5, undefined)).toBe("Tier 5");
    expect(battleImagineOwnershipFacts(undefined, undefined, "SR")).toBe("Tier 0 · SR");
  });

  it("keeps catalog rarity separate from the observed remodel tier", () => {
    expect(battleImagineRarityLabel("SSR", 4)).toBe("SSR");
    expect(battleImagineRarityLabel("SR", 4)).toBe("SR");
    expect(battleImagineRarityLabel("Collab", 4)).toBe("Collab");
    expect(battleImagineRarityLabel(3)).toBe("Epic");
    expect(battleImagineRarityLabel(4)).toBe("SR");
    expect(battleImagineRarityLabel(5)).toBe("SSR");
    expect(battleImagineRarityLabel(2)).toBe("");
    expect(battleImagineRarityLabel(undefined)).toBe("");
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
      talent_tree_index: {
        "11": {
          profession_id: 11,
          foundation_node_ids: [1],
          specializations: [
            { branch: 0, name: "Other specialization", talent_id: 101, node_ids: [2] },
            { branch: 1, name: "Falconry Spec", talent_id: 102, node_ids: [3, 4] },
          ],
        },
      },
    } as unknown as ProfilePresentationCatalog;
    const layout = resolveTalentTreeLayout({
      class_id: 11,
      talents: [{ talent_id: 1 }, { talent_id: 3 }],
    }, catalog);
    expect(layout?.branch).toBe(1);
    expect(layout?.specializationName).toBe("Falconry Spec");
    expect(layout?.nodes.map((node) => node.nodeId)).toEqual([3, 4]);
    expect(layout?.nodes[1]?.x).toBe(300);
    expect(layout?.nodes[1]?.prerequisiteNodeIds).toEqual([3]);
    expect(layout?.selectedCount).toBe(1);
  });

  it("resolves all website-owned specialization trees from submission node IDs", () => {
    for (const tree of Object.values(allTreesCatalog.talent_tree_index)) {
      for (const specialization of tree.specializations) {
        const specializationNodeId = specialization.node_ids.find((nodeId) =>
          allTreesCatalog.talent_nodes[String(nodeId)]?.talent_id === specialization.talent_id
        );
        expect(specializationNodeId, specialization.name).toBeDefined();
        if (specializationNodeId == null) throw new Error(`Missing specialization node for ${specialization.name}`);
        const layout = resolveTalentTreeLayout({
          class_id: tree.profession_id,
          talents: [{ talent_id: specializationNodeId }],
        }, allTreesCatalog);
        expect(layout?.branch, specialization.name).toBe(specialization.branch);
        expect(layout?.specializationName, specialization.name).toBe(specialization.name);
        expect(layout?.nodes, specialization.name).toHaveLength(60);
        expect(layout?.nodes.filter((node) => node.talentStage === 0), specialization.name).toHaveLength(0);
        expect(layout?.nodes.filter((node) => node.talentStage === 1), specialization.name).toHaveLength(60);
      }
    }
  });

  it("uses one scale on both axes and leaves full-size nodes room between game rows", () => {
    const geometry = calculateTalentTreeGeometry([
      { nodeId: 1, talentId: 100, branch: 0, talentStage: 0, prerequisiteNodeIds: [], x: 0, y: 0, selected: true },
      { nodeId: 2, talentId: 101, branch: 0, talentStage: 0, prerequisiteNodeIds: [1], x: 240, y: 0, selected: true },
      { nodeId: 3, talentId: 102, branch: 0, talentStage: 1, prerequisiteNodeIds: [1], x: 0, y: 240, selected: false },
    ]);
    const first = geometry.coordinates.get(1)!;
    const horizontal = geometry.coordinates.get(2)!;
    const vertical = geometry.coordinates.get(3)!;
    expect(Math.abs((horizontal.x - first.x) - (vertical.y - first.y))).toBeLessThanOrEqual(1);
    expect(horizontal.x - first.x).toBeGreaterThan(geometry.nodeSize);
    expect(geometry.width).toBeGreaterThanOrEqual(760);
  });

  it("aligns foundation and specialization coordinate frames by their bounds centers", () => {
    const geometry = calculateTalentTreeGeometry([
      { nodeId: 1, talentId: 100, branch: 0, talentStage: 0, prerequisiteNodeIds: [], x: -240, y: 0, selected: true },
      { nodeId: 2, talentId: 101, branch: 0, talentStage: 0, prerequisiteNodeIds: [1], x: 840, y: 240, selected: true },
      { nodeId: 3, talentId: 102, branch: 1, talentStage: 1, prerequisiteNodeIds: [2], x: 1380, y: 480, selected: true },
      { nodeId: 4, talentId: 103, branch: 1, talentStage: 1, prerequisiteNodeIds: [3], x: 3180, y: 720, selected: false },
    ]);
    const foundationCenter = (
      geometry.coordinates.get(1)!.x + geometry.coordinates.get(2)!.x
    ) / 2;
    const specializationCenter = (
      geometry.coordinates.get(3)!.x + geometry.coordinates.get(4)!.x
    ) / 2;
    expect(specializationCenter).toBe(foundationCenter);
    expect(geometry.coordinates.get(4)!.x - geometry.coordinates.get(3)!.x).toBe(576);
  });
});

describe("equipped combat skills", () => {
  it("shows seven class actions before the two Imagines without rewriting source slots", () => {
    expect(combatActionDisplaySlots()).toEqual([
      { displaySlotId: 1, sourceSlotId: 1 },
      { displaySlotId: 2, sourceSlotId: 2 },
      { displaySlotId: 3, sourceSlotId: 3 },
      { displaySlotId: 4, sourceSlotId: 4 },
      { displaySlotId: 5, sourceSlotId: 5 },
      { displaySlotId: 6, sourceSlotId: 9 },
      { displaySlotId: 7, sourceSlotId: 6 },
      { displaySlotId: 8, sourceSlotId: 7 },
      { displaySlotId: 9, sourceSlotId: 8 },
    ]);
  });

  it("presents the protobuf remodel level as the user-facing skill tier", () => {
    expect(skillProgressFacts(60, 6)).toBe("Level 60 · Tier 6");
    expect(skillProgressFacts(1, 5, false, true)).toBe("Tier 5");
  });

  it("uses the selected specialization's exact special-attack replacement", () => {
    expect(resolveCombatActionPresentation({
      talents: [{ node_id: 1_129_002 }],
    }, 2, 2_220, allTreesCatalog)).toEqual({
      skillId: 2_222,
      kind: "Special attack",
    });
    expect(allTreesCatalog.skills["2222"]?.name).toBe("Double Arrow");
    expect(resolveCombatActionPresentation({}, 1, 2_201, allTreesCatalog).kind).toBe("Basic attack");
    expect(resolveCombatActionPresentation({}, 6, 2_209, allTreesCatalog).kind).toBe("Ultimate");
    expect(resolveCombatActionPresentation({}, 9, 2_231, allTreesCatalog).kind).toBe("Class / expertise skill");
  });

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

  it("shows only the observed T1 through T4 domain for Imagine role skills", () => {
    const body = {
      class_id: 11,
      active_skills: [
        { skill_id: 3021, remodel_level: 4 },
        { skill_id: 3022, remodel_level: 5 },
        { skill_id: 3011, remodel_level: 4 },
      ],
    };
    expect(allTreesCatalog.skills["3021"]?.replacement_imagine_skill_id).toBe(3902);
    expect(allTreesCatalog.skills["3011"]?.replacement_imagine_skill_id).toBeNull();
    expect(resolveRoleImagineTier(body, 3021, allTreesCatalog)).toBe(4);
    expect(resolveRoleImagineTier(body, 3022, allTreesCatalog)).toBeUndefined();
    expect(resolveRoleImagineTier(body, 3011, allTreesCatalog)).toBeUndefined();
    expect(resolveRoleImagineName(3021, allTreesCatalog)).toBe("Tempest Ogre");
    expect(resolveRoleImagineName(3011, allTreesCatalog)).toBeUndefined();
  });

  it("finds an Imagine role-skill tier through replacement and profession evidence", () => {
    expect(resolveRoleImagineTier({
      class_id: 11,
      active_skills: [],
      combat_professions: [{
        profession_id: 11,
        skills: [{
          skill_id: 900_000,
          replacement_skill_ids: [3027],
          remodel_level: 3,
        }],
      }],
    }, 3027, allTreesCatalog)).toBe(3);
  });

  it("derives Imagine role-skill tiers from the exact archive thresholds", () => {
    const body = {
      active_skills: [],
      battle_imagine_skills: [
        { skill_id: 3901, base_skill_id: 3901, remodel_level: 5 },
        { skill_id: 3923, base_skill_id: 3923, remodel_level: null },
        { skill_id: 3955, base_skill_id: 3955, remodel_level: 5 },
        { skill_id: 3930, base_skill_id: 3930, remodel_level: 5 },
        { skill_id: 3934, base_skill_id: 3934, remodel_level: 5 },
        { skill_id: 3966, base_skill_id: 3966, remodel_level: 5 },
        { skill_id: 3902, base_skill_id: 3902, remodel_level: 5 },
      ],
    };
    // Chapter of Flames has 25 total tiers, a T5 core, and treats null as T0.
    expect(resolveRoleImagineTier(body, 3022, allTreesCatalog)).toBe(4);
    // Chapter of Gluttony's empty member list uses the full observed archive.
    expect(resolveRoleImagineTier(body, 3021, allTreesCatalog)).toBe(4);
  });
});

describe("equipment attribute values", () => {
  it("derives the current item level from the exact breakthrough table", () => {
    expect(resolveEquipmentItemLevel(
      { attributes: { breakthrough_count: 3 } },
      { name: "Weapon", equipment_level: 220, equipment_levels_by_breakthrough: { "1": 240, "2": 260, "3": 280 } },
    )).toBe(280);
    expect(resolveEquipmentItemLevel(
      { attributes: { breakthrough_count: 2 } },
      { name: "Bracelet", equipment_level: 260, equipment_levels_by_breakthrough: { "1": 265, "2": 270 } },
    )).toBe(270);
    expect(resolveEquipmentItemLevel(
      { level: 275, attributes: { breakthrough_count: 2 } },
      { name: "Armor", equipment_level: 260, equipment_levels_by_breakthrough: { "2": 270 } },
    )).toBe(275);
  });

  it("joins observed active effects only to equipment from the matching set", () => {
    const catalog = {
      equipment_sets: {
        "5": { suit_id: 102, name: "2-Piece Set", required_pieces: 2 },
        "7": { suit_id: 103, name: "2-Piece Set", required_pieces: 2 },
      },
      equipment_attributes: {
        "1782": {
          name: "Focus set bonus",
          equipment_buff_effects: [{
            buff_id: 1,
            description: "While Focus is active, Crit DMG +50%.",
            parameters: [],
          }],
        },
        "2268": { name: "Bracelet set bonus" },
      },
    } as unknown as ProfilePresentationCatalog;
    expect(resolveActiveEquipmentSetEffects([
      { map_key: 5, attributes: { "1782": 100 } },
      { map_key: 7, attributes: { "2268": 100 } },
    ], 102, catalog)).toEqual([{
      name: "2-Piece Set",
      requiredPieces: 2,
      effects: ["While Focus is active, Crit DMG +50%."],
    }]);
  });

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

describe("profile combat-stat snapshots", () => {
  it("groups exact game-defined component members into one localized stat breakdown", () => {
    const catalog = {
      fight_attributes: {
        "11010": { name: "Attack", number_type: 0, format_type: 0, family_id: 11010, component: "final" },
        "11011": { name: "Attack", number_type: 0, format_type: 1, family_id: 11010, component: "total" },
        "11012": { name: "Attack", number_type: 0, format_type: 2, family_id: 11010, component: "add" },
        "12010": { name: "Critical Hit Rate", number_type: 1, format_type: 0, family_id: 12010, component: "final" },
        "20050": { name: "AttrLevel", number_type: 0, format_type: 0, family_id: 20050, component: "final", displayable: false },
      },
    } as unknown as ProfilePresentationCatalog;
    expect(resolveCombatStatFamilies({
      "11012": 200,
      "12010": 1_710,
      "11010": 3_400,
      "11011": 3_200,
      "20050": 99,
      "9999": 123,
    }, catalog)).toEqual([
      {
        familyId: 11010,
        name: "Attack",
        components: [
          { attributeId: 11010, component: "final", value: 3_400, numberType: 0, formatType: 0 },
          { attributeId: 11011, component: "total", value: 3_200, numberType: 0, formatType: 1 },
          { attributeId: 11012, component: "add", value: 200, numberType: 0, formatType: 2 },
        ],
      },
      {
        familyId: 12010,
        name: "Critical Hit Rate",
        components: [
          { attributeId: 12010, component: "final", value: 1_710, numberType: 1, formatType: 0 },
        ],
      },
    ]);
  });

  it("ships component identity for every generated fight-attribute member", () => {
    const allowed = new Set(["final", "total", "add", "extra_add", "percent", "extra_percent"]);
    expect(Object.keys(allTreesCatalog.fight_attributes)).toHaveLength(906);
    expect(allTreesCatalog.fight_attributes["0"]).toBeUndefined();
    for (const attribute of Object.values(allTreesCatalog.fight_attributes)) {
      expect(Number.isSafeInteger(attribute.family_id)).toBe(true);
      expect(allowed.has(attribute.component ?? "")).toBe(true);
    }
  });
});

describe("equipment quality presentation", () => {
  it("uses the six in-game quality tiers instead of the generic rarity ladder", () => {
    expect(allTreesCatalog.quality_names).toEqual({
      "0": "Raw",
      "1": "Common",
      "2": "Rare",
      "3": "Epic",
      "4": "Legendary",
      "5": "Mythic",
    });
    expect(allTreesCatalog.items["2000631"]?.name).toBe("Ember - Gaze of the Far Sea");
    expect(allTreesCatalog.items["2000631"]?.quality).toBe(5);
  });

  it("maps every equipment quality to its card-outline token", () => {
    expect([0, 1, 2, 3, 4, 5].map(equipmentQualityToken)).toEqual([
      "raw",
      "common",
      "rare",
      "epic",
      "legendary",
      "mythic",
    ]);
    expect(equipmentQualityToken(6)).toBe("");
    expect(equipmentQualityToken(undefined)).toBe("");
  });
});

describe("Battle Imagine card names", () => {
  it("removes the redundant item-type prefix without altering the catalog", () => {
    expect(battleImagineDisplayName("Battle Imagine - Rorola")).toBe("Rorola");
    expect(battleImagineDisplayName("Battle Imagine: Inferno Ogre")).toBe("Inferno Ogre");
    expect(battleImagineDisplayName("Lucy")).toBe("Lucy");
    expect(battleImagineDisplayName(undefined)).toBe("");
    expect(allTreesCatalog.imagines["3948"]?.name).toBe("Battle Imagine - Rorola");
  });
});

describe("profile collection evidence labels", () => {
  it("does not present missing guild or partial title observations as complete totals", () => {
    expect(resolvedSocialCollectionEvidence(undefined)).toEqual({
      guild: "Awaiting live observation",
      observedTitleCount: 0,
    });
    expect(resolvedSocialCollectionEvidence({
      guild_name: "Public Guild",
      title_ids: [9_061_163],
    })).toEqual({
      guild: "Public Guild",
      observedTitleCount: 1,
    });
  });
});

describe("published Photo Wall URLs", () => {
  it("shows exact album or asset identities even before a wall-slot snapshot arrives", () => {
    expect(photoWallDisplayEntries([42, 41, 42], undefined, [43, 41])).toEqual([
      { slot: null, photoId: 41 },
      { slot: null, photoId: 42 },
      { slot: null, photoId: 43 },
    ]);
    expect(photoWallDisplayEntries([41, 42], { "2": 42 }, [43])).toEqual([
      { slot: "2", photoId: 42 },
      { slot: null, photoId: 41 },
      { slot: null, photoId: 43 },
    ]);
  });

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
  it("keeps the completion time attached to every selected mobile score card", () => {
    const observation = (dungeonConfigId: number, score: number, passTime: number) => ({
      season_id: 3,
      difficulty_id: dungeonConfigId,
      dungeon: {
        dungeon_id: 16,
        score,
        pass_time: passTime,
      },
    });
    const rows = masterDungeonRows(
      [
        observation(6501, 630, 431),
        observation(6501, 630, 352),
        observation(6502, 631, 396),
        observation(6503, 632, 579),
      ],
      allTreesCatalog,
    ).get(3);

    expect(rows?.map((row) => [row.dungeonId, row.score, row.passTime])).toEqual([
      [6501, 630, 352],
      [6502, 631, 396],
      [6503, 632, 579],
    ]);
  });

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
