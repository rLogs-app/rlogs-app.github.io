import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type {
  PublicParseCatalogEntry,
  PublicParseReport,
  PublicRunReconciliation,
} from "../../contracts/public-parse";
import { bundledMessageCatalogs, createMessageResolver } from "../../localization/messages";
import type { ParsePresentationCatalog } from "./parse-presentation";
import {
  activityCategoryId,
  activityLabel,
  catalogSemanticFacetsAuthorized,
  filterSearch,
  humanizeAttributionComponent,
  niceTimelineScaleMaximum,
  otherSkillDetailsHtml,
  ownedSkillParticipants,
  renderReport,
  renderCatalogEntry,
  sortPartyParticipants,
  timelineDamageAtSecond,
  hasCompleteRdpsBuckets,
  partyLoadoutSummaries,
  renderPartyLoadouts,
  renderTimeline,
  rollingBucketSeries,
  rollingTimelineSamples,
  selectCanonicalGraph,
  timelineCumulativeRateLabel,
  timelineCursorFrame,
  timelineBoundaryElapsedMicros,
  timelineClosestBoundary,
  timelineMaximumBoundary,
  clampTimelineViewport,
  timelineDamageRatesAtSecond,
  timelineRateVariantsAtSecond,
  timelineRangeRates,
  timelineRdpsAtSecond,
  timelineRdpsRateVariantsAtSecond,
  timelineValueAtSecond,
  timelineVisibleTotalAtSecond,
  timelineVisibleRangeTotal,
  timelineViewportScaleMaximum,
} from "./parse-browser";

const load = <T>(name: string): T => JSON.parse(
  readFileSync(new URL(`../../../public/fixtures/${name}`, import.meta.url), "utf8"),
) as T;

const siteStyles = readFileSync(new URL("../../styles/site.css", import.meta.url), "utf8");
const localizationDigest = "sha256:4372050d9d549808b229b16de315080f9bac427efe9602dabd9b93c4502dbbae";
const catalogPresentation: ParsePresentationCatalog = {
  schema_version: 3,
  locale: "en-US",
  deployment_id: "global",
  game_build: "24687926",
  protocol_pack_digest: localizationDigest,
  source: "test",
  actions: {},
  effects: {},
  imagines: { "3948": "Battle Imagine - Rorola" },
};

const parse: PublicParseCatalogEntry = {
  report_id: `rpt_${"a".repeat(32)}`,
  report_ids: [`rpt_${"a".repeat(32)}`],
  run_index: 0,
  run_group_id: `run_${"b".repeat(32)}`,
  contribution_count: 1,
  distinct_submitter_count: 1,
  local_profile_witness_character_count: 1,
  attribution_reconciliation_status: "single_vantage",
  created_unix_millis: 1,
  deployment_id: "global",
  client_build: "24687926",
  protocol_pack_digest: localizationDigest,
  region_id: "north-america",
  activity_id: "scene.30120",
  activity_family_id: "stimen-remains",
  scene_id: 30120,
  scene_name: "Stimen Remains - Floor 20",
  difficulty_family: "challenge",
  difficulty_tier: 20,
  terminal_state: "completed",
  participant_count: 5,
};

