import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { ProfilePresentationCatalog } from "./profile-presentation";

const catalog = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../public/data/bpsr/profile-presentation.en-US.v1.json", import.meta.url)),
    "utf8",
  ),
) as ProfilePresentationCatalog;

describe("BPSR profile presentation catalog", () => {
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
});
