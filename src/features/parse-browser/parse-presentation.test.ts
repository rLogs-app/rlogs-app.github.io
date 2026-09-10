import { describe, expect, it } from "vitest";

import {
  localizedActionName,
  localizedClassName,
  localizedEffectName,
  localizedImagineName,
  localizedModuleEffectName,
  localizedModuleName,
  localizedSceneName,
  localizedSpecializationName,
  presentationForReport,
  semanticPresentationForReport,
  renderCoreWithOptionalPresentation,
  type ParsePresentationCatalog,
} from "./parse-presentation";

const catalog: ParsePresentationCatalog = {
  schema_version: 5,
  locale: "en-US",
  deployment_id: "global",
  game_build: "24687926",
  protocol_pack_digest: "sha256:localization-authority",
  source: "test",
  actions: { "2900840": "Arcane! Divine Reliance" },
  effects: { "3003052": "Harmony Grace" },
  imagines: { "3948": "Battle Imagine - Rorola" },
  modules: { "5500104": "Excellent Attack Module - Premium" },
  module_effects: { "1110": "Strength Boost" },
  scenes: { "13021": "Clash! Field of Forgotten Illusions" },
  classes: { "1": "Stormblade" },
  specializations: { "101": "Iaido Slash Spec" },
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

  it("resolves exact-build modules and rune effects in separate namespaces", () => {
    expect(localizedModuleName(catalog, "5500104")).toBe("Excellent Attack Module - Premium");
    expect(localizedModuleEffectName(catalog, "1110")).toBe("Strength Boost");
    expect(localizedModuleName(catalog, "9999999")).toBe("Unlocalized combat module #9999999");
    expect(localizedModuleEffectName(catalog, "9999999")).toBe("Unlocalized combat module effect #9999999");
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

  it("rejects unsafe catalog strings without borrowing report-supplied labels", () => {
    const unsafeCatalog: ParsePresentationCatalog = {
      ...catalog,
      actions: { "1202": "博伊斯ATK_02" },
      effects: { "4502": "Player_SKILL_02_BD" },
    };
    expect(localizedActionName(unsafeCatalog, "1202", "Raincall Surge")).toBe("Unlocalized combat action #1202");
    expect(localizedEffectName(unsafeCatalog, "4502", null)).toBe(
      "Unlocalized combat effect #4502",
    );
  });

  it("prefers the reviewed exact-build catalog over a report source label", () => {
    expect(localizedActionName(catalog, "2900840", "Player_SKILL_02_BD")).toBe(
      "Arcane! Divine Reliance",
    );
  });

  it.each([
    ["older build", "global", "24252055", "sha256:older"],
    ["equal build with wrong digest", "global", "24687926", "sha256:other"],
    ["newer build", "global", "24699999", "sha256:newer"],
    ["missing identity", "", "", undefined],
    ["another deployment", "cn", "24687926", "sha256:other"],
  ])("exposes trusted ID labels for %s", (_case, deployment, build, digest) => {
    const resolved = presentationForReport(catalog, deployment, build, digest);
    expect(localizedActionName(resolved, "2900840", null)).toBe("Arcane! Divine Reliance");
    expect(localizedEffectName(resolved, "3003052", null)).toBe("Harmony Grace");
    expect(localizedImagineName(resolved, "3948")).toBe("Battle Imagine - Rorola");
    expect(localizedModuleName(resolved, "5500104")).toBe("Excellent Attack Module - Premium");
    expect(localizedModuleEffectName(resolved, "1110")).toBe("Strength Boost");
    expect(localizedSceneName(resolved, 13021)).toBe("Clash! Field of Forgotten Illusions");
    expect(localizedClassName(resolved, 1)).toBe("Stormblade");
    expect(localizedSpecializationName(resolved, 101)).toBe("Iaido Slash Spec");
  });

  it("keeps semantic authorization exact while labels remain available", () => {
    expect(semanticPresentationForReport(catalog, "global", "24687926", "sha256:localization-authority")).toBe(catalog);
    expect(semanticPresentationForReport(catalog, "global", "24252055", "sha256:older")).toBeUndefined();
    expect(semanticPresentationForReport(catalog, "global", "24687926", "sha256:other")).toBeUndefined();
    expect(semanticPresentationForReport(catalog, "cn", "24687926", "sha256:localization-authority")).toBeUndefined();
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