describe("parse search", () => {
  it("keeps party loadout styles outside the party metric value selector", () => {
    expect(siteStyles).toMatch(
      /\.parse-party-metric strong\s*\{[^{}]*text-align:\s*right;\s*\}\s*\.party-loadouts\s*\{/u,
    );
  });

  it("keeps timeline styles outside the evidence blocker selector", () => {
    expect(siteStyles).toMatch(/\.evidence-blockers ul\s*\{\s*margin:\s*6px 0 0;\s*\}\s*\.combat-timeline\s*\{/u);
  });

  it("keeps the stylesheet brace topology balanced", () => {
    expect(siteStyles.match(/\{/gu)?.length).toBe(siteStyles.match(/\}/gu)?.length);
  });

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
        hps: 10, tps: 0, rdps: null, deaths: 0, death_seconds: [], series: [], abilities: [],
      },
      {
        actor_id: "healer-b", character_id: "2", display_name: "Healer B", actor_kind: "player",
        class_id: 13, class_name: "Beat Performer", specialization_id: 1,
        specialization_name: "Concerto", damage: 20, dps: 2, encounter_dps: 2,
        hps: 20, tps: 0, rdps: null, deaths: 0, death_seconds: [], series: [], abilities: [],
      },
      {
        actor_id: "damage", character_id: "3", display_name: "Damage", actor_kind: "player",
        class_id: 11, class_name: "Marksman", specialization_id: 2,
        specialization_name: "Falconry", damage: 300, dps: 30, encounter_dps: 30,
        hps: 0, tps: 0, rdps: null, deaths: 0, death_seconds: [], series: [],
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
      hps: 0, tps: 0, rdps: null, deaths: 0, death_seconds: [], series: [],
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

  it("moves the packet-proven portion of a partial Encore action", () => {
    const actor = {
      actor_id: "damage", character_id: "3", display_name: "Damage", actor_kind: "player",
      class_id: 11, class_name: "Marksman", specialization_id: 2,
      specialization_name: "Falconry", damage: 100, dps: 10, encounter_dps: 10,
      hps: 0, tps: 0, rdps: null, deaths: 0, death_seconds: [], series: [],
      abilities: [{ ability_id: "230401", presentation_name: "Encore", presentation_kind: "support-generated-damage", icon_asset_path: null, casts: 0, hits: 2, critical_hits: 1, damage: 100, effective_damage: 100, healing: 0, effective_healing: 0, shielding: 0 }],
    };
    const healer = {
      ...actor, actor_id: "healer", character_id: "4", display_name: "Healer",
      class_id: 13, class_name: "Beat Performer", specialization_id: 1,
      specialization_name: "Concerto", abilities: [
        { ...actor.abilities[0]!, damage: 30, effective_damage: 30, hits: 1, critical_hits: 0 },
      ],
    };
    const influence = {
      effect_id: "55333", attribution_component: "Encore (55333) standalone generated damage (actions 230401/230501)",
      complete_effect: false, provider_actor_id: "healer", recipient_actor_id: "damage",
      affected_ability_id: "230401", target_actor_id: "boss", first_observed_micros: 1,
      last_observed_micros: 2, damage_event_count: 1, critical_hit_count: null,
      observed_damage: "60", exact_integer_delta: "60", exact_rational_deltas: [],
      attributed_rdps: "60", damage_context_complete: true,
    };
    const projected = ownedSkillParticipants([actor, healer], [influence], []);
    expect(projected.find((entry) => entry.actor_id === "damage")?.abilities?.[0]).toMatchObject({
      damage: 40, hits: 1, critical_hits: 0,
    });
    expect(projected.find((entry) => entry.actor_id === "healer")?.abilities?.[0]).toMatchObject({
      presentation_name: "Encore", damage: 90, hits: 2, critical_hits: 1,
    });
    expect(projected.find((entry) => entry.actor_id === "healer")?.abilities).toHaveLength(1);
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
    expect(filterSearch([parse], "stimen america", catalogPresentation, 7)).toEqual([parse]);
    expect(filterSearch([parse], "stimen europe", catalogPresentation, 7)).toEqual([]);
  });

  it("exposes catalog semantics only for an exact current presentation identity", () => {
    const exact = renderCatalogEntry(parse, catalogPresentation, 7);
    expect(exact).toContain("Stimen Remains - Floor 20");
    expect(exact).toContain("Challenge 20");

    const wrong = { ...parse, protocol_pack_digest: `sha256:${"f".repeat(64)}` };
    for (const [candidate, schema] of [[wrong, 7], [parse, 6]] as const) {
      const html = renderCatalogEntry(candidate, catalogPresentation, schema);
      expect(html).toContain("Scene #30120");
      expect(html).toContain("Tier 20");
      expect(html).not.toContain("Stimen");
      expect(html).not.toContain("Challenge");
      expect(filterSearch([candidate], "stimen", catalogPresentation, schema)).toEqual([]);
      expect(filterSearch([candidate], "30120 global", catalogPresentation, schema)).toEqual([candidate]);
    }
  });

  it("withholds semantic facets for mixed catalog identities", () => {
    const wrong = { ...parse, protocol_pack_digest: `sha256:${"f".repeat(64)}` };
    expect(catalogSemanticFacetsAuthorized([parse], 1, catalogPresentation, 7)).toBe(true);
    expect(catalogSemanticFacetsAuthorized([parse], 2, catalogPresentation, 7)).toBe(false);
    expect(catalogSemanticFacetsAuthorized([parse, wrong], 2, catalogPresentation, 7)).toBe(false);
    expect(catalogSemanticFacetsAuthorized([parse], 1, catalogPresentation, 6)).toBe(false);
  });

  it("can search exact report IDs", () => {
    expect(filterSearch([parse], parse.report_id)).toEqual([parse]);
  });

  it("defaults party ordering to aDPS and resolves death markers onto the damage line", () => {
    const participant = (actorId: string, adps: number) => ({
      actor_id: actorId,
      character_id: actorId,
      display_name: actorId,
      actor_kind: "player",
      class_id: null,
      class_name: null,
      specialization_id: null,
      specialization_name: null,
      damage: adps * 10,
      dps: adps / 2,
      encounter_dps: adps,
      hps: 0,
      tps: 0,
      rdps: null,
      deaths: 0, death_seconds: [],
      abilities: [],
      series: [],
    });
    expect(sortPartyParticipants([participant("low", 10), participant("high", 30)]).map((actor) => actor.actor_id))
      .toEqual(["high", "low"]);
    expect(timelineDamageAtSecond([
      { second: 8, damage: 250, effective_healing: 0, damage_taken: 0 },
      { second: 8, damage: 50, effective_healing: 0, damage_taken: 0 },
    ], 8)).toBe(300);
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
    const runTimeline = {
      schema_version: 3 as const,
      source: "single_report" as const,
      canonical_report_id: reportId,
      canonical_run_index: 0,
      contributing_report_ids: [reportId],
      duration_micros: 10_000_000,
      time_basis: "run_elapsed" as const,
      series_bucket_micros: 1_000_000,
      coverage: { authoritative_start: true, authoritative_completion: true, data_gap_count: 0, gap_timing: "no_known_gaps" as const },
      rate_clock: Array.from({ length: 11 }, (_, second) => ({ second, edps_elapsed_micros: (second + 1) * 1_000_000, adps_elapsed_micros: (second + 1) * 1_000_000 })),
      rate_clock_complete: true,
      participant_tracks: [{ actor_id: participant.actor_id, character_id: participant.character_id, observed_character_key: null, display_name: participant.display_name, canonical_participant_index: 0, series_point_count: participant.series.length }],
      death_markers: [{ actor_id: participant.actor_id, at_micros: 8_000_000, precision: "one_second_bucket" as const }],
      loadout_markers: [{ character_id: participant.character_id, at_micros: 1_500_000, phase_index: 0, source_report_id: reportId }],
      rdps_influence_spans: [{ influence_index: 0, time_basis: "run_elapsed" as const, start_micros: 1_000_000, end_micros: 2_000_000, complete_lifecycle: true }],
      omitted: { participant_tracks: 0, series_points: 0, death_markers: 0, loadout_markers: 0, rdps_influence_spans: 0, rate_clock_points: 0 },
    };
    const report: PublicParseReport = {
      schema_version: 15,
      projection_revision: 6,
      report_id: reportId,
      visibility: "public",
      created_unix_millis: 1,
      game_plugin_id: "blue-protocol-star-resonance",
      deployment_id: "global",
      region_id: "global",
      world_id: null,
      client_build: "24687926",
      protocol_pack_digest: localizationDigest,
      verification: {
        tier: "replayed",
        artifact_sha256: "artifact",
        canonical_content_sha256: "canonical",
        event_count: 12,
        privacy_policy_digest: "privacy",
      },
      submission_provenance: { submitter_id: null, authentication: "device_token" },
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
              module_snapshot_disposition: "complete",
              equipped_modules: [],
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
              module_snapshot_disposition: "complete",
              equipped_modules: [],
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
          timeline: runTimeline,
        },
      ],
    };
    const reconciliation: PublicRunReconciliation = {
      schema_version: 17,
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
          deployment_id: "global",
          client_build: "24687926",
          protocol_pack_digest: localizationDigest,
          created_unix_millis: 1,
          canonical_spine: true,
          local_profile_witnesses: [],
          local_state_witnesses: [],
          combat_loadout_phases: [],
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
      timeline: { ...runTimeline, source: "reconciled_canonical_spine" },
    };

    const presentation: ParsePresentationCatalog = {
      schema_version: 3,
      locale: "en-US",
      deployment_id: "global",
      game_build: "24687926",
      protocol_pack_digest: localizationDigest,
      source: "test",
      actions: {
        "2900840": "Arcane! Divine Reliance",
        "2220329107": "Canonical Falcon Strike",
      },
      effects: {},
      imagines: { "3948": "Battle Imagine - Rorola" },
    };
    const html = renderReport(report, 0, reconciliation, null, presentation);
    expect(html).toContain("Combat timeline");
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

    expect(html.match(/class="party-loadouts"/gu)).toHaveLength(1);
    const viewedWrongDigest = structuredClone(report);
    viewedWrongDigest.protocol_pack_digest = "sha256:viewed-pov-does-not-own-reconciled-presentation";
    viewedWrongDigest.runs[0]!.scene_name = "Viewed derived scene";
    viewedWrongDigest.runs[0]!.activity_id = "viewed.derived-activity";
    viewedWrongDigest.runs[0]!.difficulty_family = "viewed-derived-difficulty";
    viewedWrongDigest.runs[0]!.combat_loadout_phases![0]!.class_name = "Viewed Derived Class";
    viewedWrongDigest.runs[0]!.combat_loadout_phases![0]!.specialization_name = "Viewed Derived Specialization";
    const viewedWrongDigestHtml = renderReport(viewedWrongDigest, 0, reconciliation, null, presentation);
    expect(viewedWrongDigestHtml).toContain("Canonical Falcon Strike");
    expect(viewedWrongDigestHtml).not.toContain("Viewed derived scene");
    expect(viewedWrongDigestHtml).not.toContain("viewed.derived-activity");
    expect(viewedWrongDigestHtml).not.toContain("viewed-derived-difficulty");
    expect(viewedWrongDigestHtml).not.toContain("Viewed Derived Class");
    expect(viewedWrongDigestHtml).not.toContain("Viewed Derived Specialization");
    expect(viewedWrongDigestHtml).toContain("Scene #30120");
    expect(viewedWrongDigestHtml).toContain("Tier 20");
    const wrongReconciliationDigest = structuredClone(reconciliation);
    wrongReconciliationDigest.reports[0]!.protocol_pack_digest = "sha256:wrong-canonical-authority";
    const wrongReconciliationHtml = renderReport(report, 0, wrongReconciliationDigest, null, presentation);
    expect(wrongReconciliationHtml).toContain("Unlocalized combat action #2220329107");
    expect(wrongReconciliationHtml).not.toContain("Canonical Falcon Strike");
    const singlePovHtml = renderReport(report, 0, null, null, presentation);
    expect(singlePovHtml).toContain("Arcane! Divine Reliance");
    const wrongDigest = structuredClone(report);
    wrongDigest.protocol_pack_digest = "sha256:wrong-localization-authority";
    wrongDigest.runs[0]!.activity_id = "derived.secret-activity";
    wrongDigest.runs[0]!.difficulty_family = "derived-secret-difficulty";
    const wrongDigestHtml = renderReport(wrongDigest, 0, null, null, presentation);
    expect(wrongDigestHtml).toContain("Unlocalized combat action #2900840");
    expect(wrongDigestHtml).not.toContain("Arcane! Divine Reliance");
    expect(wrongDigestHtml).not.toContain("Falcon Strike");
    expect(wrongDigestHtml).not.toContain("Stimen Remains - Floor 20");
    expect(wrongDigestHtml).not.toContain("derived.secret-activity");
    expect(wrongDigestHtml).not.toContain("derived-secret-difficulty");
    expect(wrongDigestHtml).not.toContain("Derived Secret Difficulty");
    expect(wrongDigestHtml).toContain("Scene #30120");
    expect(wrongDigestHtml).toContain("Tier 20");
    expect(wrongDigestHtml).toContain("MarieRose");
    expect(wrongDigestHtml).not.toContain("Marksman / Falconry");
    expect(wrongDigestHtml).toContain("Class #4 / Specialization #2");
    const missingDigest = structuredClone(report);
    missingDigest.protocol_pack_digest = undefined;
    missingDigest.runs[0]!.activity_id = "derived.missing-digest-activity";
    missingDigest.runs[0]!.difficulty_family = "derived-missing-digest-difficulty";
    const missingDigestHtml = renderReport(missingDigest, 0, null, null, presentation);
    expect(missingDigestHtml).toContain("Unlocalized combat action #2900840");
    expect(missingDigestHtml).not.toContain("Arcane! Divine Reliance");
    expect(missingDigestHtml).not.toContain("derived.missing-digest-activity");
    expect(missingDigestHtml).not.toContain("derived-missing-digest-difficulty");
    expect(missingDigestHtml).not.toContain("Derived Missing Digest Difficulty");
    expect(missingDigestHtml).toContain("Scene #30120");
    expect(missingDigestHtml).toContain("Tier 20");
    expect(missingDigestHtml).toContain("MarieRose");
    expect(missingDigestHtml).not.toContain("Marksman / Falconry");
    expect(missingDigestHtml).toContain("Class #4 / Specialization #2");
    expect(html).toContain("Evidence coverage");
    expect(html).toContain("Cross-vantage reconciled");
    expect(html).toContain("Marksman / Falconry");
    expect(html).toContain(`Run ID</small><code>${runGroupId}`);
    expect(html).toContain(`Report ID</small><code>${reportId}`);
    expect(html).toContain('data-party-sort="adps" aria-sort="descending"');
    expect(html).toContain('data-party-sort="effectiveHealing"');
    expect(html).toContain('data-party-sort="damageTaken"');
    expect(html).toContain('data-participant-toggle="0"');
    expect(html).toContain('data-participant="0"');
    expect(html).toContain("timeline-marker death");

    const legacyReport = structuredClone(report);
    for (const ability of legacyReport.runs[0]!.participants[0]!.abilities ?? []) {
      ability.casts = 0;
    }
    const legacyHtml = renderReport(legacyReport, 0, null, null);
    expect(legacyHtml).toContain("Casts not observed · 4 hits");
    expect(legacyHtml).not.toContain("0 casts · 4 hits");
  });
});

