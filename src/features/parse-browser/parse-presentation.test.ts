import { describe, expect, it } from "vitest";

import {
  localizedActionName,
  localizedEffectName,
  localizedImagineName,
  presentationForReport,
  renderCoreWithOptionalPresentation,
  type ParsePresentationCatalog,
} from "./parse-presentation";

const catalog: ParsePresentationCatalog = {
  schema_version: 3,
  locale: "en-US",
  deployment_id: "global",
  game_build: "24687926",
  protocol_pack_digest: "sha256:localization-authority",
  source: "test",
  actions: { "2900840": "Arcane! Divine Reliance" },
  effects: { "3003052": "Harmony Grace" },
  imagines: { "3948": "Battle Imagine - Rorola" },
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

  it("preserves an unknown numeric ID as evidence without presenting it as a name", () => {
    expect(localizedActionName(catalog, "9999999", null)).toBe(
      "Unlocalized combat action #9999999",
    );
    expect(localizedEffectName(catalog, "9999999", null)).toBe(
      "Unlocalized combat effect #9999999",
    );
  });

  it("resolves Battle Imagines by their equipped skill ID", () => {
    expect(localizedImagineName(catalog, "3948")).toBe("Battle Imagine - Rorola");
    expect(localizedImagineName(catalog, "9999")).toBe("Unlocalized combat imagine #9999");
  });

  it("rejects unresolved CJK and internal design identifiers from reports", () => {
    expect(localizedActionName(catalog, "1202", "博伊斯ATK_02")).toBe(
      "Unlocalized combat action #1202",
    );
    expect(localizedActionName(catalog, "1202", "Player_SKILL_02_BD")).toBe(
      "Unlocalized combat action #1202",
    );
    expect(localizedEffectName(catalog, "4502", "internalStatusEffect")).toBe(
      "Unlocalized combat effect #4502",
    );
  });

  it("applies the same gate to catalog strings and falls through to a safe report label", () => {
    const unsafeCatalog: ParsePresentationCatalog = {
      ...catalog,
      actions: { "1202": "博伊斯ATK_02" },
      effects: { "4502": "Player_SKILL_02_BD" },
    };
    expect(localizedActionName(unsafeCatalog, "1202", "Raincall Surge")).toBe("Raincall Surge");
    expect(localizedEffectName(unsafeCatalog, "4502", null)).toBe(
      "Unlocalized combat effect #4502",
    );
  });

  it("prefers the reviewed exact-build catalog over a report source label", () => {
    expect(localizedActionName(catalog, "2900840", "Player_SKILL_02_BD")).toBe(
      "Arcane! Divine Reliance",
    );
  });

  it("only exposes a catalog to its exact deployment, client build, and protocol digest", () => {
    expect(presentationForReport(catalog, "global", "24687926", "sha256:localization-authority")).toBe(catalog);
    expect(presentationForReport(catalog, "starsea", "24687926", "sha256:localization-authority")).toBeUndefined();
    expect(presentationForReport(catalog, "global", "24687927", "sha256:localization-authority")).toBeUndefined();
    expect(presentationForReport(catalog, "global", "24687926", "sha256:other")).toBeUndefined();
    expect(presentationForReport(catalog, "global", "24687926", undefined)).toBeUndefined();
  });

  it("fails closed instead of borrowing labels across builds", () => {
    const mismatched = presentationForReport(catalog, "global", "24687927", "sha256:localization-authority");
    expect(localizedActionName(mismatched, "2900840", "Skill 2900840")).toBe(
      "Unlocalized combat action #2900840",
    );
    expect(localizedEffectName(mismatched, "3003052", "Effect 3003052")).toBe(
      "Unlocalized combat effect #3003052",
    );
    expect(localizedImagineName(mismatched, "3948")).toBe("Unlocalized combat imagine #3948");
  });

  it("renders core data before an optional presentation request settles", async () => {
    let resolvePresentation: ((value: ParsePresentationCatalog) => void) | undefined;
    const pendingPresentation = new Promise<ParsePresentationCatalog>((resolve) => {
      resolvePresentation = resolve;
    });
    const renders: Array<ParsePresentationCatalog | undefined> = [];

    await expect(renderCoreWithOptionalPresentation(
      Promise.resolve("core"),
      pendingPresentation,
      (core, presentation) => {
        expect(core).toBe("core");
        renders.push(presentation);
      },
    )).resolves.toBe("core");
    expect(renders).toEqual([undefined]);

    resolvePresentation?.(catalog);
    await pendingPresentation;
    await Promise.resolve();
    expect(renders).toEqual([undefined, catalog]);
  });
});
