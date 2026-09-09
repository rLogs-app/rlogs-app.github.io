import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PublicParseReport, PublicRunReconciliation } from "../../contracts/public-parse";
import { hasCompleteRdpsBuckets, renderReport, renderTimeline, rollingBucketSeries, rollingTimelineSamples, selectCanonicalGraph, timelineCumulativeRateLabel, timelineDamageRatesAtSecond, timelineRateVariantsAtSecond, timelineValueAtSecond } from "./parse-browser";

const load = <T>(name: string): T => JSON.parse(readFileSync(new URL(`../../../public/fixtures/${name}`, import.meta.url), "utf8")) as T;

describe("canonical timeline selection", () => {
  const report = load<PublicParseReport>("parse-report.v1.json");
  const reconciliation = load<PublicRunReconciliation>("parse-reconciliation.v1.json");

  it("falls back to one canonical report instead of summing POVs", () => {
    const selected = selectCanonicalGraph(report.runs[0], reconciliation);
    expect(selected.reconciled).toBe(false);
    expect(selected.participants).toBe(report.runs[0].participants);
  });

  it("uses reconciled participants only after a conserved replay completes", () => {
    const reconciled = {
      ...reconciliation,
      status: "reconciled",
      attribution_replay_completed: true,
      reconciled_participants: report.runs[0].participants.map((participant) => ({
        ...participant, rdps_damage: participant.damage, contribution_given: 0, contribution_received: 0, rdps_incomplete: false,
      })),
      timeline: { ...reconciliation.timeline, participant_tracks: report.runs[0].timeline.participant_tracks },
    } satisfies PublicRunReconciliation;
    expect(selectCanonicalGraph(report.runs[0], reconciled).participants).toBe(reconciled.reconciled_participants);
    expect(selectCanonicalGraph(report.runs[0], { ...reconciled, attribution_replay_completed: false }).reconciled).toBe(false);
    expect(selectCanonicalGraph(report.runs[0], { ...reconciled, conservation: { ...reconciled.conservation!, conserved: false } }).reconciled).toBe(false);
    const mismatched = { ...reconciled, timeline: { ...reconciled.timeline, participant_tracks: [
      { ...report.runs[0].timeline.participant_tracks[0], actor_id: "mismatched" },
    ] } } satisfies PublicRunReconciliation;
    expect(selectCanonicalGraph(report.runs[0], mismatched).reconciled).toBe(false);
  });
});

describe("timeline rolling windows", () => {
  it("averages sparse bucket totals across a trailing window without filling the whole encounter", () => {
    const points = [
      { second: 1, damage: 30, effective_healing: 0, damage_taken: 0 },
      { second: 3, damage: 60, effective_healing: 0, damage_taken: 0 },
    ];
    expect(rollingBucketSeries(points, "damage", 10, 3)).toEqual([
      [0, 0], [1, 15], [2, 10], [3, 30], [4, 20], [5, 20], [6, 0], [10, 0],
    ]);
  });

  it("keeps missing raw one-second buckets at zero", () => {
    const points = [{ second: 2, damage: 50, effective_healing: 0, damage_taken: 0 }];
    expect(rollingBucketSeries(points, "damage", 5, 1)).toEqual([[0, 0], [1, 0], [2, 50], [3, 0], [5, 0]]);
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
    const one: Array<[number, number]> = [[0, 10], [1, 30], [2, 0], [3, 20]];
    expect(timelineRateVariantsAtSecond({
      one,
      five: [[0, 10], [1, 20], [2, 40 / 3], [3, 15]],
      ten: [[0, 10], [1, 20], [2, 40 / 3], [3, 15]],
    }, 1.4)).toEqual({ one: 30, five: 20, ten: 20, cumulative: 20 });
    expect(timelineCumulativeRateLabel("DPS")).toBe("run DPS");
  });

  it("uses shared reducer clocks for time-local eDPS/aDPS and preserves pauses", () => {
    const clock = [
      { second: 0, edps_elapsed_micros: 1_000_000, adps_elapsed_micros: 1_000_000 },
      { second: 1, edps_elapsed_micros: 2_000_000, adps_elapsed_micros: 1_000_000 },
      { second: 2, edps_elapsed_micros: 2_000_000, adps_elapsed_micros: 1_000_000 },
      { second: 3, edps_elapsed_micros: 3_000_000, adps_elapsed_micros: 2_000_000 },
    ];
    expect(timelineDamageRatesAtSecond([[0, 100], [1, 100]], clock, 1)).toEqual({ edps: 100, adps: 200 });
    expect(timelineDamageRatesAtSecond([[0, 100], [1, 100]], clock, 2)).toEqual({ edps: 100, adps: 200 });
    expect(timelineDamageRatesAtSecond([[0, 100], [1, 100], [3, 100]], clock, 3)).toEqual({ edps: 100, adps: 150 });
    expect(timelineDamageRatesAtSecond([[0, 100]], null, 0)).toBeNull();

  });
});