describe("canonical timeline selection", () => {
  const report = load<PublicParseReport>("parse-report.v1.json");
  const reconciliation = load<PublicRunReconciliation>("parse-reconciliation.v1.json");
  const conservedReconciliation = (): PublicRunReconciliation => {
    const selected = structuredClone(reconciliation);
    selected.schema_version = 18;
    selected.rdps_status = "complete";
    selected.status = "reconciled";
    selected.attribution_replay_completed = true;
    selected.reconciled_participants = report.runs[0].participants.map((participant) => ({
      ...structuredClone(participant),
      rdps_damage: participant.damage,
      contribution_given: 0,
      contribution_received: 0,
      rdps_incomplete: false,
    }));
    const damage = selected.reconciled_participants.reduce((sum, participant) => sum + participant.damage, 0);
    selected.conservation = { raw_damage: damage, rdps_damage: damage, contribution_given: 0, contribution_received: 0, conserved: true };
    selected.timeline = {
      ...selected.timeline!,
      source: "reconciled_canonical_spine",
      participant_tracks: report.runs[0].timeline!.participant_tracks,
    };
    return selected;
  };

  it("falls back to one canonical report instead of summing POVs", () => {
    const selected = selectCanonicalGraph(report.runs[0], reconciliation);
    expect(selected.reconciled).toBe(false);
    expect(selected.participants).toBe(report.runs[0].participants);
  });

  it.each([
    ["deployment_id_mismatch:2", "different game deployments", "one exact deployment"],
    ["client_build_mismatch:2", "different game builds", "one exact client build"],
    ["protocol_pack_digest_mismatch:2", "different protocol packs", "different protocol identities"],
  ])("explains blocked synced POV identity evidence for %s", (blocker, cause, boundary) => {
    const blocked = structuredClone(reconciliation);
    blocked.state_replay_readiness = "blocked";
    blocked.state_replay_blockers = [blocker];
    blocked.reports[1]!.client_build = "24687927";
    const html = renderReport(report, 0, blocked, null);

    expect(html).toContain("Cross-vantage blocked");
    expect(html).toContain("Synced POVs cannot be merged");
    expect(html).toContain(cause);
    expect(html).toContain(boundary);
    expect(html).toContain("representative server replay remains shown");
    expect(html).toContain("damage from the POV logs was not combined");
    expect(html).toContain("POV merge blocked");
    expect(html).not.toContain("More evidence needed");
    expect(html).toContain("Global deployment · build 24687926 · protocol demo-pack");
    expect(html).toContain("Global deployment · build 24687927 · protocol demo-pack");
    expect(html).toContain(reconciliation.reports[0]!.report_id);
    expect(html).toContain(reconciliation.reports[1]!.report_id);
  });

  it("labels missing schema 16 source identity as legacy instead of inventing it", () => {
    const legacy = structuredClone(reconciliation);
    legacy.schema_version = 16;
    legacy.reports.forEach((source) => {
      delete source.deployment_id;
      delete source.client_build;
    });
    const html = renderReport(report, 0, legacy, null);

    expect(html).toContain("Runtime identity unavailable (legacy reconciliation)");
    expect(html).not.toContain("undefined deployment");
  });

  it("keeps same-run blocked Swift Vortex audit evidence but hides wrong-run evidence", () => {
    const blocked = structuredClone(reconciliation);
    blocked.state_replay_readiness = "blocked";
    blocked.state_replay_blockers = ["provider_identity_unresolved:1"];
    blocked.swift_vortex_candidate_audit = {
      schema_version: 1,
      effect_id: 2110060,
      candidate_status_event_count: 6,
      exact_application_transition_count: 3,
      exact_paired_receipt_count: 2,
      distinct_provider_entity_count: 1,
      distinct_recipient_entity_count: 2,
      incomplete_application_count: 1,
      incomplete_removal_count: 0,
      identity_mismatch_event_count: 1,
      blockers: { provider_identity_unresolved: 1 },
      magnitude_gate_satisfied: false,
      production_attribution_enabled: false,
      receipts: [],
    };

    const sameRunHtml = renderReport(report, 0, blocked, null);
    expect(sameRunHtml).toContain("Swift Vortex candidate evidence");
    expect(sameRunHtml).toContain("6 status events / 2 exact paired receipts");
    expect(sameRunHtml).toContain("Production attribution remains disabled");

    blocked.run_group_id = `run_${"2".repeat(32)}`;
    const wrongRunHtml = renderReport(report, 0, blocked, null);
    expect(wrongRunHtml).not.toContain("Swift Vortex candidate evidence");
    expect(wrongRunHtml).not.toContain("6 status events / 2 exact paired receipts");
  });

  it("uses reconciled participants only after a conserved replay completes", () => {
    const reconciled = conservedReconciliation();
    expect(selectCanonicalGraph(report.runs[0], reconciled).participants).toBe(reconciled.reconciled_participants);
    expect(selectCanonicalGraph(report.runs[0], { ...reconciled, attribution_replay_completed: false }).reconciled).toBe(false);
    expect(selectCanonicalGraph(report.runs[0], { ...reconciled, conservation: { ...reconciled.conservation!, conserved: false } }).reconciled).toBe(false);
    const mismatched = { ...reconciled, timeline: { ...reconciled.timeline!, participant_tracks: [
      { ...report.runs[0].timeline!.participant_tracks[0], actor_id: "mismatched" },
    ] } } satisfies PublicRunReconciliation;
    expect(selectCanonicalGraph(report.runs[0], mismatched).reconciled).toBe(false);
  });

  it("uses the canonical timeline Game-time clock for reconciled totals regardless of viewed POV duration", () => {
    const viewed = structuredClone(report);
    viewed.runs[0].game_time_micros = 5_000_000;
    viewed.runs[0].rdps_status = "viewed_pov_status_must_not_leak";
    const reconciled = conservedReconciliation();
    const finalGameTime = reconciled.timeline!.rate_clock!.at(-1)!.edps_elapsed_micros;
    const expectedTeam = reconciled.conservation!.rdps_damage * 1_000_000 / finalGameTime;
    const first = reconciled.reconciled_participants[0]!;
    const expectedFirst = first.rdps_damage! * 1_000_000 / finalGameTime;

    const selection = selectCanonicalGraph(viewed.runs[0], reconciled);
    const html = renderReport(viewed, 0, reconciled);
    expect(selection.reconciled).toBe(true);
    expect(selection.rdpsGameTimeMicros).toBe(finalGameTime);
    expect(selection.rdpsStatus).toBe("complete");
    expect(html).toContain(`<small>Team rDPS</small><strong>${expectedTeam.toLocaleString(undefined, { maximumFractionDigits: 1 })}</strong>`);
    expect(html).toContain(`data-sort-rdps="${expectedFirst}"`);
    expect(html).not.toContain(String(first.rdps_damage! * 1_000_000 / 5_000_000));
    expect(html).not.toContain("viewed_pov_status_must_not_leak");
    expect(html).toContain('data-timeline-rdps-label="rDPS"');
  });

  it("keeps legacy reconciliation graphs but fails closed on their POV-local rate clock", () => {
    const legacy = conservedReconciliation();
    legacy.schema_version = 17;
    delete legacy.rdps_status;
    const selection = selectCanonicalGraph(report.runs[0], legacy);
    const html = renderReport(report, 0, legacy);

    expect(selection.reconciled).toBe(true);
    expect(selection.participants).toBe(legacy.reconciled_participants);
    expect(selection.rdpsStatus).toBeNull();
    expect(selection.rdpsGameTimeMicros).toBeNull();
    expect(selection.rdpsRateClock).toBeNull();
    expect(html).toContain("<small>Team rDPS</small><strong>Unavailable</strong>");
    expect(html).toContain('data-sort-rdps="-1"');
    expect(html).not.toContain('data-metric="rdps_damage"');
    expect(html).toContain('data-rate-clock-complete="false"');
    expect(html).not.toContain("data-rate-clock=");
  });

  it("totally rejects a valid reconciliation for a different run group", () => {
    const wrongGroup = conservedReconciliation();
    wrongGroup.run_group_id = `run_${"2".repeat(32)}`;
    wrongGroup.reconciled_participants[0]!.display_name = "Wrong-group replay participant";
    const selection = selectCanonicalGraph(report.runs[0], wrongGroup);
    const html = renderReport(report, 0, wrongGroup);

    expect(selection.reconciled).toBe(false);
    expect(selection.participants).toBe(report.runs[0].participants);
    expect(html).not.toContain("Cross-vantage reconciled");
    expect(html).not.toContain("Team rDPS");
    expect(html).not.toContain("Wrong-group replay participant");
    expect(html).not.toContain(wrongGroup.reconciliation_id);
  });

  it("withholds reconciled aggregate rDPS when the canonical timeline clock is incomplete", () => {
    const reconciled = conservedReconciliation();
    reconciled.timeline = { ...reconciled.timeline!, rate_clock_complete: false, rate_clock: [] };
    const selection = selectCanonicalGraph(report.runs[0], reconciled);
    const html = renderReport(report, 0, reconciled);

    expect(selection.reconciled).toBe(true);
    expect(selection.rdpsGameTimeMicros).toBeNull();
    expect(html).toContain("<small>Team rDPS</small><strong>Unavailable</strong>");
    expect(html).toContain('data-sort-rdps="-1"');
    expect(html).not.toContain('data-metric="rdps_damage"');
  });

  it("accepts a complete floor-count rate clock for a fractional canonical tail", () => {
    const reconciled = conservedReconciliation();
    const timeline = reconciled.timeline!;
    expect(timeline.duration_micros % timeline.series_bucket_micros).not.toBe(0);
    const floorCount = Math.floor(timeline.duration_micros / timeline.series_bucket_micros);
    timeline.rate_clock = timeline.rate_clock!.slice(0, floorCount);
    timeline.rate_clock_complete = true;
    timeline.omitted.rate_clock_points = 0;
    const expectedGameTime = timeline.rate_clock.at(-1)!.edps_elapsed_micros;

    const selection = selectCanonicalGraph(report.runs[0], reconciled);
    expect(selection.reconciled).toBe(true);
    expect(timeline.rate_clock).toHaveLength(floorCount);
    expect(selection.rdpsGameTimeMicros).toBe(expectedGameTime);
    expect(renderReport(report, 0, reconciled)).not.toContain("<small>Team rDPS</small><strong>Unavailable</strong>");
  });
});

