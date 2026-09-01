import { describe, expect, it } from "vitest";

import type { ProfilePresentationCatalog } from "../profiles/profile-presentation";
import { moduleCardModel, sortModuleInventory } from "./optimizer-presentation";

const catalog = {
  quality_names: { "4": "Epic" },
  modules: {
    "5500103": { name: "Excellent Attack Module", icon: "/module.png", quality: 4 },
  },
  module_effects: {
    "2104": { name: "DMG Stack", icon: "/dmg-stack.png" },
    "1111": { name: "Agility Boost", icon: "/agility.png" },
  },
} as unknown as ProfilePresentationCatalog;

describe("module optimizer presentation", () => {
  it("turns a raw module into localized, readable card data", () => {
    expect(moduleCardModel({
      instance_id: "9876543210123456",
      config_id: 5_500_103,
      quality: 4,
      parts: [
        { part_id: 2_104, initial_link_points: 10 },
        { part_id: 1_111, initial_link_points: 3 },
      ],
    }, catalog)).toEqual({
      name: "Excellent Attack Module",
      icon: "/module.png",
      quality: "Epic",
      totalLink: 13,
      copyLabel: "Copy …123456",
      searchText: "excellent attack module epic copy …123456 dmg stack agility boost",
      effects: [
        { id: 2_104, name: "DMG Stack", icon: "/dmg-stack.png", link: 10 },
        { id: 1_111, name: "Agility Boost", icon: "/agility.png", link: 3 },
      ],
    });
  });

  it("sorts equipped copies first, then stronger and higher-link modules", () => {
    const modules = [
      { instance_id: "low", config_id: 5_500_103, quality: 2, parts: [{ part_id: 1_111, initial_link_points: 3 }] },
      { instance_id: "equipped", config_id: 5_500_103, quality: 2, parts: [{ part_id: 1_111, initial_link_points: 1 }] },
      { instance_id: "high", config_id: 5_500_103, quality: 4, parts: [{ part_id: 1_111, initial_link_points: 12 }] },
    ];
    expect(sortModuleInventory(modules, catalog, new Set(["equipped"])).map((module) => module.instance_id))
      .toEqual(["equipped", "high", "low"]);
  });
});
