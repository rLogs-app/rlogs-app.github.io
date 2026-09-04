import { describe, expect, it } from "vitest";

import type {
  PublicParseCatalogEntry,
  PublicParseReport,
  PublicRunReconciliation,
} from "../../contracts/public-parse";
import {
  activityCategoryId,
  activityLabel,
  filterSearch,
  humanizeAttributionComponent,
  otherSkillDetailsHtml,
  ownedSkillParticipants,
  renderReport,
} from "./parse-browser";

const parse: PublicParseCatalogEntry = {
  report_id: `rpt_${"a".repeat(32)}`,
  run_index: 0,
  created_unix_millis: 1,
  deployment_id: "global",
  region_id: "north-america",
  activity_id: "scene.30120",
  activity_family_id: "stimen-remains",
  scene_id: 30120,
  scene_name: "Stimen Remains - Floor 20",
  difficulty_family: "challenge",
  terminal_state: "completed",
  participant_count: 5,
};

describe("parse search", () => {
  it("resolves grouped Other skill content from a nested click target", () => {
    const template = { innerHTML: "  <article>Grouped details</article>  " };
    const row = { closest: () => null, querySelector: () => template };
    const button = { closest: (selector: string) => selector === ".parse-skill-other-row" ? row : null };
    const nestedTarget = { closest: () => button };

    expect(otherSkillDetailsHtml({ contains: (node) => node === button }, nestedTarget))
      .toBe("<article>Grouped details</article>");
  });

  it("moves only fully proven Encore output to the exact support provider", () => {
    const actors = [
      {
        actor_id: "healer-a", character_id: "1", display_name: "Healer A", actor_kind: "player",
        class_id: 13, class_name: "Beat Performer", specialization_id: 1,
        specialization_name: "Concerto", damage: 10, dps: 1, encounter_dps: 1,
        hps: 10, tps: 0, rdps: null, deaths: 0, abilities: [],
      },
      {
        actor_id: "healer-b", character_id: "2", display_name: "Healer B", actor_kind: "player",
        class_id: 13, class_name: "Beat Performer", specialization_id: 1,
        specialization_name: "Concerto", damage: 20, dps: 2, encounter_dps: 2,
        hps: 20, tps: 0, rdps: null, deaths: 0, abilities: [],
      },
      {
        actor_id: "damage", character_id: "3", display_name: "Damage", actor_kind: "player",
        class_id: 11, class_name: "Marksman", specialization_id: 2,
        specialization_name: "Falconry", damage: 300, dps: 30, encounter_dps: 30,
        hps: 0, tps: 0, rdps: null, deaths: 0,
        abilities: [
          { ability_id: "230401", presentation_name: "Encore", presentation_kind: "support-generated-damage", icon_asset_path: null, casts: 0, hits: 2, critical_hits: 1, damage: 100, effective_damage: 100, healing: 0, effective_healing: 0, shielding: 0 },
          { ability_id: "230501", presentation_name: "Encore", presentation_kind: "support-generated-damage", icon_asset_path: null, casts: 0, hits: 3, critical_hits: 2, damage: 200, effective_damage: 200, healing: 0, effective_healing: 0, shielding: 0 },
        ],
      },
    ];
    const influence = (
      provider: string,
      action: string,
      amount: string,
      events: number,
      criticalHits: number | null,
    ) => ({
      effect_id: "55333",
      attribution_component: "Encore (55333) standalone generated damage (actions 230401/230501)",
      complete_effect: false, provider_actor_id: provider, recipient_actor_id: "damage",
      affected_ability_id: action, target_actor_id: "boss", first_observed_micros: 1,
      last_observed_micros: 2, damage_event_count: events,
      critical_hit_count: criticalHits, observed_damage: amount,
      exact_integer_delta: amount, exact_rational_deltas: [], attributed_rdps: amount,
      damage_context_complete: true,
    });
    const projected = ownedSkillParticipants(
      actors,
      [
        influence("healer-a", "230401", "100", 2, null),
        influence("healer-b", "230501", "200", 3, null),
      ],
      [{ effect_id: "55333", presentation_name: "Encore", presentation_kind: "status", icon_asset_path: null }],
    );

    expect(projected.find((actor) => actor.actor_id === "damage")?.abilities).toEqual([]);
    expect(projected.find((actor) => actor.actor_id === "healer-a")?.abilities?.[0]).toMatchObject({
      presentation_name: "Encore", damage: 100, hits: 2, critical_hits: 1,
    });
    expect(projected.find((actor) => actor.actor_id === "healer-b")?.abilities?.[0]).toMatchObject({
      presentation_name: "Encore", damage: 200, hits: 3, critical_hits: 2,
    });
  });

  it("keeps Encore on the wire recipient when the component or provider is not exact", () => {
    const actor = {
      actor_id: "damage", character_id: "3", display_name: "Damage", actor_kind: "player",
      class_id: 11, class_name: "Marksman", specialization_id: 2,
      specialization_name: "Falconry", damage: 100, dps: 10, encounter_dps: 10,
      hps: 0, tps: 0, rdps: null, deaths: 0,
      abilities: [{ ability_id: "230401", presentation_name: "Encore", presentation_kind: null, icon_asset_path: null, casts: 0, hits: 2, critical_hits: 1, damage: 100, effective_damage: 100, healing: 0, effective_healing: 0, shielding: 0 }],
    };
    const unsafeInfluence = {
      effect_id: "55333", attribution_component: "Encore unresolved damage",
      complete_effect: false, provider_actor_id: "missing-healer", recipient_actor_id: "damage",
      affected_ability_id: "230401", target_actor_id: "boss", first_observed_micros: 1,
      last_observed_micros: 2, damage_event_count: 2, critical_hit_count: null,
      observed_damage: "100", exact_integer_delta: "100", exact_rational_deltas: [],
      attributed_rdps: "100", damage_context_complete: true,
    };

    const projected = ownedSkillParticipants([actor], [unsafeInfluence], []);
    expect(projected[0]?.abilities).toEqual(actor.abilities);
  });

  it("does not move a partially proven Encore action", () => {
    const actor = {
      actor_id: "damage", character_id: "3", display_name: "Damage", actor_kind: "player",
      class_id: 11, class_name: "Marksman", specialization_id: 2,
      specialization_name: "Falconry", damage: 100, dps: 10, encounter_dps: 10,
      hps: 0, tps: 0, rdps: null, deaths: 0,
      abilities: [{ ability_id: "230401", presentation_name: "Encore", presentation_kind: "support-generated-damage", icon_asset_path: null, casts: 0, hits: 2, critical_hits: 1, damage: 100, effective_damage: 100, healing: 0, effective_healing: 0, shielding: 0 }],
    };
    const projected = ownedSkillParticipants([actor], [], []);
    expect(projected[0]?.abilities?.[0]?.damage).toBe(100);
  });

  it("presents the fixed broad activity categories", () => {
    expect(activityLabel("stimens")).toBe("Stimens");
    expect(activityLabel("solo-content")).toBe("Solo Content");
    expect(activityCategoryId(parse)).toBe("stimens");
  });

  it("removes internal effect and action identifiers from attribution labels", () => {
    expect(humanizeAttributionComponent(
      "Encore (55333) standalone-generated-damage (Actions 230401/230501)",
    )).toBe("Encore standalone generated damage");
  });

  it("matches every word across scene and region fields", () => {
    expect(filterSearch([parse], "stimen america")).toEqual([parse]);
    expect(filterSearch([parse], "stimen europe")).toEqual([]);
  });

  it("can search exact report IDs", () => {
    expect(filterSearch([parse], parse.report_id)).toEqual([parse]);
  });

  it("renders server-backed timeline, skill, rDPS, and evidence analysis", () => {
    const reportId = parse.report_id;
    const runGroupId = `run_${"b".repeat(32)}`;
    const participant = {
      actor_id: "11",
      character_id: "3296036",
      display_name: "MarieRose",
      actor_kind: "player",
      class_id: 4,
      class_name: "Marksman",
      specialization_id: 2,
      specialization_name: "Falconry",
      damage: 900,
      dps: 90,
      encounter_dps: 90,
      hps: 0,
      tps: 0,
      rdps: null,
      deaths: 1,
      death_seconds: [8],
      abilities: [
        {
          ability_id: "2220329107",
          presentation_name: "Falcon Strike",
          presentation_kind: "skill",
          icon_asset_path: "/assets/skills/falcon-strike.webp",
          presentation_recount_group_id: "falcon-strike",
          presentation_recount_group_name: "Falcon Strike",
          casts: 0,
          hits: 4,
          critical_hits: 1,
          damage: 600,
          effective_damage: 600,
          healing: 0,
          effective_healing: 0,
          shielding: 0,
        },
        {
          ability_id: "2233",
          presentation_name: "Falcon Strike",
          presentation_kind: "skill",
          icon_asset_path: "/assets/skills/falcon-strike.webp",
          presentation_recount_group_id: "falcon-strike",
          presentation_recount_group_name: "Falcon Strike",
          casts: 5,
          hits: 0,
          critical_hits: 0,
          damage: 0,
          effective_damage: 0,
          healing: 0,
          effective_healing: 0,
          shielding: 0,
        },
        {
          ability_id: "2220329109",
          presentation_name: "Falcon Lightning Strike",
          presentation_kind: "skill",
          icon_asset_path: "/assets/skills/falcon-lightning-strike.webp",
          casts: 1,
          hits: 2,
          critical_hits: 1,
          damage: 300,
          effective_damage: 300,
          healing: 0,
          effective_healing: 0,
          shielding: 0,
        },
      ],
      series: [
        { second: 1, damage: 300, effective_healing: 0, damage_taken: 0 },
        { second: 2, damage: 600, effective_healing: 0, damage_taken: 0 },
      ],
    };
    participant.abilities.push(...Array.from({ length: 7 }, (_, index) => ({
      ability_id: `grouped-${index + 1}`,
      presentation_name: `Grouped Skill ${index + 1}`,
      presentation_kind: "skill",
      icon_asset_path: `/assets/skills/grouped-${index + 1}.webp`,
      casts: index + 1,
      hits: (index + 1) * 2,
      critical_hits: index,
      damage: 7 - index,
      effective_damage: 7 - index,
      healing: 0,
      effective_healing: 0,
      shielding: 0,
    })));
    const report: PublicParseReport = {
      schema_version: 10,
      report_id: reportId,
      visibility: "public",
      created_unix_millis: 1,
      game_plugin_id: "blue-protocol-star-resonance",
      deployment_id: "global",
      region_id: "global",
      world_id: null,
      client_build: "24687926",
      protocol_pack_digest: "pack",
      verification: {
        tier: "replayed",
        artifact_sha256: "artifact",
        canonical_content_sha256: "canonical",
        event_count: 12,
        privacy_policy_digest: "privacy",
      },
      runs: [
        {
          run_index: 0,
          run_group_id: runGroupId,
          correlation_method: "exact_instance_id",
          activity_id: "scene.30120",
          activity_family_id: "stimen-remains",
          scene_id: 30120,
          scene_name: "Stimen Remains - Floor 20",
          difficulty_family: "challenge",
          difficulty_tier: 20,
          terminal_state: "completed",
          total_run_time_micros: 10_000_000,
          game_time_micros: 10_000_000,
          active_combat_micros: 10_000_000,
          true_time_micros: 10_000_000,
          retry_count: 0,
          boss_retry_count: 0,
          rdps_status: "reconciled",
          data_gap_count: 0,
          authoritative_start: true,
          authoritative_completion: true,
          submission_disposition: "ranked",
          combat_loadout_phases: [
            {
              character_id: "3296036",
              display_name: "MarieRose",
              observed_micros: 2_000_000,
              run_elapsed_micros: 1_500_000,
              game_time_millis: 2_000,
              segment_index: 0,
              encounter_index: 0,
              attempt_number: 1,
              in_active_combat: true,
              class_id: 4,
              class_name: "Marksman",
              specialization_id: 2,
              specialization_name: "Falconry",
              equipped_skill_ids: ["2900840"],
              equipped_imagines: [],
              equipment_count: 11,
              equipped_module_count: 8,
              talent_count: 12,
            },
            {
              character_id: "3296036",
              display_name: "MarieRose",
              observed_micros: 7_000_000,
              run_elapsed_micros: 6_500_000,
              game_time_millis: 7_000,
              segment_index: 0,
              encounter_index: null,
              attempt_number: null,
              in_active_combat: false,
              class_id: 2,
              class_name: "Stormblade",
              specialization_id: 1,
              specialization_name: "Moonstrike",
              equipped_skill_ids: [],
              equipped_imagines: [],
              equipment_count: 11,
              equipped_module_count: 8,
              talent_count: 12,
            },
          ],
          segments: [
            {
              index: 0,
              kind: "boss",
              wall_time_micros: 10_000_000,
              active_combat_micros: 10_000_000,
              attempt_count: 1,
              retry_count: 0,
            },
          ],
          participants: [participant],
        },
      ],
    };
    const reconciliation: PublicRunReconciliation = {
      schema_version: 8,
      reconciliation_id: `rec_${"c".repeat(32)}`,
      run_group_id: runGroupId,
      status: "reconciled",
      canonical_spine: {
        report_id: reportId,
        run_index: 0,
        artifact_sha256: "artifact",
        authoritative_start: true,
        authoritative_completion: true,
        data_gap_count: 0,
        event_count: 12,
      },
      reports: [
        {
          report_id: reportId,
          run_index: 0,
          artifact_sha256: "artifact",
          protocol_pack_digest: "pack",
          created_unix_millis: 1,
          canonical_spine: true,
          local_profile_witnesses: [],
          local_state_witnesses: [],
        },
      ],
      characters: [],
      participant_character_count: 1,
      local_vantage_character_count: 1,
      complete_local_vantage_coverage: true,
      state_replay_readiness: "full_coverage_ready",
      state_replay_blockers: [],
      reconciled_participants: [
        {
          ...participant,
          rdps_damage: 950,
          contribution_given: 100,
          contribution_received: 50,
          rdps_incomplete: false,
        },
      ],
      conservation: {
        raw_damage: 900,
        rdps_damage: 950,
        contribution_given: 100,
        contribution_received: 50,
        conserved: true,
      },
      rdps_effects: [
        {
          effect_id: "3003052",
          presentation_name: "Harmony Grace",
          presentation_kind: "status",
          icon_asset_path: null,
        },
      ],
      rdps_influences: [
        {
          effect_id: "3003052",
          attribution_component: "damage-amplification",
          complete_effect: true,
          provider_actor_id: "22",
          recipient_actor_id: "11",
          affected_ability_id: "2900840",
          target_actor_id: "99",
          first_observed_micros: 1_000_000,
          last_observed_micros: 2_000_000,
          damage_event_count: 2,
          observed_damage: "900",
          exact_integer_delta: "50",
          exact_rational_deltas: [],
          attributed_rdps: "50",
          damage_context_complete: true,
        },
      ],
      attribution_replay_completed: true,
    };

    const html = renderReport(report, 0, reconciliation, null);
    expect(html).toContain("Run timeline");
    expect(html).toContain("Skill contribution");
    expect(html).toContain("Falcon Strike");
    expect(html).toContain("5 casts · 4 hits");
    expect(html).toContain("Falcon Lightning Strike");
    expect(html).toContain("Other (2)");
    expect(html).toContain("data-skill-other-trigger");
    expect(html).toContain("View 2 other skill details for MarieRose");
    expect(html).toContain("Other skills · MarieRose");
    expect(html).toContain("Grouped Skill 7");
    expect(html).toContain("rDPS calculations");
    expect(html).toContain("Harmony Grace");
    expect(html).toContain("Evidence coverage");
    expect(html).toContain("Cross-vantage reconciled");
    expect(html).toContain("Time-gated profile evidence");
    expect(html).toContain("Marksman / Falconry");
    expect(html).toContain("Stormblade / Moonstrike");
    expect(html).toContain("Between encounters");

    const legacyReport = structuredClone(report);
    for (const ability of legacyReport.runs[0]!.participants[0]!.abilities ?? []) {
      ability.casts = 0;
    }
    const legacyHtml = renderReport(legacyReport, 0, null, null);
    expect(legacyHtml).toContain("Casts not observed · 4 hits");
    expect(legacyHtml).not.toContain("0 casts · 4 hits");
  });
});