describe("timeline rolling windows", () => {
  it("averages sparse bucket totals across a trailing window without filling the whole encounter", () => {
    const points = [
      { second: 1, damage: 30, effective_healing: 0, damage_taken: 0 },
      { second: 3, damage: 60, effective_healing: 0, damage_taken: 0 },
    ];
    expect(rollingBucketSeries(points, "damage", 10, 3)).toEqual([
      [0, 0], [1, 0], [2, 15], [3, 10], [4, 30], [5, 20], [6, 20], [7, 0], [10, 0],
    ]);
  });

  it("keeps missing raw one-second buckets at zero", () => {
    const points = [{ second: 2, damage: 50, effective_healing: 0, damage_taken: 0 }];
    expect(rollingBucketSeries(points, "damage", 5, 1)).toEqual([[0, 0], [2, 0], [3, 50], [4, 0], [5, 0]]);
  });

  it("derives rolling inspection samples from the authoritative one-second series", () => {
    const points = [
      { second: 1, damage: 30, effective_healing: 0, damage_taken: 0 },
      { second: 3, damage: 60, effective_healing: 0, damage_taken: 0 },
    ];
    const oneSecond = rollingBucketSeries(points, "damage", 10, 1);
    expect(rollingTimelineSamples(oneSecond, 10, 3)).toEqual(rollingBucketSeries(points, "damage", 10, 3));
  });

  it("inspects the same sparse line values that are rendered", () => {
    const samples: Array<[number, number]> = [[0, 0], [1, 30], [2, 0], [8, 0], [9, 50], [10, 50]];
    expect(timelineValueAtSecond(samples, 1)).toBe(30);
    expect(timelineValueAtSecond(samples, 5)).toBe(0);
    expect(timelineValueAtSecond(samples, 9)).toBe(50);
  });

  it("reports instant, rolling, and cumulative rates at the same bounded cursor second", () => {
    const one: Array<[number, number]> = [[0, 0], [1, 10], [2, 30], [3, 0], [4, 20]];
    expect(timelineRateVariantsAtSecond({
      one,
      five: [[0, 0], [1, 10], [2, 20], [3, 40 / 3], [4, 15]],
      ten: [[0, 0], [1, 10], [2, 20], [3, 40 / 3], [4, 15]],
    }, 2)).toEqual({ one: 30, five: 20, ten: 20, cumulative: 20 });
    expect(timelineCumulativeRateLabel("DPS")).toBe("run DPS");
  });

  it("keeps every rate variant on the final integer-duration frame", () => {
    const frame = timelineCursorFrame(2_000_000, 2);
    const one = rollingTimelineSamples([[1, 100], [2, 100]], 2, 1);
    const rolling = rollingTimelineSamples(one, 2, 5);
    const clock = [
      { second: 0, edps_elapsed_micros: 1_000_000, adps_elapsed_micros: 1_000_000 },
      { second: 1, edps_elapsed_micros: 2_000_000, adps_elapsed_micros: 2_000_000 },
    ];

    expect(frame).toEqual({ boundary: 2, elapsedMicros: 2_000_000, clockIndex: 1 });
    expect(one).toEqual([[0, 0], [1, 100], [2, 100]]);
    expect(timelineRateVariantsAtSecond({ one, five: rolling, ten: rolling }, frame.boundary, frame.elapsedMicros))
      .toEqual({ one: 100, five: 100, ten: 100, cumulative: 100 });
    expect(timelineDamageRatesAtSecond(one, clock, frame.boundary)).toEqual({ edps: 100, adps: 100 });
    expect(timelineRdpsAtSecond(one, clock, frame.boundary)).toBe(100);
  });

  it("uses the exact fractional duration at the terminal cursor boundary", () => {
    const frame = timelineCursorFrame(2_100_000, 3);
    const buckets: Array<[number, number]> = [[1, 100], [2, 100], [3, 10]];
    const one = rollingTimelineSamples(buckets, 3, 1, 2_100_000);
    const five = rollingTimelineSamples(buckets, 3, 5, 2_100_000);
    const ten = rollingTimelineSamples(buckets, 3, 10, 2_100_000);
    const clock = [
      { second: 0, edps_elapsed_micros: 1_000_000, adps_elapsed_micros: 1_000_000 },
      { second: 1, edps_elapsed_micros: 2_000_000, adps_elapsed_micros: 2_000_000 },
      { second: 2, edps_elapsed_micros: 2_100_000, adps_elapsed_micros: 2_100_000 },
    ];

    expect(frame).toEqual({ boundary: 3, elapsedMicros: 2_100_000, clockIndex: 2 });
    expect(one.at(-1)).toEqual([3, 100]);
    expect(five.at(-1)).toEqual([3, 100]);
    expect(ten.at(-1)).toEqual([3, 100]);
    expect(timelineRateVariantsAtSecond({ one: buckets, five, ten }, frame.boundary, frame.elapsedMicros))
      .toEqual({ one: 100, five: 100, ten: 100, cumulative: 100 });
    expect(timelineDamageRatesAtSecond(buckets, clock, frame.boundary)).toEqual({ edps: 100, adps: 100 });
    expect(timelineRdpsAtSecond(buckets, clock, frame.boundary)).toBe(100);
  });

  it("preserves the exact fractional endpoint while clamping integer viewport boundaries", () => {
    expect(timelineMaximumBoundary(2_200_000)).toBe(3);
    expect(timelineBoundaryElapsedMicros(2_200_000, 2)).toBe(2_000_000);
    expect(timelineBoundaryElapsedMicros(2_200_000, 3)).toBe(2_200_000);
    expect(timelineClosestBoundary(2_200_000, 2_090_000)).toBe(2);
    expect(timelineClosestBoundary(2_200_000, 2_110_000)).toBe(3);
    expect(clampTimelineViewport(2_200_000, 2, 2, "start")).toEqual({ startBoundary: 1, endBoundary: 2 });
    expect(clampTimelineViewport(2_200_000, 2, 2, "end")).toEqual({ startBoundary: 2, endBoundary: 3 });
  });

  it("withholds fractional trailing windows that would require invented sub-second damage", () => {
    const durationMicros = 10_100_000;
    const buckets = Array.from({ length: 11 }, (_, index) => [index + 1, index === 10 ? 10 : 100] as [number, number]);
    const frame = timelineCursorFrame(durationMicros, 11);
    const five = rollingTimelineSamples(buckets, 11, 5, durationMicros);
    const ten = rollingTimelineSamples(buckets, 11, 10, durationMicros);

    expect(five.some(([boundary]) => boundary === frame.boundary)).toBe(false);
    expect(ten.some(([boundary]) => boundary === frame.boundary)).toBe(false);
    expect(timelineRateVariantsAtSecond({ one: buckets, five, ten }, frame.boundary, frame.elapsedMicros))
      .toEqual({ one: 100, five: null, ten: null, cumulative: 100 });
  });

  it("uses shared reducer clocks for time-local eDPS/aDPS and preserves pauses", () => {
    const clock = [
      { second: 0, edps_elapsed_micros: 1_000_000, adps_elapsed_micros: 1_000_000 },
      { second: 1, edps_elapsed_micros: 2_000_000, adps_elapsed_micros: 1_000_000 },
      { second: 2, edps_elapsed_micros: 2_000_000, adps_elapsed_micros: 1_000_000 },
      { second: 3, edps_elapsed_micros: 3_000_000, adps_elapsed_micros: 2_000_000 },
    ];
    expect(timelineDamageRatesAtSecond([[1, 100], [2, 100]], clock, 2)).toEqual({ edps: 100, adps: 200 });
    expect(timelineDamageRatesAtSecond([[1, 100], [2, 100]], clock, 3)).toEqual({ edps: 100, adps: 200 });
    expect(timelineDamageRatesAtSecond([[1, 100], [2, 100], [4, 100]], clock, 4)).toEqual({ edps: 100, adps: 150 });
    expect(timelineDamageRatesAtSecond([[0, 100]], null, 0)).toBeNull();

  });

  it("uses the reviewed Game-time clock for cumulative and windowed rDPS", () => {
    const fixture = load<{
      rate_clock: Array<{ second: number; edps_elapsed_micros: number; adps_elapsed_micros: number }>;
      participants: Array<{ actor_id: string; rdps_incomplete: boolean; rdps_damage: Array<[number, number]> }>;
    }>("timeline-rdps-cursor.v1.json");
    const exact = fixture.participants.find((participant) => participant.actor_id === "exact")!;
    expect(exact.rdps_incomplete).toBe(false);
    const boundaryRdps = exact.rdps_damage.map(([second, damage]) => [second + 1, damage] as [number, number]);
    expect(timelineRdpsAtSecond(boundaryRdps.slice(0, 2), fixture.rate_clock, 2)).toBe(100);
    expect(timelineRdpsAtSecond(boundaryRdps.slice(0, 2), fixture.rate_clock, 3)).toBe(100);
    expect(timelineRdpsAtSecond(boundaryRdps, fixture.rate_clock, 4)).toBe(100);
    expect(timelineRdpsRateVariantsAtSecond(boundaryRdps, fixture.rate_clock, 2, 4_000_000)).toEqual({
      one: 80, five: 100, ten: 100, cumulative: 100,
    });
    expect(timelineRdpsRateVariantsAtSecond(boundaryRdps, fixture.rate_clock, 3, 4_000_000)).toEqual({
      one: null, five: 100, ten: 100, cumulative: 100,
    });
    expect(timelineRdpsAtSecond([[0, 120]], null, 0)).toBeNull();
  });

  it("aggregates visible party cursor rates and fails closed for partial rDPS", () => {
    const exactRows = [
      { variants: { one: 100, five: 80, ten: 70, cumulative: 60 }, damageRates: { edps: 50, adps: 75 }, rdps: 65 },
      { variants: { one: 200, five: 160, ten: 140, cumulative: 120 }, damageRates: { edps: 100, adps: 150 }, rdps: 130 },
    ];
    expect(timelineVisibleTotalAtSecond(exactRows, true)).toEqual({
      variants: { one: 300, five: 240, ten: 210, cumulative: 180 },
      damageRates: { edps: 150, adps: 225 },
      rdps: 195,
    });
    expect(timelineVisibleTotalAtSecond(exactRows, false)?.rdps).toBeNull();
    expect(timelineVisibleTotalAtSecond([{ ...exactRows[0], rdps: null }, exactRows[1]], true)?.rdps).toBeNull();
    expect(timelineVisibleTotalAtSecond([{ ...exactRows[0], damageRates: null }, exactRows[1]], true)?.damageRates).toBeNull();
    expect(timelineVisibleTotalAtSecond([])).toBeNull();
  });

  it("computes selected ranges with start-exclusive buckets and reducer clock deltas", () => {
    const clock = [
      { second: 0, edps_elapsed_micros: 1_000_000, adps_elapsed_micros: 1_000_000 },
      { second: 1, edps_elapsed_micros: 2_000_000, adps_elapsed_micros: 1_000_000 },
      { second: 2, edps_elapsed_micros: 2_000_000, adps_elapsed_micros: 1_000_000 },
      { second: 3, edps_elapsed_micros: 3_000_000, adps_elapsed_micros: 2_000_000 },
    ];
    expect(timelineRangeRates("damage", [[1, 10], [2, 20], [4, 30]], clock, 1, 4, 4_000_000)).toEqual({
      amount: 50,
      rate: null,
      damageRates: { edps: 25, adps: 50 },
    });
    expect(timelineRangeRates("rdps_damage", [[1, 10], [2, 20], [4, 30]], clock, 1, 4, 4_000_000)).toEqual({
      amount: 50,
      rate: 25,
      damageRates: null,
    });
  });

  it("uses the exact fractional endpoint and fails closed for missing range evidence", () => {
    const clock = [
      { second: 0, edps_elapsed_micros: 1_000_000, adps_elapsed_micros: 1_000_000 },
      { second: 1, edps_elapsed_micros: 2_000_000, adps_elapsed_micros: 2_000_000 },
      { second: 2, edps_elapsed_micros: 2_200_000, adps_elapsed_micros: 2_200_000 },
    ];
    expect(timelineRangeRates("effective_healing", [[3, 20]], clock, 2, 3, 2_200_000)).toEqual({
      amount: 20,
      rate: 100,
      damageRates: null,
    });
    expect(timelineRangeRates("damage", [[2, 20]], clock.slice(0, 2), 1, 3, 2_200_000).damageRates)
      .toEqual({ edps: null, adps: null });
    expect(timelineRangeRates("rdps_damage", [[2, 20]], clock, 1, 3, 2_200_000, false)).toEqual({
      amount: null,
      rate: null,
      damageRates: null,
    });
    const pausedClock = [
      { second: 0, edps_elapsed_micros: 1_000_000, adps_elapsed_micros: 1_000_000 },
      { second: 1, edps_elapsed_micros: 1_000_000, adps_elapsed_micros: 1_000_000 },
    ];
    expect(timelineRangeRates("rdps_damage", [[2, 20]], pausedClock, 1, 2, 2_000_000).rate).toBeNull();
  });

  it("conserves exact selected-range totals and propagates unavailable rows", () => {
    const rows = [
      { amount: 100, rate: null, damageRates: { edps: 50, adps: 75 } },
      { amount: 200, rate: null, damageRates: { edps: 100, adps: 150 } },
    ];
    expect(timelineVisibleRangeTotal(rows)).toEqual({
      amount: 300,
      rate: null,
      damageRates: { edps: 150, adps: 225 },
    });
    expect(timelineVisibleRangeTotal([{ ...rows[0], amount: null }, rows[1]])?.amount).toBeNull();
    expect(timelineVisibleRangeTotal([{ ...rows[0], damageRates: null }, rows[1]])?.damageRates).toBeNull();
    expect(timelineVisibleRangeTotal([])).toBeNull();
  });
});

