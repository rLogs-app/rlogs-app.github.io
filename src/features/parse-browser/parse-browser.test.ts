import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PublicParseReport, PublicRunReconciliation } from "../../contracts/public-parse";
import { bundledMessageCatalogs, createMessageResolver } from "../../localization/messages";
import { hasCompleteRdpsBuckets, partyLoadoutSummaries, renderPartyLoadouts, renderReport, renderTimeline, rollingBucketSeries, rollingTimelineSamples, selectCanonicalGraph, timelineCumulativeRateLabel, timelineDamageRatesAtSecond, timelineRateVariantsAtSecond, timelineRdpsAtSecond, timelineValueAtSecond } from "./parse-browser";

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

  it("uses the active-combat clock for cumulative rDPS and never wall time", () => {
    const fixture = load<{
      rate_clock: Array<{ second: number; edps_elapsed_micros: number; adps_elapsed_micros: number }>;
      participants: Array<{ actor_id: string; rdps_incomplete: boolean; rdps_damage: Array<[number, number]> }>;
    }>("timeline-rdps-cursor.v1.json");
    const exact = fixture.participants.find((participant) => participant.actor_id === "exact")!;
    expect(exact.rdps_incomplete).toBe(false);
    expect(timelineRdpsAtSecond(exact.rdps_damage.slice(0, 2), fixture.rate_clock, 1)).toBe(200);
    expect(timelineRdpsAtSecond(exact.rdps_damage.slice(0, 2), fixture.rate_clock, 2)).toBe(200);
    expect(timelineRdpsAtSecond(exact.rdps_damage, fixture.rate_clock, 3)).toBe(150);
    expect(timelineRdpsAtSecond([[0, 120]], null, 0)).toBeNull();
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
    expect(html).toContain('data-series-complete="true"');
    expect(html).toContain('data-cumulative-complete="false"');
    expect(html).toContain('data-rate-clock="0:1000000:1000000,1:2000000:2000000');
    expect(html).toContain("Exact eDPS/aDPS clock");
    expect(html).toContain("Cumulative rDPS uses the published active-combat clock, not wall time");
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

  it("fails closed for time-local rates when public series points were omitted", () => {
    const report = load<PublicParseReport>("parse-report.v1.json");
    const graph = selectCanonicalGraph(report.runs[0]);
    const html = renderTimeline({
      ...graph,
      timeline: { ...graph.timeline, omitted: { ...graph.timeline.omitted, series_points: 1 } },
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

describe("party rune and loadout summaries", () => {
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
    (run.combat_loadout_phases[0].equipped_modules[0] as any).instance_id = "private-inventory-instance";
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
    expect(html).toContain("server-replayed-marker");
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
      ...graph.timeline,
      coverage: { ...graph.timeline.coverage, data_gap_count: 1, gap_timing: "count_only" },
      rdps_influence_spans: [{ influence_index: 0, time_basis: "run_elapsed", start_micros: 0, end_micros: 1, complete_lifecycle: true }],
      omitted: { ...graph.timeline.omitted, death_markers: 1 },
    } }, messages);
    expect(singular).toContain("gap-one 1");
    expect(singular).toContain("run-one 1");
    expect(singular).toContain("omission-one 1");
    const plural = renderTimeline({ ...graph, timeline: {
      ...graph.timeline,
      coverage: { ...graph.timeline.coverage, data_gap_count: 1_234, gap_timing: "count_only" },
      rdps_influence_spans: [0, 1].map((influence_index) => ({ influence_index, time_basis: "run_elapsed" as const, start_micros: 0, end_micros: 1, complete_lifecycle: true })),
      omitted: { ...graph.timeline.omitted, death_markers: 2 },
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