describe("damage-rate labels", () => {
  it("maps stored history rates to eDPS and aDPS and identifies partial rDPS", () => {
    const report = load<PublicParseReport>("parse-report.v1.json");
    const html = renderReport(report, 0);
    const teamEdps = report.runs[0].participants.reduce((sum, participant) => sum + participant.dps, 0);
    const teamAdps = report.runs[0].participants.reduce((sum, participant) => sum + participant.encounter_dps, 0);

    expect(html).toContain(`<small>Team eDPS</small><strong>${teamEdps.toLocaleString(undefined, { maximumFractionDigits: 1 })}</strong>`);
    expect(html).toContain(`<small>Team aDPS</small><strong>${teamAdps.toLocaleString(undefined, { maximumFractionDigits: 1 })}</strong>`);
    expect(html).toContain('<small>eDPS</small><strong>1,661,739.1</strong>');
    expect(html).toContain('<small>aDPS</small><strong>2,871,605.2</strong>');
    expect(html).toContain('<small>Partial rDPS</small><strong>1,661,550.5</strong>');
    expect(html).not.toContain('<small>Team DPS</small>');
  });

  it("plots only complete server-published rDPS buckets without damage fallback", () => {
    const report = load<PublicParseReport>("parse-report.v1.json");
    const graph = selectCanonicalGraph(report.runs[0]);
    const html = renderTimeline(graph);
    expect(html).toContain('data-metric="rdps_damage"');
    expect(html).toContain('data-series="rdps_damage"');
    expect(html).toContain('data-rate-clock-complete="true"');
    expect(html).toContain('data-rate-clock="0:1000000:1000000,1:2000000:2000000');
    expect(html).toContain("Exact eDPS/aDPS clock");
    expect(html).toContain('data-values="0:1200000,1:2490000');
    const renderedTracks = html.match(/<polyline /gu) ?? [];
    const inspectionPayloads = html.match(/ data-values="/gu) ?? [];
    expect(inspectionPayloads).toHaveLength(renderedTracks.length / 3);
    const rollingGroups = [...html.matchAll(/<g data-series="[^"]+" data-series-window="(?:5|10)"[^>]*>(.*?)<\/g>/gu)];
    expect(rollingGroups.every(([, contents]) => !contents.includes("data-values="))).toBe(true);
    expect(html).toContain("missing buckets are never replaced with ordinary damage");
    expect(hasCompleteRdpsBuckets(report.runs[0].participants[0].series)).toBe(true);
    const rdps = rollingBucketSeries(report.runs[0].participants[0].series, "rdps_damage", 4, 1);
    expect(timelineRateVariantsAtSecond({ one: rdps, five: rdps, ten: rdps }, 1).one).toBe(2_490_000);

    const unavailable = structuredClone(report.runs[0]);
    unavailable.participants.forEach((participant) => participant.series.forEach((point) => {
      delete point.rdps_damage;
      delete point.rdps_contribution_given;
      delete point.rdps_contribution_received;
    }));
    const legacyHtml = renderTimeline(selectCanonicalGraph(unavailable));
    expect(legacyHtml).not.toContain('data-metric="rdps_damage"');
    expect(legacyHtml).not.toContain('data-series="rdps_damage"');
  });

  it("fails closed in the UI when the reducer rate clock is incomplete", () => {
    const report = load<PublicParseReport>("parse-report.v1.json");
    const graph = selectCanonicalGraph(report.runs[0]);
    const html = renderTimeline({
      ...graph,
      timeline: { ...graph.timeline, rate_clock_complete: false, rate_clock: [] },
    });
    expect(html).toContain('data-rate-clock-complete="false"');
    expect(html).not.toContain(' data-rate-clock="');
    expect(html).toContain("wall time is not substituted");
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
      ...graph.timeline,
      participant_tracks: participants.map((participant, index) => ({
        actor_id: participant.actor_id,
        character_id: participant.character_id,
        observed_character_key: participant.observed_character_key ?? null,
        display_name: participant.display_name,
        canonical_participant_index: index,
        series_point_count: participant.series.length,
      })),
    };
    const html = renderTimeline({ ...graph, participants, timeline });
    expect(html.match(/<polyline /gu)).toHaveLength(20 * 4 * 3);
    expect(html.match(/ data-values="/gu)).toHaveLength(20 * 4);
  });
});

describe("timeline interaction markup", () => {
  it("renders independently toggleable tracks and a keyboard point inspector", () => {
    const report = load<PublicParseReport>("parse-report.v1.json");
    const graph = selectCanonicalGraph(report.runs[0]);
    const html = renderTimeline({ ...graph, timeline: { ...graph.timeline, rdps_influence_spans: [
      { influence_index: 0, time_basis: "run_elapsed", start_micros: 1_000_000, end_micros: 2_000_000, complete_lifecycle: false },
      { influence_index: 1, time_basis: "capture_observed", start_micros: 9_000_000, end_micros: 10_000_000, complete_lifecycle: false },
    ] } });
    expect(html).toContain('role="group" aria-label="Visible participants"');
    expect(html).toContain('data-participant-toggle="0" aria-pressed="true"');
    expect(html).toContain('data-participant="0"');
    expect(html).toContain('data-timeline-inspector');
    expect(html).toContain('data-timeline-play aria-pressed="false">Play');
    expect(html).toContain('data-timeline-scrubber');
    expect(html.match(/class="timeline-rdps-evidence"/gu)).toHaveLength(1);
    expect(html).toContain("1 verified rDPS affected-damage span is shown");
    expect(html).toContain("1 rDPS influence span is capture-clock evidence");
    expect(html).toContain('tabindex="0" role="slider"');
    expect(html).toContain('data-timeline-inspection aria-live="polite"');
  });
});