describe("damage-rate labels", () => {
  it("preserves the static damage timeline for legacy reports", () => {
    const legacy = structuredClone(load<PublicParseReport>("parse-report.v1.json"));
    legacy.schema_version = 12;
    legacy.projection_revision = 1;
    delete legacy.runs[0]!.timeline;

    const html = renderReport(legacy, 0);
    expect(html).toContain('class="parse-analysis-panel parse-timeline-panel"');
    expect(html).toContain('class="parse-timeline-chart"');
    expect(html).not.toContain('class="combat-timeline"');
  });

  it("maps stored history rates to eDPS and aDPS and identifies partial rDPS", () => {
    const report = load<PublicParseReport>("parse-report.v1.json");
    const html = renderReport(report, 0);
    const teamEdps = report.runs[0].participants.reduce((sum, participant) => sum + participant.dps, 0);
    const teamAdps = report.runs[0].participants.reduce((sum, participant) => sum + participant.encounter_dps, 0);

    expect(html).toContain(`<small>Team eDPS</small><strong>${teamEdps.toLocaleString(undefined, { maximumFractionDigits: 1 })}</strong>`);
    expect(html).toContain(`<small>Team aDPS</small><strong>${teamAdps.toLocaleString(undefined, { maximumFractionDigits: 1 })}</strong>`);
    expect(html).toContain('data-sort-edps="1661739.1"');
    expect(html).toContain('data-sort-adps="2871605.2"');
    expect(html).toContain('data-sort-rdps="1661550.5"');
    expect(html).toContain('data-timeline-rdps-label="Partial rDPS"');
    expect(html).not.toContain('<small>Team DPS</small>');
  });

  it("plots only complete server-published rDPS buckets without damage fallback", () => {
    const report = load<PublicParseReport>("parse-report.v1.json");
    const graph = selectCanonicalGraph(report.runs[0]);
    const html = renderTimeline(graph);
    expect(html).toContain('data-metric="rdps_damage"');
    expect(html).toContain('data-series="rdps_damage"');
    expect(html).toContain('data-rate-clock-complete="true"');
    expect(html).toContain('data-series-complete="true"');
    expect(html).toContain('data-timeline-participant-count="5"');
    expect(html).toContain('data-timeline-exact-rdps-track-count="0"');
    expect(html).toContain('data-cumulative-complete="false"');
    expect(html).toContain('data-rate-clock="0:1000000:1000000,1:2000000:2000000');
    expect(html).toContain("Exact Game-time/active-combat clocks");
    expect(html).toContain("1s, 5s, 10s, and cumulative rates all use the reducer-authored reviewed Game-time clock");
    expect(html).toContain('data-values="1:1200000,2:2490000');
    const renderedTracks = html.match(/<polyline /gu) ?? [];
    const inspectionPayloads = html.match(/ data-values="/gu) ?? [];
    expect(inspectionPayloads).toHaveLength(renderedTracks.length / 3);
    const rollingGroups = [...html.matchAll(/<g data-series="[^"]+" data-series-window="(?:5|10)"[^>]*>(.*?)<\/g>/gu)];
    expect(rollingGroups.every(([, contents]) => !contents.includes("data-values="))).toBe(true);
    expect(html).toContain("missing buckets or clocks are never replaced with ordinary damage or wall time");
    expect(hasCompleteRdpsBuckets(report.runs[0].participants[0].series ?? [])).toBe(true);
    const rdps = rollingBucketSeries(report.runs[0].participants[0].series ?? [], "rdps_damage", 4, 1);
    expect(timelineRateVariantsAtSecond({ one: rdps, five: rdps, ten: rdps }, 2).one).toBe(2_490_000);

    const unavailable = structuredClone(report.runs[0]);
    unavailable.participants.forEach((participant) => (participant.series ?? []).forEach((point) => {
      delete point.rdps_damage;
      delete point.rdps_contribution_given;
      delete point.rdps_contribution_received;
    }));
    const legacyHtml = renderTimeline(selectCanonicalGraph(unavailable));
    expect(legacyHtml).not.toContain('data-metric="rdps_damage"');
    expect(legacyHtml).not.toContain('data-series="rdps_damage"');
  });

  it("lands playback on the exact terminal frame without adding an empty second", () => {
    const report = load<PublicParseReport>("parse-report.v1.json");
    const timeline = report.runs[0].timeline!;
    const maximumBoundary = Math.ceil(timeline.duration_micros / 1_000_000);
    const frame = timelineCursorFrame(timeline.duration_micros, maximumBoundary);
    const html = renderTimeline(selectCanonicalGraph(report.runs[0]));
    const points = report.runs[0].participants[0].series ?? [];
    const one = points.map((point) => [point.second + 1, point.damage] as [number, number]);
    const damage = points.reduce((total, point) => total + point.damage, 0);

    expect(html).toContain(`data-timeline-scrubber min="0" max="${maximumBoundary}"`);
    expect(html).toContain(`data-duration-micros="${timeline.duration_micros}"`);
    expect(frame).toEqual({
      boundary: maximumBoundary,
      elapsedMicros: timeline.duration_micros,
      clockIndex: maximumBoundary - 1,
    });
    expect(timelineRateVariantsAtSecond({ one, five: one, ten: one }, frame.boundary, frame.elapsedMicros).cumulative)
      .toBeCloseTo(damage * 1_000_000 / timeline.duration_micros);
  });

  it("fails closed in the UI when the reducer rate clock is incomplete", () => {
    const report = load<PublicParseReport>("parse-report.v1.json");
    const graph = selectCanonicalGraph(report.runs[0]);
    const html = renderTimeline({
      ...graph,
      timeline: { ...graph.timeline!, rate_clock_complete: false, rate_clock: [] },
    });
    expect(html).toContain('data-rate-clock-complete="false"');
    expect(html).not.toContain(' data-rate-clock="');
    expect(html).toContain("wall time is not substituted");
  });

  it("fails closed for time-local rates when public series points were omitted", () => {
    const report = load<PublicParseReport>("parse-report.v1.json");
    const graph = selectCanonicalGraph(report.runs[0]);
    const html = renderTimeline({
      ...graph,
      timeline: { ...graph.timeline!, omitted: { ...graph.timeline!.omitted, series_points: 1 } },
    });
    expect(html).toContain('data-series-complete="false"');
    expect(html).toContain("public series numerator was truncated");
  });

  it("stores one inspection payload per metric and participant for a 20-player raid", () => {
    const report = load<PublicParseReport>("parse-report.v1.json");
    const graph = selectCanonicalGraph(report.runs[0]);
    const template = graph.participants[0];
    const participants = Array.from({ length: 20 }, (_, index) => ({
      ...structuredClone(template),
      actor_id: `raid-${index}`,
      display_name: `Raider ${index}`,
    }));
    const timeline = {
      ...graph.timeline!,
      participant_tracks: participants.map((participant, index) => ({
        actor_id: participant.actor_id,
        character_id: participant.character_id,
        observed_character_key: participant.observed_character_key ?? null,
        display_name: participant.display_name,
        canonical_participant_index: index,
        series_point_count: participant.series?.length ?? 0,
      })),
    };
    const html = renderTimeline({ ...graph, participants, timeline });
    expect(html.match(/<polyline /gu)).toHaveLength(20 * 4 * 3);
    expect(html.match(/ data-values="/gu)).toHaveLength(20 * 4);
    const colors = [...html.matchAll(/data-participant-toggle="\d+"[^>]+style="--track:([^"]+)"/gu)].map((match) => match[1]);
    expect(new Set(colors)).toHaveLength(20);
    expect(html).toContain("line-pattern-solid");
    expect(html).toContain("line-pattern-long");
    expect(html).toContain("line-pattern-dot");
    expect(html).toContain("line-pattern-dash-dot");
    expect(html.match(/class="timeline-time-grid"/gu)).toHaveLength(5);
    expect(html.match(/class="timeline-grid"/gu)).toHaveLength(5 * 4 * 3);
    expect(html).toContain('class="timeline-scale-tick"');
  });

  it("rounds graph maxima upward to stable human-readable scale bounds", () => {
    expect(niceTimelineScaleMaximum(0)).toBe(1);
    expect(niceTimelineScaleMaximum(1_001)).toBe(2_000);
    expect(niceTimelineScaleMaximum(2_001)).toBe(2_500);
    expect(niceTimelineScaleMaximum(25_001)).toBe(50_000);
    expect(niceTimelineScaleMaximum(Number.NaN)).toBe(1);
  });

  it("scales a viewport from visible samples without hidden participant spikes", () => {
    expect(timelineViewportScaleMaximum([
      { hidden: false, points: [[0, 0], [1, 980], [3, 1_500], [8, 50_000]] },
      { hidden: true, points: [[2, 80_000]] },
    ], 1, 3)).toBe(2_000);
    expect(timelineViewportScaleMaximum([
      { hidden: false, points: [[1, -4], [2, Number.NaN], [3, Number.POSITIVE_INFINITY]] },
      { hidden: true, points: [[2, 80_000]] },
    ], 1, 3)).toBe(1);
  });

  it("scales the maximum published timeline without spreading its points", () => {
    const points = Array.from({ length: 262_144 }, (_, boundary) =>
      [boundary, boundary === 200_000 ? 12_345 : 1] as [number, number]);
    expect(timelineViewportScaleMaximum([{ hidden: false, points }], 100_000, 220_000)).toBe(20_000);
  });
});

describe("party rune and loadout summaries", () => {
  it("localizes exact-build skills and Battle Imagines once and fails closed across identities", () => {
    const report = load<PublicParseReport>("parse-report.v1.json");
    report.client_build = catalogPresentation.game_build;
    report.protocol_pack_digest = catalogPresentation.protocol_pack_digest;
    report.runs[0]!.combat_loadout_phases![0]!.equipped_skill_ids = ["2203291"];
    report.runs[0]!.combat_loadout_phases![0]!.equipped_imagines = [{
      skill_id: "3948", tier: 5, equipped_slot: 1,
    }];
    const presentation: ParsePresentationCatalog = {
      ...catalogPresentation,
      actions: { "2203291": "Falcon Strike / Falcon Lightning Strike" },
    };
    const exact = renderReport(report, 0, null, null, presentation);
    expect(exact).toContain("Falcon Strike / Falcon Lightning Strike");
    expect(exact).toContain("Battle Imagine - Rorola");
    expect(exact.match(/class="party-loadouts"/gu)).toHaveLength(1);
    expect(exact).not.toContain("Time-gated profile evidence");

    report.protocol_pack_digest = "sha256:wrong-build-identity";
    const unavailable = renderReport(report, 0, null, null, presentation);
    expect(unavailable).toContain("Unlocalized combat action #2203291");
    expect(unavailable).toContain("Unlocalized combat imagine #3948");
    expect(unavailable).not.toContain("Battle Imagine - Rorola");
  });

  it("uses reconciled selections for matching POVs without merging conflicts", () => {
    const report = load<PublicParseReport>("parse-report.v1.json");
    const reconciliation = load<PublicRunReconciliation>("parse-reconciliation.v1.json");
    const summaries = partyLoadoutSummaries(report.runs[0], report.runs[0].participants, reconciliation);
    expect(summaries).toHaveLength(5);
    expect(summaries.find((summary) => summary.participant.character_id === "c7")).toMatchObject({ disposition: "exact", evidenceLabel: "2 matching POVs" });
    expect(summaries.find((summary) => summary.participant.character_id === "c8")).toMatchObject({ disposition: "conflict", phases: [] });
    expect(summaries.find((summary) => summary.participant.character_id === "c11")).toMatchObject({ disposition: "missing", phases: [] });

    const html = renderPartyLoadouts(report.runs[0], report.runs[0].participants, reconciliation);
    expect(html.match(/class="party-loadout-card"/gu)).toHaveLength(5);
    expect(html).toContain("Conflicting POV loadouts — none selected");
    expect(html).toContain("Missing POV loadout evidence");
    expect(html).toContain("Slot 1: module 5500104 · Lv 6");
    expect(html).toContain("rune 1110 · 20 LP");
    expect(html).toContain('data-loadout-at-micros="1000000"');
  });

  it("falls back only to exact canonical-POV phases and never renders private instance ids", () => {
    const report = load<PublicParseReport>("parse-report.v1.json");
    const run = structuredClone(report.runs[0]);
    (run.combat_loadout_phases![0].equipped_modules[0] as any).instance_id = "private-inventory-instance";
    const summaries = partyLoadoutSummaries(run, run.participants);
    expect(summaries.filter((summary) => summary.disposition === "exact")).toHaveLength(2);
    const html = renderPartyLoadouts(run, run.participants);
    expect(html).toContain("Exact canonical POV");
    expect(html).not.toContain("private-inventory-instance");
  });

  it("localizes report, party, and loadout surfaces with locale-aware quantities", () => {
    const report = load<PublicParseReport>("parse-report.v1.json");
    const reconciliation = load<PublicRunReconciliation>("parse-reconciliation.v1.json");
    report.verification.event_count = 1_234;
    reconciliation.characters.find((character) => character.character_id === "c7")!.participant_report_count = 1_234;
    const messages = createMessageResolver("de-DE", {
      ...bundledMessageCatalogs,
      "de-DE": {
        "parse.report.server_replayed": "server-replayed-marker",
        "parse.report.party.title": "party-title-marker",
        "parse.report.participant.damage": "damage-metric-marker",
        "parse.loadout.title": "loadout-<title>-marker",
        "parse.loadout.evidence.conflict": "conflict-state-marker",
        "parse.loadout.none_selected": "empty-state-marker",
      },
    });
    const html = renderReport(report, 0, reconciliation, messages);
    const singleReportHtml = renderReport(report, 0, undefined, messages);
    expect(singleReportHtml).toContain("server-replayed-marker");
    expect(html).toContain("party-title-marker");
    expect(html).toContain("damage-metric-marker");
    expect(html).toContain("loadout-&lt;title&gt;-marker");
    expect(html).not.toContain("loadout-<title>-marker");
    expect(html).toContain("conflict-state-marker");
    expect(html).toContain("empty-state-marker");
    expect(html).toContain("1.234 matching POVs");
    expect(html).toContain("1.234 canonical events");
    expect(html).toContain("1.661.739,1");
  });
});

describe("timeline interaction markup", () => {
  it("renders timeline controls through exact-locale fallback without invented translations", () => {
    const report = load<PublicParseReport>("parse-report.v1.json");
    const messages = createMessageResolver("fr-CA", {
      ...bundledMessageCatalogs,
      fr: { "parse.timeline.play": "base-locale-play-marker" },
      "fr-CA": { "parse.timeline.trailing_average": "exact-locale-window-marker" },
    });
    const html = renderTimeline(selectCanonicalGraph(report.runs[0]), messages);
    expect(html).toContain('data-locale="fr-CA"');
    expect(html).toContain(">base-locale-play-marker</button>");
    expect(html).toContain(">exact-locale-window-marker</span>");
    expect(html).toContain("Combat timeline");
  });

  it("selects explicit singular/plural timeline messages and locale-formats counts", () => {
    const report = load<PublicParseReport>("parse-report.v1.json");
    const graph = selectCanonicalGraph(report.runs[0]);
    const messages = createMessageResolver("de-DE", {
      ...bundledMessageCatalogs,
      "de-DE": {
        "parse.timeline.gaps.one": "gap-one {count}",
        "parse.timeline.gaps.other": "gap-other {count}",
        "parse.timeline.note.run_span.one": "run-one {count}",
        "parse.timeline.note.run_span.other": "run-other {count}",
        "parse.timeline.note.omissions.one": "omission-one {count}",
        "parse.timeline.note.omissions.other": "omission-other {count}",
      },
    });
    const singular = renderTimeline({ ...graph, timeline: {
      ...graph.timeline!,
      coverage: { ...graph.timeline!.coverage, data_gap_count: 1, gap_timing: "count_only" },
      rdps_influence_spans: [{ influence_index: 0, time_basis: "run_elapsed", start_micros: 0, end_micros: 1, complete_lifecycle: true }],
      omitted: { ...graph.timeline!.omitted, death_markers: 1 },
    } }, messages);
    expect(singular).toContain("gap-one 1");
    expect(singular).toContain("run-one 1");
    expect(singular).toContain("omission-one 1");
    const plural = renderTimeline({ ...graph, timeline: {
      ...graph.timeline!,
      coverage: { ...graph.timeline!.coverage, data_gap_count: 1_234, gap_timing: "count_only" },
      rdps_influence_spans: [0, 1].map((influence_index) => ({ influence_index, time_basis: "run_elapsed" as const, start_micros: 0, end_micros: 1, complete_lifecycle: true })),
      omitted: { ...graph.timeline!.omitted, death_markers: 2 },
    } }, messages);
    expect(plural).toContain("gap-other 1.234");
    expect(plural).toContain("run-other 2");
    expect(plural).toContain("omission-other 2");
  });

  it("escapes localized rDPS and trust labels in attributes, controls, notes, and party rows", () => {
    const report = load<PublicParseReport>("parse-report.v1.json");
    const messages = createMessageResolver("en-US", {
      ...bundledMessageCatalogs,
      "en-US": {
        ...bundledMessageCatalogs["en-US"],
        "parse.timeline.rdps.partial": "Partial <rDPS & evidence>",
        "parse.timeline.trust.single": "Single <unsafe> trust",
      },
    });
    const html = renderReport(report, 0, undefined, messages);
    expect(html).toContain("Partial &lt;rDPS &amp; evidence&gt;");
    expect(html).toContain("Single &lt;unsafe&gt; trust");
    expect(html).not.toContain("Partial <rDPS");
    expect(html).not.toContain("Single <unsafe>");

    const exactReport = structuredClone(report);
    exactReport.runs[0].rdps_status = "complete";
    exactReport.runs[0].participants.forEach((participant) => { participant.rdps_incomplete = false; });
    const exactMessages = createMessageResolver("en-US", {
      "en-US": { ...bundledMessageCatalogs["en-US"], "parse.timeline.rdps.exact": "Exact-rDPS-marker" },
    });
    expect(renderReport(exactReport, 0, undefined, exactMessages)).toContain("Exact-rDPS-marker");
  });

  it("renders independently toggleable tracks and a keyboard point inspector", () => {
    const report = load<PublicParseReport>("parse-report.v1.json");
    const graph = selectCanonicalGraph(report.runs[0]);
    const html = renderTimeline({ ...graph, timeline: { ...graph.timeline!, rdps_influence_spans: [
      { influence_index: 0, time_basis: "run_elapsed", start_micros: 1_000_000, end_micros: 2_000_000, complete_lifecycle: false },
      { influence_index: 1, time_basis: "capture_observed", start_micros: 9_000_000, end_micros: 10_000_000, complete_lifecycle: false },
    ] } });
    expect(html).toContain('role="group" aria-label="Visible participants"');
    expect(html).toContain('data-participant-toggle="0" aria-pressed="true"');
    expect(html).toContain('data-participant="0"');
    expect(html).toContain('data-timeline-inspector');
    expect(html).toContain('data-timeline-play aria-pressed="false">Play');
    expect(html).toContain('data-timeline-scrubber');
    expect(html.match(/class="timeline-rdps-evidence (?:complete|partial)"/gu)).toHaveLength(1);
    expect(html).toContain("1 verified rDPS affected-damage span is shown");
    expect(html).toContain("1 rDPS influence span is capture-clock evidence");
    expect(html).toContain('tabindex="0" role="slider"');
    expect(html).toContain('class="timeline-viewport-controls"');
    expect(html).toContain('data-timeline-viewport-reset disabled');
    expect(html).toContain('data-timeline-inspection><strong>');
    expect(html).toContain('data-timeline-live aria-live="polite"');
  });

  it("batches more than one thousand exact rDPS spans into a bounded accessible evidence lane", () => {
    const report = load<PublicParseReport>("parse-report.v1.json");
    const graph = selectCanonicalGraph(report.runs[0]);
    const spans = Array.from({ length: 1_130 }, (_, index) => ({
      influence_index: index,
      time_basis: "run_elapsed" as const,
      start_micros: index * 2_000,
      end_micros: index * 2_000 + 1_000,
      complete_lifecycle: index % 3 !== 0,
    }));
    const html = renderTimeline({ ...graph, timeline: {
      ...graph.timeline!,
      duration_micros: 3_000_000,
      rdps_influence_spans: spans,
    } });
    const paths = [...html.matchAll(/<path class="timeline-rdps-evidence (?:complete|partial)"[^>]+data-evidence-span-count="(\d+)"[^>]+d="([^"]+)"/gu)];
    expect(paths).toHaveLength(2);
    expect(paths.reduce((sum, match) => sum + Number(match[1]), 0)).toBe(1_130);
    expect(paths.reduce((sum, match) => sum + (match[2].match(/M/gu)?.length ?? 0), 0)).toBe(1_130);
    expect(html.match(/<g class="timeline-rdps-evidence-lane"/gu)).toHaveLength(1);
    expect(html).toContain('data-evidence-span-count="1130"');
    expect(html).toContain('data-evidence-complete-count="753"');
    expect(html).toContain('data-evidence-partial-count="377"');
    expect(html).toContain("1,130 verified rDPS affected-damage spans are shown");
    expect(html).toContain("all exact intervals are retained in one bounded evidence lane");
    expect(html.match(/<rect class="timeline-rdps-evidence/gu)).toBeNull();
  });

  it("handles the 65,536-span contract maximum without argument-limit failures or extra nodes", () => {
    const report = load<PublicParseReport>("parse-report.v1.json");
    const graph = selectCanonicalGraph(report.runs[0]);
    const spans = Array.from({ length: 65_536 }, (_, index) => ({
      influence_index: index,
      time_basis: "run_elapsed" as const,
      start_micros: index * 10,
      end_micros: index * 10 + 5,
      complete_lifecycle: index % 2 === 0,
    }));
    const html = renderTimeline({ ...graph, timeline: {
      ...graph.timeline!,
      duration_micros: 1_000_000,
      rdps_influence_spans: spans,
    } });
    expect(html.match(/<g class="timeline-rdps-evidence-lane"/gu)).toHaveLength(1);
    expect(html.match(/<path class="timeline-rdps-evidence (?:complete|partial)"/gu)).toHaveLength(2);
    expect(html).toContain('data-evidence-span-count="65536"');
    expect(html).toContain('data-evidence-complete-count="32768"');
    expect(html).toContain('data-evidence-partial-count="32768"');
    expect(html).toContain("65,536 verified rDPS affected-damage spans are shown");
  });
});
