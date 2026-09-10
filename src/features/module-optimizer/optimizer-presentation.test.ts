import { describe, expect, it } from "vitest";

import type { ProfilePresentationCatalog } from "../profiles/profile-presentation";
import {
  loadoutLinkSummary,
  moduleCardModel,
  optimizerPresentationIdentityForPublishedSelection,
  optimizerPresentationForIdentity,
  sortModuleInventory,
} from "./optimizer-presentation";

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

  it("shows finalized effect Link sums for the whole loadout", () => {
    expect(loadoutLinkSummary([
      {
        instance_id: "one",
        config_id: 5_500_103,
        quality: 4,
        parts: [
          { part_id: 2_104, initial_link_points: 10 },
          { part_id: 1_111, initial_link_points: 3 },
        ],
      },
      {
        instance_id: "two",
        config_id: 5_500_103,
        quality: 4,
        parts: [{ part_id: 1_111, initial_link_points: 5 }],
      },
    ], catalog)).toEqual([
      { id: 2_104, name: "DMG Stack", icon: "/dmg-stack.png", link: 10 },
      { id: 1_111, name: "Agility Boost", icon: "/agility.png", link: 8 },
    ]);
  });

  it.each([
    ["older source build", { deployment: "global", source_client_build: "24252055", source_protocol_pack_digest: `sha256:${"b".repeat(64)}` }],
    ["equal build with another digest", { deployment: "global", source_client_build: "24687926", source_protocol_pack_digest: `sha256:${"b".repeat(64)}` }],
    ["newer source build", { deployment: "global", source_client_build: "24699999", source_protocol_pack_digest: `sha256:${"b".repeat(64)}` }],
    ["missing source identity", { deployment: "" }],
    ["another deployment", { deployment: "cn", source_client_build: "24699999", source_protocol_pack_digest: `sha256:${"b".repeat(64)}` }],
  ])("resolves every known trusted catalog ID for %s", (_case, identity) => {
    const source = {
      ...catalog,
      locale: "en-US",
      deployment_id: "global",
      game_build: "24687926",
      protocol_pack_digest: `sha256:${"a".repeat(64)}`,
      modules: { ...catalog.modules, "9999998": { name: "Catalog Module", icon: "/catalog-module.png" } },
      module_effects: { ...catalog.module_effects, "9998": { name: "Catalog Effect", icon: "/catalog-effect.png" } },
    } as ProfilePresentationCatalog;
    const resolved = optimizerPresentationForIdentity(source, identity);

    expect(resolved.modules["5500103"]?.name).toBe("Excellent Attack Module");
    expect(resolved.module_effects["2104"]?.name).toBe("DMG Stack");
    expect(resolved.modules["9999998"]?.name).toBe("Catalog Module");
    expect(resolved.module_effects["9998"]?.name).toBe("Catalog Effect");
    expect(resolved.optimizer_label_catalog_provenance).toBe(
      "Labels from the trusted en-US catalog build 24687926.",
    );
  });

  it("preserves unknown numeric IDs as unresolved", () => {
    const source = {
      ...catalog,
      deployment_id: "global",
      game_build: "24687926",
      protocol_pack_digest: `sha256:${"a".repeat(64)}`,
    } as ProfilePresentationCatalog;
    const resolved = optimizerPresentationForIdentity(source, {
      deployment: "cn",
      source_client_build: "24699999",
      source_protocol_pack_digest: `sha256:${"b".repeat(64)}`,
    });
    const model = moduleCardModel({
      instance_id: "unknown",
      config_id: 9_999_999,
      parts: [{ part_id: 9_999, initial_link_points: 7 }],
    }, resolved);

    expect(model.name).toBe("Module 9999999 (unresolved)");
    expect(model.effects[0]?.name).toBe("Effect 9999 (unresolved)");
  });

  it("keeps a selected loadout identity whole instead of filling from the entry", () => {
    const entry = {
      source_client_build: "24687926",
      source_protocol_pack_digest: `sha256:${"a".repeat(64)}`,
    };

    expect(optimizerPresentationIdentityForPublishedSelection(
      "global",
      entry,
      { source_client_build: "24699999" },
    )).toEqual({
      deployment: "global",
      source_client_build: "24699999",
      source_protocol_pack_digest: undefined,
    });
    expect(optimizerPresentationIdentityForPublishedSelection(
      "global",
      entry,
      {},
    )).toEqual({
      deployment: "global",
      source_client_build: undefined,
      source_protocol_pack_digest: undefined,
    });
  });
});
