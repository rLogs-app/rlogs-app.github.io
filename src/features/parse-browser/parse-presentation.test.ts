import { describe, expect, it } from "vitest";

import {
  localizedActionName,
  localizedEffectName,
  presentationForReport,
  type ParsePresentationCatalog,
} from "./parse-presentation";

const catalog: ParsePresentationCatalog = {
  schema_version: 1,
  locale: "en-US",
  deployment_id: "global",
  game_build: "24687926",
  source: "test",
  actions: { "2900840": "Arcane! Divine Reliance" },
  effects: { "3003052": "Harmony Grace" },
};

describe("parse presentation", () => {
  it("replaces numeric skill placeholders with reviewed action names", () => {
    expect(localizedActionName(catalog, "2900840", "Skill 2900840")).toBe(
      "Arcane! Divine Reliance",
    );
  });

  it("replaces numeric effect placeholders with reviewed effect names", () => {
    expect(localizedEffectName(catalog, "3003052", "Effect 3003052")).toBe(
      "Harmony Grace",
    );
  });

  it("never exposes an unknown numeric ID as the display label", () => {
    expect(localizedActionName(catalog, "9999999", null)).toBe(
      "Unlocalized combat action",
    );
    expect(localizedEffectName(catalog, "9999999", null)).toBe(
      "Unlocalized combat effect",
    );
  });

  it("only exposes a catalog to its exact deployment and client build", () => {
    expect(presentationForReport(catalog, "global", "24687926")).toBe(catalog);
    expect(presentationForReport(catalog, "starsea", "24687926")).toBeUndefined();
    expect(presentationForReport(catalog, "global", "24687927")).toBeUndefined();
  });

  it("fails closed instead of borrowing labels across builds", () => {
    const mismatched = presentationForReport(catalog, "global", "24687927");
    expect(localizedActionName(mismatched, "2900840", "Skill 2900840")).toBe(
      "Unlocalized combat action",
    );
    expect(localizedEffectName(mismatched, "3003052", "Effect 3003052")).toBe(
      "Unlocalized combat effect",
    );
  });
});
