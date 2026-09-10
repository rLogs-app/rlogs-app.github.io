import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  containsUnsupportedEnglishPresentation,
  reviewedEnglishLabel,
} from "./parse-presentation-labels.mjs";

describe("parse presentation label gate", () => {
  it("accepts reviewed English presentation", () => {
    expect(reviewedEnglishLabel("  Arcane! Divine Reliance  ")).toBe("Arcane! Divine Reliance");
    expect(containsUnsupportedEnglishPresentation("Party-wide Damage")).toBe(false);
  });

  it("rejects untranslated and internal source identities", () => {
    for (const label of [
      "博伊斯ATK_02",
      "Player_SKILL_02_BD",
      "internalStatusEffect",
      "Effect 3003052",
      "3003052",
    ]) {
      expect(reviewedEnglishLabel(label), label).toBeUndefined();
    }
  });

  it("ships complete observed-action and rDPS-effect coverage without unsafe labels", () => {
    const catalog = JSON.parse(readFileSync(
      resolve("public/data/bpsr/parse-presentation.en-US.v3.json"),
      "utf8",
    ));
    expect(catalog).toMatchObject({
      schema_version: 3,
      deployment_id: "global",
      game_build: "24687926",
      protocol_pack_digest: "sha256:4372050d9d549808b229b16de315080f9bac427efe9602dabd9b93c4502dbbae",
    });
    expect(catalog.coverage).toMatchObject({
      observed_action_count: 171,
      localized_observed_action_count: 171,
      uncovered_action_ids: [],
      rdps_effect_count: 29,
      localized_rdps_effect_count: 29,
      uncovered_rdps_effect_ids: [],
      battle_imagine_count: 73,
      localized_battle_imagine_count: 73,
      uncovered_battle_imagine_skill_ids: [],
    });
    expect(Object.keys(catalog.actions)).toHaveLength(catalog.coverage.reviewed_action_count);
    expect(Object.values(catalog.actions).every(
      (label) => !containsUnsupportedEnglishPresentation(label),
    )).toBe(true);
    expect(Object.values(catalog.effects).every(
      (label) => !containsUnsupportedEnglishPresentation(label),
    )).toBe(true);
    expect(Object.values(catalog.imagines).every(
      (label) => !containsUnsupportedEnglishPresentation(label),
    )).toBe(true);
    expect(catalog.actions["1202"]).toBeUndefined();
    expect(catalog.actions["2900840"]).toBe("Arcane! Divine Reliance");
    expect(catalog.imagines["3948"]).toBe("Battle Imagine - Rorola");
  });
});
