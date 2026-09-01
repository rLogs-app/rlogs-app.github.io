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
    expect(Object.keys(catalog.titles)).toHaveLength(599);
    expect(catalog.titles["9062067"]?.name).toBe("Power from the Other Side");
  });

  it("covers every reviewed sigil family and exact level with an image", () => {
    expect(Object.keys(catalog.sigils)).toHaveLength(107);
    expect(Object.values(catalog.sigils).flat()).toHaveLength(321);
    expect(Object.values(catalog.sigils).flat().every((level) => level.icon?.startsWith("/assets/"))).toBe(true);
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
    expect(normalizeProfilePresentationCatalog(legacyCatalog)?.sigils).toEqual({});
    expect(normalizeProfilePresentationCatalog({ sigils: {} })).toBeUndefined();
  });
});
