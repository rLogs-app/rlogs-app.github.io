import { describe, expect, it } from "vitest";

import type {
  PublicParseCatalogEntry,
  PublicParseReport,
  PublicRunReconciliation,
} from "../../contracts/public-parse";
import { filterSearch, humanizeAttributionComponent, renderReport } from "./parse-browser";

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
          ability_id: "2900840",
          presentation_name: "Falcon Strike",
          presentation_kind: "skill",
          icon_asset_path: "/assets/skills/falcon-strike.webp",
          casts: 3,
          hits: 6,
          critical_hits: 2,
          damage: 900,
          effective_damage: 900,
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
    expect(html).toContain("rDPS calculations");
    expect(html).toContain("Harmony Grace");
    expect(html).toContain("Evidence coverage");
    expect(html).toContain("Cross-vantage reconciled");
    expect(html).toContain("Time-gated profile evidence");
    expect(html).toContain("Marksman / Falconry");
    expect(html).toContain("Stormblade / Moonstrike");
    expect(html).toContain("Between encounters");
  });
});
