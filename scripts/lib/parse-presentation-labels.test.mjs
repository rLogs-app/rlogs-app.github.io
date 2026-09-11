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
      resolve("public/data/bpsr/parse-presentation.en-US.v4.json"),
      "utf8",
    ));
    expect(catalog).toMatchObject({
      schema_version: 4,
      deployment_id: "global",
      game_build: "24687926",
      protocol_pack_digest: "sha256:4372050d9d549808b229b16de315080f9bac427efe9602dabd9b93c4502dbbae",
    });
    expect(catalog.coverage).toMatchObject({
      observed_action_count: 187,
      localized_observed_action_count: 187,
      uncovered_action_ids: [],
      rdps_effect_count: 29,
      localized_rdps_effect_count: 29,
      uncovered_rdps_effect_ids: [],
      battle_imagine_count: 73,
      localized_battle_imagine_count: 73,
      uncovered_battle_imagine_skill_ids: [],
      module_count: 12,
      localized_module_count: 12,
      uncovered_module_ids: [],
      module_effect_count: 21,
      localized_module_effect_count: 21,
      uncovered_module_effect_ids: [],
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
    expect(Object.values(catalog.modules).every(
      (label) => !containsUnsupportedEnglishPresentation(label),
    )).toBe(true);
    expect(Object.values(catalog.module_effects).every(
      (label) => !containsUnsupportedEnglishPresentation(label),
    )).toBe(true);
    expect(catalog.actions["1202"]).toBeUndefined();
    expect(catalog.actions["2900840"]).toBe("Arcane! Divine Reliance");
    expect(catalog.imagines["3948"]).toBe("Battle Imagine - Rorola");
    expect(catalog.modules["5500104"]).toBe("Excellent Attack Module - Premium");
    expect(catalog.module_effects["1110"]).toBe("Strength Boost");
  });

  it("reconciles current public action IDs only through trusted ROOT relationships", () => {
    const catalog = JSON.parse(readFileSync(
      resolve("public/data/bpsr/parse-presentation.en-US.v5.json"),
      "utf8",
    ));
    const observation = JSON.parse(readFileSync(
      resolve("scripts/data/public-parse-action-observation.v1.json"),
      "utf8",
    ));

    expect(catalog.coverage).toMatchObject({
      scope: "captured-public-api-action-ids-with-trusted-root-label-reconciliation",
      observed_action_count: observation.action_ids.length,
      localized_observed_action_count: 248,
      trusted_enrichment_count: 18,
      conflicting_action_ids: [],
      public_action_observation: {
        captured_at: observation.captured_at,
        list_endpoint: observation.list_endpoint,
        report_detail_endpoint_template: observation.report_detail_endpoint_template,
        report_count: observation.report_count,
      },
    });
    expect(catalog.coverage.uncovered_action_ids).toHaveLength(14);
    expect(catalog.coverage.uncovered_action_ids).toContain("700009");
    expect(catalog.actions["122330103"]).toBe("Powerdraw");
    expect(catalog.actions["2220329107"]).toBe("Falcon Strike");
    expect(catalog.actions["2220329109"]).toBe("Falcon Lightning Strike");
    expect(catalog.actions["25524003"]).toBe("Radiance Barrage");
    expect(catalog.actions["150101"]).toBe("Vines' Embrace");
    expect(catalog.actions["3021"]).toBe("Thunderfall Grasp");
    expect(catalog.actions["3022"]).toBe("Flame Roar");
    expect(catalog.actions["3613"]).toBe("Master of Stealth");
    expect(catalog.actions["1222"]).toBe("Phantom Dash");
    expect(catalog.actions["1223"]).toBe("Phantom Dash");
    expect(catalog.actions["1701"]).toBe("Judgment Cut");
    expect(catalog.actions["1901"]).toBe("Halberd's Edge");
    expect(catalog.actions["2002"]).toBe("Universal Recovery Skill");
    expect(catalog.actions["2201"]).toBe("Bullseye");
    expect(catalog.actions["2209"]).toBe("Luminary Bolt");
    expect(catalog.actions["2222"]).toBe("Double Arrow");
    expect(catalog.actions["2224"]).toBe("Lethal Shot");
    expect(catalog.actions["2231"]).toBe("Focus");
    expect(catalog.actions["2234"]).toBe("Radiance Barrage");
    expect(catalog.actions["2235"]).toBe("Deter Shot");
    expect(catalog.actions["2238"]).toBe("Blast Shot");
    expect(catalog.actions["2332"]).toBe("Passion Fury");
    expect(catalog.actions["2406"]).toBe("Vanguard Strike");
    expect(catalog.actions["2453"]).toBe("Sacred Blade");
    expect(catalog.actions["700009"]).toBeUndefined();
    expect(catalog.actions["9999999"]).toBeUndefined();
    expect(Object.values(catalog.actions).every(
      (label) => !containsUnsupportedEnglishPresentation(label),
    )).toBe(true);
  });
});
