import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  normalizeProfilePresentationCatalog,
  type ProfilePresentationCatalog,
} from "./profile-presentation";

const catalog = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../public/data/bpsr/profile-presentation.en-US.v1.json", import.meta.url)),
    "utf8",
  ),
) as ProfilePresentationCatalog;

describe("BPSR profile presentation catalog", () => {
  it("is generated from the exact current-build game table instead of a parser snapshot", () => {
    expect(catalog.game_build).toBe("24687926");
    expect(catalog.source_item_table_sha256).toBe(
      "a5807d7b028ab5fa90e76fb519aea77493c79637576471b2e458efddf1846f99",
    );
    expect(catalog.source_achievement_table_sha256).toBe(
      "b3d6a677984dadb5fc664579d42bf0e029206c7d4a0ce3a90ea1bf949d99ef4a",
    );
    expect(catalog.source_medal_table_sha256).toBe(
      "3e98debeb73439f37435827e7e4e09ae6583fde3ad404326e796960d1fe7a849",
    );
    expect(Object.keys(catalog.titles)).toHaveLength(599);
    expect(catalog.titles["9062067"]?.name).toBe("Power from the Other Side");
  });

  it("localizes every exact-build medal used by public profiles", () => {
    expect(Object.keys(catalog.medals)).toHaveLength(183);
    expect(catalog.medals["9040100"]).toEqual(expect.objectContaining({
      name: "Crimson Sky",
      description: "Obtain through the limited-time event \"Master's Trial: Dream Resonance.\"",
      icon: "/assets/bpsr/profile/medals/personalzone_medal_icon_01_103.png",
    }));
    expect(Object.values(catalog.medals).filter((medal) => medal.icon)).toHaveLength(179);
  });

  it("localizes every exact-build general and seasonal achievement", () => {
    expect(Object.keys(catalog.achievements)).toHaveLength(807);
    expect(catalog.achievements["100010101"]).toEqual(expect.objectContaining({
      name: "Adventure Ladder I",
      description: "Reach Adventurer Lv.20",
      target: 1,
      season_id: 0,
    }));
    expect(catalog.achievements["100010201"]?.description).toBe("Unlock 2 classes");
    expect(Object.values(catalog.achievements).every(
      (achievement) => !achievement.description?.includes("{*val*}"),
    )).toBe(true);
    expect(catalog.achievements["101010101"]?.season_id).toBe(1);
  });

  it("covers every reviewed sigil family and exact level with an image", () => {
    expect(Object.keys(catalog.sigils)).toHaveLength(107);
    expect(Object.values(catalog.sigils).flat()).toHaveLength(321);
    expect(Object.values(catalog.sigils).flat().every((level) => level.icon?.startsWith("/assets/"))).toBe(true);
  });

  it("keeps Battle Imagine rarity values separate from observed ownership tiers", () => {
    expect(catalog.imagines["3901"]).toEqual(expect.objectContaining({ name: "Battle Imagine - Inferno Ogre", item_tier: 4 }));
    expect(catalog.imagines["3902"]).toEqual(expect.objectContaining({ name: "Battle Imagine - Tempest Ogre", item_tier: 4 }));
    expect(catalog.imagines["3913"]).toEqual(expect.objectContaining({ name: "Battle Imagine - Shadow Captain", item_tier: 3 }));
  });

  it("publishes every profession and specialization tree independently of profile submissions", () => {
    expect(Object.keys(catalog.talent_tree_index)).toHaveLength(9);
    const specializations = Object.values(catalog.talent_tree_index)
      .flatMap((tree) => tree.specializations);
    expect(specializations).toHaveLength(18);
    expect(specializations.map((specialization) => specialization.name).sort()).toEqual([
      "Block Spec",
      "Concerto Spec",
      "Crimson Expertise Spec",
      "Dissonance Spec",
      "Earthfort Spec",
      "Falconry Spec",
      "Formless Expertise Spec",
      "Frostbeam Spec",
      "Iaido Slash Spec",
      "Icicle Spec",
      "Lifebind Spec",
      "Moonstrike Spec",
      "Recovery Spec",
      "Shield Spec",
      "Skyward Spec",
      "Smite Spec",
      "Vanguard Spec",
      "Wildpack Spec",
    ]);
    const indexedNodeIds = new Set<number>();
    for (const tree of Object.values(catalog.talent_tree_index)) {
      expect(tree.foundation_node_ids).toHaveLength(30);
      expect(tree.specializations).toHaveLength(2);
      tree.foundation_node_ids.forEach((nodeId) => indexedNodeIds.add(nodeId));
      for (const specialization of tree.specializations) {
        expect(specialization.node_ids).toHaveLength(60);
        expect(catalog.talents[String(specialization.talent_id)]?.name).toBe(specialization.name);
        specialization.node_ids.forEach((nodeId) => indexedNodeIds.add(nodeId));
      }
    }
    expect(indexedNodeIds.size).toBe(1_350);
    expect([...indexedNodeIds].every((nodeId) => {
      const node = catalog.talent_nodes[String(nodeId)];
      const talent = node?.talent_id == null ? undefined : catalog.talents[String(node.talent_id)];
      return node?.position != null && Boolean(talent?.name) && Boolean(talent?.icon) && Boolean(talent?.description);
    })).toBe(true);
  });

  it("publishes exact base and breakthrough item levels for equipment cards", () => {
    expect(catalog.items["2000631"]?.equipment_level).toBe(220);
    expect(catalog.items["2000631"]?.equipment_levels_by_breakthrough?.["3"]).toBe(280);
    expect(catalog.items["2011441"]?.equipment_levels_by_breakthrough?.["2"]).toBe(270);
    expect(catalog.items["2081462"]?.equipment_levels_by_breakthrough?.["2"]).toBe(270);
    expect(catalog.items["2091462"]?.equipment_levels_by_breakthrough?.["2"]).toBe(270);
    expect(catalog.items["2081462"]?.set_id).toBe(103);
    expect(catalog.items["2091462"]?.set_id).toBe(103);
    expect(catalog.items["2011341"]?.equipment_level).toBe(240);
    expect(catalog.equipment_sets["5"]).toEqual({
      suit_id: 102,
      name: "2-Piece Set",
      required_pieces: 2,
    });
  });

  it("resolves all exact Final Sigil levels and rolled attribute values", () => {
    expect(catalog.sigils["3020221"]).toEqual([
      expect.objectContaining({ level: 8, item_id: 3020221, name: "Paradox-Calamity Remnant - Final Sigil" }),
      expect.objectContaining({ level: 9, item_id: 3020222, name: "Paradox-Calamity Remnant - Final Sigil - Fine" }),
      expect.objectContaining({ level: 10, item_id: 3020223, name: "Paradox-Calamity Remnant - Final Sigil - Rare" }),
    ]);
    expect(catalog.sigils["3020221"][0].effects).toEqual([
      { attribute_id: 11502, name: "All Element Attack", value: 72 },
      { attribute_id: 11032, name: "Agility", value: 95 },
    ]);
  });

  it("keeps localized profiles usable during a legacy catalog edge-cache overlap", () => {
    const legacyCatalog = { ...catalog } as Partial<ProfilePresentationCatalog>;
    delete legacyCatalog.sigils;
    delete legacyCatalog.achievements;
    delete legacyCatalog.medals;
    delete legacyCatalog.talent_tree_index;
    delete legacyCatalog.equipment_sets;
    expect(normalizeProfilePresentationCatalog(legacyCatalog)?.sigils).toEqual({});
    expect(normalizeProfilePresentationCatalog(legacyCatalog)?.achievements).toEqual({});
    expect(normalizeProfilePresentationCatalog(legacyCatalog)?.medals).toEqual({});
    expect(normalizeProfilePresentationCatalog(legacyCatalog)?.talent_tree_index).toEqual({});
    expect(normalizeProfilePresentationCatalog(legacyCatalog)?.equipment_sets).toEqual({});
    expect(normalizeProfilePresentationCatalog({ sigils: {} })).toBeUndefined();
  });
});
