import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PublicParseReport, PublicRunReconciliation } from "../../contracts/public-parse";
import { renderTimeline, rollingBucketSeries, selectCanonicalGraph, timelineRateVariantsAtSecond, timelineValueAtSecond } from "./parse-browser";

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
