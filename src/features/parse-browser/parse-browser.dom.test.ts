import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicParseReport, PublicRunReconciliation } from "../../contracts/public-parse";
import {
  bindParseReportInteractions,
  renderReport,
  renderTimeline,
  renderTimelineSnapshotTable,
  selectCanonicalGraph,
} from "./parse-browser";

const load = <T>(name: string): T => JSON.parse(
  readFileSync(new URL(`../../../public/fixtures/${name}`, import.meta.url), "utf8"),
) as T;

describe("combat timeline DOM interactions", () => {
  let window: Window;
  let animationFrame: FrameRequestCallback | null;

  beforeEach(() => {
    window = new Window({ url: "https://rlogs.app/parses/" });
    animationFrame = null;
    Object.assign(globalThis, {
      window,
      document: window.document,
      Element: window.Element,
      HTMLElement: window.HTMLElement,
      HTMLButtonElement: window.HTMLButtonElement,
      HTMLInputElement: window.HTMLInputElement,
      SVGElement: window.SVGElement,
      SVGRectElement: window.SVGRectElement,
      SVGSVGElement: window.SVGSVGElement,
      requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
        animationFrame = callback;
        return 1;
      }),
      cancelAnimationFrame: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    window.close();
  });

  function mountedTimeline(): HTMLElement {
    const report = load<PublicParseReport>("parse-report.v1.json");
    const root = window.document.createElement("main") as unknown as HTMLElement;
    root.innerHTML = renderTimeline(selectCanonicalGraph(report.runs[0]));
    window.document.body.append(root as never);
    const initialize = bindParseReportInteractions(root);
    initialize();
    return root;
  }

  function mountedDeathCauseTimeline(): HTMLElement {
    const report = load<PublicParseReport>("parse-report.v1.json");
    report.runs[0]!.participants[0]!.abilities = [{
      ability_id: "2203291", presentation_name: "Powerdraw", presentation_kind: null,
      icon_asset_path: null, casts: 0, hits: 1, critical_hits: 0, damage: 1_000,
      effective_damage: 900, healing: 0, effective_healing: 0, shielding: 0,
    }];
    const timeline = report.runs[0]!.timeline!;
    timeline.schema_version = 4;
    const marker = timeline.death_markers[0]!;
    marker.precision = "exact_microsecond";
    marker.cause = {
      evidence: "packet_terminal_damage",
      final_hit: {
        at_micros: marker.at_micros,
        source_actor_id: "7",
        ability_id: "2203291",
        reported_damage: 1_000,
        effective_damage: 900,
        critical: true,
      },
      prior_hits: [],
      prior_hits_truncated: false,
    };
    const root = window.document.createElement("main") as unknown as HTMLElement;
    root.innerHTML = renderTimeline(selectCanonicalGraph(report.runs[0]!));
    window.document.body.append(root as never);
    bindParseReportInteractions(root)();
    return root;
  }

  function mountedLiveLegacyTimeline(): HTMLElement {
    const report = structuredClone(load<PublicParseReport>("parse-report.v1.json"));
    report.schema_version = 12;
    report.projection_revision = 1;
    report.report_id = "rpt_256c458814b83ffc9fe5d2ce258b5001";
    delete report.runs[0]!.timeline;
    const root = window.document.createElement("main") as unknown as HTMLElement;
    root.innerHTML = renderReport(report, 0);
    window.document.body.append(root as never);
    bindParseReportInteractions(root)();
    return root;
  }

  it("plays, pauses, scrubs, and supports keyboard cursor movement", () => {
    const root = mountedTimeline();
    const play = root.querySelector<HTMLButtonElement>("[data-timeline-play]")!;
    const scrubber = root.querySelector<HTMLInputElement>("[data-timeline-scrubber]")!;
    const inspector = root.querySelector<SVGRectElement>("[data-timeline-inspector]")!;
    const graphPlayhead = root.querySelector<SVGLineElement>("[data-timeline-crosshair] line")!;
    const lanePlayhead = root.querySelector<SVGLineElement>("[data-timeline-lane-playhead]")!;

    expect(root.querySelector(".timeline-snapshot-table caption")?.textContent).toContain("DPS at 0:00");
    expect(lanePlayhead.getAttribute("x1")).toBe(graphPlayhead.getAttribute("x1"));
    play.click();
    expect(play.textContent).toBe("Pause");
    expect(play.getAttribute("aria-pressed")).toBe("true");
    expect(animationFrame).not.toBeNull();
    animationFrame!(0);
    animationFrame!(1_100);
    expect(inspector.getAttribute("aria-valuenow")).toBe("1");
    expect(lanePlayhead.getAttribute("x1")).toBe(graphPlayhead.getAttribute("x1"));
    play.click();
    expect(play.textContent).toBe("Play");
    expect(play.getAttribute("aria-pressed")).toBe("false");

    scrubber.value = "2";
    scrubber.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    expect(inspector.getAttribute("aria-valuenow")).toBe("2");
    expect(lanePlayhead.getAttribute("x1")).toBe(graphPlayhead.getAttribute("x1"));
    expect(root.querySelector(".timeline-snapshot-table caption")?.textContent).toContain("DPS at 0:02");
    expect(root.querySelector(".timeline-snapshot-table")?.textContent).toContain("eDPS");
    expect(root.querySelector(".timeline-snapshot-table")?.textContent).toContain("aDPS");

    inspector.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }) as unknown as Event);
    expect(inspector.getAttribute("aria-valuenow")).toBe("3");
    inspector.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Home", bubbles: true }) as unknown as Event);
    expect(inspector.getAttribute("aria-valuenow")).toBe("0");
  });

  it("groups same-boundary markers and navigates without wrapping while announcing every label", () => {
    const report = structuredClone(load<PublicParseReport>("parse-report.v1.json"));
    report.runs[0]!.timeline!.loadout_markers[0]!.at_micros = 3_100_000;
    const root = window.document.createElement("main") as unknown as HTMLElement;
    root.innerHTML = renderTimeline(selectCanonicalGraph(report.runs[0]!));
    window.document.body.append(root as never);
    bindParseReportInteractions(root)();
    const previous = root.querySelector<HTMLButtonElement>("[data-timeline-event-previous]")!;
    const next = root.querySelector<HTMLButtonElement>("[data-timeline-event-next]")!;
    const status = root.querySelector<HTMLOutputElement>("[data-timeline-event-status]")!;
    const inspector = root.querySelector<SVGRectElement>("[data-timeline-inspector]")!;
    const play = root.querySelector<HTMLButtonElement>("[data-timeline-play]")!;

    expect(status.textContent).toBe("2 event points in the visible range");
    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    play.click();
    expect(play.textContent).toBe("Pause");
    next.click();
    expect(play.textContent).toBe("Play");
    expect(inspector.getAttribute("aria-valuenow")).toBe("2");
    expect(status.textContent).toBe("Event 1 of 2");
    next.click();
    expect(inspector.getAttribute("aria-valuenow")).toBe("4");
    expect(root.querySelector<HTMLInputElement>("[data-timeline-scrubber]")?.value).toBe("4");
    expect(status.textContent).toBe("Event 2 of 2");
    expect(next.disabled).toBe(true);
    expect(root.querySelector("[data-timeline-events]")?.textContent).toContain("death observed");
    expect(root.querySelector("[data-timeline-events]")?.textContent).toContain("loadout changed");
    expect(root.querySelector("[data-timeline-live]")?.textContent).toContain("Event 2 of 2:");
    expect(root.querySelector("[data-timeline-live]")?.textContent).toContain("death observed");
    expect(root.querySelector("[data-timeline-live]")?.textContent).toContain("loadout changed");
    previous.click();
    expect(inspector.getAttribute("aria-valuenow")).toBe("2");
    expect(status.textContent).toBe("Event 1 of 2");
    expect(previous.disabled).toBe(true);
  });

  it("filters event navigation to the viewport and visible participant markers", () => {
    const root = mountedTimeline();
    const status = root.querySelector<HTMLOutputElement>("[data-timeline-event-status]")!;
    const next = root.querySelector<HTMLButtonElement>("[data-timeline-event-next]")!;
    const inspector = root.querySelector<SVGRectElement>("[data-timeline-inspector]")!;
    const start = root.querySelector<HTMLInputElement>("input[data-timeline-viewport-start]")!;

    expect(status.textContent).toBe("3 event points in the visible range");
    root.querySelector<HTMLButtonElement>('[data-participant-toggle="2"]')!.click();
    expect(status.textContent).toBe("2 event points in the visible range");
    next.click();
    next.click();
    expect(inspector.getAttribute("aria-valuenow")).toBe("2");
    expect(next.disabled).toBe(true);

    root.querySelector<HTMLButtonElement>('[data-participant-toggle="2"]')!.click();
    start.value = "3";
    start.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    expect(status.textContent).toBe("1 event point in the visible range");
    expect(inspector.getAttribute("aria-valuenow")).toBe("3");
    expect(next.disabled).toBe(false);
    next.click();
    expect(inspector.getAttribute("aria-valuenow")).toBe("4");
    expect(status.textContent).toBe("Event 1 of 1");
    expect(next.disabled).toBe(true);
  });

  it("uses one participant toggle for the DPS trace, skill uses, deaths, and lane", () => {
    const report = structuredClone(load<PublicParseReport>("parse-report.v1.json"));
    const timeline = report.runs[0]!.timeline!;
    const actorId = timeline.participant_tracks[0]!.actor_id;
    timeline.death_markers[0]!.actor_id = actorId;
    timeline.schema_version = 6;
    timeline.skill_uses = [{
      actor_id: actorId, at_micros: 1_250_000, action_id: "2203291", state: "started",
      evidence: [{ source_report_id: timeline.canonical_report_id, event_sequence: 7,
        game_time_millis: 2_250, kind: "exact_wire_cast_start" }], omitted_evidence: 0,
    }];
    timeline.omitted.skill_uses = 0;
    timeline.participant_tracks.forEach((track) => { track.omitted_skill_uses = 0; });
    const root = window.document.createElement("main") as unknown as HTMLElement;
    root.innerHTML = renderTimeline(selectCanonicalGraph(report.runs[0]!));
    window.document.body.append(root as never);
    bindParseReportInteractions(root)();

    const toggle = root.querySelector<HTMLButtonElement>('[data-participant-toggle="0"]')!;
    const trace = root.querySelector<SVGPolylineElement>('[data-participant="0"]')!;
    const skill = root.querySelector<SVGGraphicsElement>('.timeline-marker.skill[data-timeline-marker-participant="0"]')!;
    const death = root.querySelector<SVGGraphicsElement>('.timeline-marker.death[data-timeline-marker-participant="0"]')!;
    const lane = root.querySelector<SVGGElement>('[data-timeline-lane-participant="0"]')!;
    expect(skill).not.toBeNull();
    expect(death).not.toBeNull();
    toggle.click();
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(trace.hasAttribute("hidden")).toBe(true);
    expect(skill.hasAttribute("hidden")).toBe(true);
    expect(death.hasAttribute("hidden")).toBe(true);
    expect(lane.hasAttribute("hidden")).toBe(true);
    root.querySelector<HTMLButtonElement>("[data-participant-show-all]")!.click();
    expect(trace.hasAttribute("hidden")).toBe(false);
    expect(skill.hasAttribute("hidden")).toBe(false);
    expect(death.hasAttribute("hidden")).toBe(false);
    expect(lane.hasAttribute("hidden")).toBe(false);
  });

  it("renders accessible skill stacks at full range and separates them when zoomed", () => {
    vi.useFakeTimers();
    const report = structuredClone(load<PublicParseReport>("parse-report.v1.json"));
    const timeline = report.runs[0]!.timeline!;
    const actorId = timeline.participant_tracks[0]!.actor_id;
    timeline.schema_version = 6;
    timeline.duration_micros = 5_000_000;
    timeline.skill_uses = [1_200_000, 1_250_000].map((at_micros, index) => ({
      actor_id: actorId, at_micros, action_id: String(2203291 + index), state: "started" as const,
      evidence: [{ source_report_id: timeline.canonical_report_id, event_sequence: 20 + index,
        game_time_millis: 2_200 + index * 50, kind: "exact_wire_cast_start" as const }], omitted_evidence: 0,
    }));
    timeline.omitted.skill_uses = 0;
    timeline.participant_tracks.forEach((track) => { track.omitted_skill_uses = 0; });
    const root = window.document.createElement("main") as unknown as HTMLElement;
    root.innerHTML = renderTimeline(selectCanonicalGraph(report.runs[0]!));
    window.document.body.append(root as never);
    bindParseReportInteractions(root)();

    const skills = [...root.querySelectorAll<SVGGraphicsElement>(".timeline-marker.skill")];
    const anchor = skills.find((marker) => marker.classList.contains("is-skill-cluster-anchor"))!;
    const member = skills.find((marker) => marker.classList.contains("is-skill-cluster-member"))!;
    const death = root.querySelector<SVGGraphicsElement>(".timeline-marker.death")!;
    expect(anchor.dataset.timelineSkillClusterSize).toBe("2");
    expect(anchor.getAttribute("aria-label")).toContain("2 skill uses:");
    expect(anchor.getAttribute("aria-label")).toContain("at 0:01.200");
    expect(anchor.getAttribute("aria-label")).toContain("at 0:01.250");
    expect(anchor.querySelector("[data-timeline-skill-cluster-count]")?.textContent).toBe("2");
    expect(member.getAttribute("aria-hidden")).toBe("true");
    expect(death.classList.contains("is-skill-cluster-member")).toBe(false);
    anchor.focus();
    const preview = root.querySelector<HTMLElement>("[data-timeline-lane-preview]")!;
    expect(preview.hidden).toBe(false);
    expect(preview.querySelectorAll("li")).toHaveLength(2);
    expect(preview.textContent).toContain("0:01.200");
    expect(preview.textContent).toContain("0:01.250");

    const start = root.querySelector<HTMLInputElement>("input[data-timeline-viewport-start]")!;
    const end = root.querySelector<HTMLInputElement>("input[data-timeline-viewport-end]")!;
    start.value = "1";
    start.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    end.value = "2";
    end.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    expect(start.value).toBe("1");
    expect(end.value).toBe("2");
    expect(skills.some((marker) => marker.classList.contains("is-skill-cluster-anchor"))).toBe(false);
    expect(skills.every((marker) => !marker.classList.contains("is-skill-cluster-member"))).toBe(true);
    expect(skills.every((marker) => marker.getAttribute("aria-hidden") !== "true")).toBe(true);
    const singleEventLabel = anchor.dataset.timelineMarkerBaseAriaLabel!;
    expect(anchor.getAttribute("aria-label")).toBe(singleEventLabel);
    expect(anchor.getAttribute("aria-label")).not.toContain("2 skill uses:");
    anchor.dispatchEvent(new window.FocusEvent("focus") as unknown as Event);
    anchor.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as unknown as Event);
    expect(anchor.getAttribute("aria-label")).toBe(singleEventLabel);
    expect(anchor.dataset.timelineMarkerOwnAriaLabel).toBe(singleEventLabel);
    anchor.dispatchEvent(new window.FocusEvent("focus") as unknown as Event);
    anchor.dispatchEvent(new window.FocusEvent("blur") as unknown as Event);
    vi.advanceTimersByTime(1_200);
    expect(anchor.getAttribute("aria-label")).toBe(singleEventLabel);
    expect(anchor.getAttribute("aria-label")).not.toContain("2 skill uses:");
  });

  it("excludes an exact 2.1-second marker from a viewport starting at 3 seconds", () => {
    const report = structuredClone(load<PublicParseReport>("parse-report.v1.json"));
    const timeline = report.runs[0]!.timeline!;
    timeline.death_markers = [{
      ...timeline.death_markers[0]!,
      at_micros: 2_100_000,
      precision: "exact_microsecond",
    }];
    timeline.loadout_markers = [];
    const root = window.document.createElement("main") as unknown as HTMLElement;
    root.innerHTML = renderTimeline(selectCanonicalGraph(report.runs[0]!));
    window.document.body.append(root as never);
    bindParseReportInteractions(root)();
    const marker = root.querySelector<SVGGraphicsElement>(".timeline-marker.death")!;
    const start = root.querySelector<HTMLInputElement>("input[data-timeline-viewport-start]")!;

    expect(marker.dataset.timelineMarkerBoundary).toBe("3");
    expect(marker.dataset.timelineMarkerAtMicros).toBe("2100000");
    expect(marker.dataset.timelineMarkerEndMicros).toBeUndefined();
    expect(root.querySelector("[data-timeline-event-status]")?.textContent).toBe("1 event point in the visible range");
    start.value = "3";
    start.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    expect(root.querySelector("[data-timeline-event-status]")?.textContent).toBe("No events in the visible range");
    expect(root.querySelector<HTMLButtonElement>("[data-timeline-event-next]")?.disabled).toBe(true);
  });

  it("treats a legacy 2–3-second death bucket as ending before a viewport starting at 3 seconds", () => {
    const report = structuredClone(load<PublicParseReport>("parse-report.v1.json"));
    report.schema_version = 12;
    report.projection_revision = 1;
    delete report.runs[0]!.timeline;
    report.runs[0]!.participants.forEach((participant) => { participant.death_seconds = []; });
    report.runs[0]!.participants[0]!.death_seconds = [2];
    const root = window.document.createElement("main") as unknown as HTMLElement;
    root.innerHTML = renderReport(report, 0);
    window.document.body.append(root as never);
    bindParseReportInteractions(root)();
    const marker = root.querySelector<SVGGraphicsElement>(".timeline-marker.death")!;
    const start = root.querySelector<HTMLInputElement>("input[data-timeline-viewport-start]")!;

    expect(marker.dataset.timelineMarkerBoundary).toBe("3");
    expect(marker.dataset.timelineMarkerAtMicros).toBe("2000000");
    expect(marker.dataset.timelineMarkerEndMicros).toBe("3000000");
    expect(root.querySelector("[data-timeline-event-status]")?.textContent).toBe("1 event point in the visible range");
    start.value = "3";
    start.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    expect(root.querySelector("[data-timeline-event-status]")?.textContent).toBe("No events in the visible range");
    expect(root.querySelector<HTMLButtonElement>("[data-timeline-event-next]")?.disabled).toBe(true);
  });

  it("focuses an exact endpoint but excludes a legacy bucket ending at the zoomed viewport start", () => {
    const report = structuredClone(load<PublicParseReport>("parse-report.v1.json"));
    const timeline = report.runs[0]!.timeline!;
    const marker = timeline.death_markers[0]!;
    timeline.death_markers = [
      { ...marker, at_micros: 3_000_000, precision: "exact_microsecond" },
      { ...marker, at_micros: 2_000_000, precision: "one_second_bucket" },
    ];
    timeline.loadout_markers = [];
    const root = window.document.createElement("main") as unknown as HTMLElement;
    root.innerHTML = renderTimeline(selectCanonicalGraph(report.runs[0]!));
    window.document.body.append(root as never);
    bindParseReportInteractions(root)();
    const markers = [...root.querySelectorAll<SVGGraphicsElement>(".timeline-marker.death")];
    const exact = markers.find((candidate) => candidate.dataset.timelineMarkerAtMicros === "3000000")!;
    const legacy = markers.find((candidate) => candidate.dataset.timelineMarkerAtMicros === "2000000")!;
    const start = root.querySelector<HTMLInputElement>("input[data-timeline-viewport-start]")!;
    const end = root.querySelector<HTMLInputElement>("input[data-timeline-viewport-end]")!;
    const preview = root.querySelector<HTMLElement>("[data-timeline-lane-preview]")!;

    end.value = "5";
    end.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    start.value = "3";
    start.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);

    expect(exact.getAttribute("tabindex")).toBe("0");
    expect(legacy.getAttribute("tabindex")).toBe("-1");
    legacy.dispatchEvent(new window.FocusEvent("focus") as unknown as Event);
    expect(preview.hidden).toBe(true);
    exact.dispatchEvent(new window.FocusEvent("focus") as unknown as Event);
    expect(preview.hidden).toBe(false);
    expect(preview.textContent).toContain("1 nearby event");
    expect(preview.textContent).not.toContain("2 nearby events");
  });

  it("gives the live legacy route canonical playback and accessible bucket death disclosure", () => {
    const root = mountedLiveLegacyTimeline();
    const play = root.querySelector<HTMLButtonElement>("[data-timeline-play]")!;
    const scrubber = root.querySelector<HTMLInputElement>("[data-timeline-scrubber]")!;
    const trigger = root.querySelector<SVGGraphicsElement>("[data-timeline-death-trigger]")!;
    const summary = root.querySelector<HTMLElement>("[data-timeline-death-summary]")!;
    const zoomIn = root.querySelector<HTMLButtonElement>("[data-timeline-zoom-in]")!;

    expect(root.querySelector(".parse-timeline-chart")).toBeNull();
    expect(root.querySelector(".parse-death-marker")).toBeNull();
    expect(trigger.querySelector(".timeline-death-skull")).not.toBeNull();
    expect(trigger.getAttribute("style")).toContain("color:");
    expect(summary.textContent).toContain("death observed in the 0:03.000–0:04.000 one-second bucket");
    expect(summary.textContent).toContain("This legacy timeline predates exact death-cause evidence.");
    expect(root.querySelector(".timeline-svg")?.getAttribute("data-rate-clock-complete")).toBe("false");
    expect(root.querySelector(".timeline-svg")?.hasAttribute("data-rate-clock")).toBe(false);
    const fullEnd = root.querySelector<HTMLElement>(".combat-timeline")?.dataset.timelineViewportEnd;
    zoomIn.click();
    expect(root.querySelector<HTMLElement>(".combat-timeline")?.dataset.timelineViewportEnd)
      .not.toBe(fullEnd);
    expect(root.querySelector(".combat-timeline .timeline-note")?.textContent).toContain("wall time is not substituted");
    root.querySelector<HTMLButtonElement>("[data-timeline-viewport-reset]")!.click();
    scrubber.value = "0";
    scrubber.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);

    const nextEvent = root.querySelector<HTMLButtonElement>("[data-timeline-event-next]")!;
    nextEvent.click();
    expect(root.querySelector("[data-timeline-inspector]")?.getAttribute("aria-valuenow")).toBe("4");
    expect(root.querySelector("[data-timeline-event-status]")?.textContent).toBe("Event 1 of 1");
    expect(root.querySelector("[data-timeline-live]")?.textContent).toContain("one-second bucket");

    play.click();
    expect(play.textContent).toBe("Pause");
    play.click();
    expect(play.textContent).toBe("Play");
    scrubber.value = "4";
    scrubber.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    expect(root.querySelector("[data-timeline-events]")?.textContent).toContain("death observed");
    expect(root.querySelector(".timeline-snapshot-table")?.textContent).toContain("1s run-time DPS");
    expect(root.querySelector("[data-timeline-inspection]")?.textContent).toContain("run-time DPS");

    trigger.dispatchEvent(new window.MouseEvent("pointerenter", { bubbles: false }) as unknown as Event);
    expect(summary.hidden).toBe(false);
    trigger.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true }) as unknown as Event);
    trigger.dispatchEvent(new window.MouseEvent("click", { bubbles: true }) as unknown as Event);
    expect(summary.hidden).toBe(true);
    trigger.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true }) as unknown as Event);
    trigger.dispatchEvent(new window.MouseEvent("click", { bubbles: true }) as unknown as Event);
    expect(summary.hidden).toBe(false);
  });

  it("shows exact paired eDPS/aDPS variants at a v5 playhead and updates visible totals", () => {
    const report = structuredClone(load<PublicParseReport>("parse-report.v1.json"));
    report.schema_version = 17;
    report.projection_revision = 9;
    const run = report.runs[0]!;
    const timeline = run.timeline!;
    timeline.schema_version = 5;
    timeline.duration_micros = 4_000_000;
    timeline.rate_clock_complete = true;
    timeline.rate_clock = [
      { second: 0, edps_elapsed_micros: 1_000_000, adps_elapsed_micros: 1_000_000 },
      { second: 1, edps_elapsed_micros: 2_000_000, adps_elapsed_micros: 1_000_000 },
      { second: 2, edps_elapsed_micros: 2_000_000, adps_elapsed_micros: 1_000_000 },
      { second: 3, edps_elapsed_micros: 3_000_000, adps_elapsed_micros: 2_000_000 },
    ];
    timeline.omitted.rate_clock_points = 0;
    timeline.omitted.series_points = 0;
    run.participants = run.participants.slice(0, 2);
    run.participants[0]!.series = [
      { second: 0, damage: 100, effective_healing: 0, damage_taken: 0 },
      { second: 1, damage: 100, effective_healing: 0, damage_taken: 0 },
      { second: 3, damage: 100, effective_healing: 0, damage_taken: 0 },
    ];
    run.participants[1]!.series = [
      { second: 0, damage: 50, effective_healing: 0, damage_taken: 0 },
      { second: 1, damage: 50, effective_healing: 0, damage_taken: 0 },
      { second: 3, damage: 50, effective_healing: 0, damage_taken: 0 },
    ];
    timeline.participant_tracks = run.participants.map((participant, index) => ({
      actor_id: participant.actor_id,
      character_id: participant.character_id,
      observed_character_key: participant.observed_character_key ?? null,
      display_name: participant.display_name,
      canonical_participant_index: index,
      series_point_count: participant.series!.length,
    }));
    timeline.death_markers = [];
    timeline.loadout_markers = [];
    timeline.rdps_influence_spans = [];

    const root = window.document.createElement("main") as unknown as HTMLElement;
    root.innerHTML = renderTimeline(selectCanonicalGraph(run));
    window.document.body.append(root as never);
    bindParseReportInteractions(root)();
    const scrubber = root.querySelector<HTMLInputElement>("[data-timeline-scrubber]")!;
    root.querySelector<HTMLButtonElement>("[data-timeline-zoom-in]")!.click();
    expect(root.querySelector(".timeline-range-table")?.textContent).toContain("eDPS");
    expect(root.querySelector(".timeline-range-table")?.textContent).toContain("aDPS");
    expect(root.querySelector(".timeline-range-table .timeline-snapshot-total")?.textContent).toContain("150");
    expect(root.querySelector(".timeline-range-table .timeline-snapshot-total")?.textContent).toContain("300");
    expect(root.querySelector(".timeline-range-table")?.textContent).not.toContain("unavailable");
    expect(root.querySelector("[data-timeline-event-status]")?.textContent).toBe("No events in the visible range");
    expect(root.querySelector<HTMLButtonElement>("[data-timeline-event-previous]")?.disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>("[data-timeline-event-next]")?.disabled).toBe(true);
    scrubber.value = "3";
    scrubber.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    expect(root.querySelector(".timeline-snapshot-table")?.textContent).toContain("1s eDPS / aDPS");
    expect(root.querySelector(".timeline-snapshot-table")?.textContent).toContain("100 / 200");
    expect(root.querySelector("[data-timeline-inspector]")?.getAttribute("aria-valuetext"))
      .toContain("1s eDPS — / aDPS —");

    scrubber.value = "4";
    scrubber.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    expect(root.querySelector(".timeline-snapshot-table .timeline-snapshot-total")?.textContent).toContain("150 / 225");
    root.querySelector<HTMLButtonElement>('[data-participant-toggle="1"]')!.click();
    expect(root.querySelector(".timeline-snapshot-table .timeline-snapshot-total")?.textContent).toContain("100 / 150");
    expect(root.querySelector(".timeline-snapshot-table .timeline-snapshot-total")?.textContent).not.toContain("150 / 225");
  });

  it("marks unprovable 5s and 10s fractional-tail pairs unavailable in the table and ARIA text", () => {
    const report = structuredClone(load<PublicParseReport>("parse-report.v1.json"));
    report.schema_version = 17;
    report.projection_revision = 9;
    const run = report.runs[0]!;
    const timeline = run.timeline!;
    timeline.schema_version = 5;
    timeline.duration_micros = 10_100_000;
    timeline.rate_clock_complete = true;
    timeline.rate_clock = Array.from({ length: 11 }, (_, second) => ({
      second,
      edps_elapsed_micros: Math.min((second + 1) * 1_000_000, timeline.duration_micros),
      adps_elapsed_micros: Math.min((second + 1) * 1_000_000, timeline.duration_micros),
    }));
    timeline.omitted.rate_clock_points = 0;
    timeline.omitted.series_points = 0;
    run.participants = run.participants.slice(0, 1);
    run.participants[0]!.series = Array.from({ length: 11 }, (_, second) => ({
      second,
      damage: second === 10 ? 10 : 100,
      effective_healing: 0,
      damage_taken: 0,
    }));
    timeline.participant_tracks = [{
      actor_id: run.participants[0]!.actor_id,
      character_id: run.participants[0]!.character_id,
      observed_character_key: run.participants[0]!.observed_character_key ?? null,
      display_name: run.participants[0]!.display_name,
      canonical_participant_index: 0,
      series_point_count: 11,
    }];
    timeline.death_markers = [];
    timeline.loadout_markers = [];
    timeline.rdps_influence_spans = [];

    const root = window.document.createElement("main") as unknown as HTMLElement;
    root.innerHTML = renderTimeline(selectCanonicalGraph(run));
    window.document.body.append(root as never);
    bindParseReportInteractions(root)();
    const scrubber = root.querySelector<HTMLInputElement>("[data-timeline-scrubber]")!;
    scrubber.value = "11";
    scrubber.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    const cells = [...root.querySelectorAll<HTMLElement>(".timeline-snapshot-table tbody tr:last-child td")]
      .map((cell) => cell.textContent);
    expect(cells).toEqual(["100 / 100", "— / —", "— / —", "100 / 100"]);
    const aria = root.querySelector("[data-timeline-inspector]")?.getAttribute("aria-valuetext");
    expect(aria).toContain("5s eDPS — / aDPS —");
    expect(aria).toContain("10s eDPS — / aDPS —");
  });

  it("keeps authoritative marker context synchronized across scrub, keyboard, and playback cursors", () => {
    const root = mountedTimeline();
    const events = root.querySelector<HTMLElement>("[data-timeline-events]")!;
    const scrubber = root.querySelector<HTMLInputElement>("[data-timeline-scrubber]")!;
    const inspector = root.querySelector<SVGRectElement>("[data-timeline-inspector]")!;
    const play = root.querySelector<HTMLButtonElement>("[data-timeline-play]")!;

    expect(events.textContent).toBe("");
    scrubber.value = "2";
    scrubber.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    expect(events.textContent).toContain("Heavy Guardian loadout phase 1 at 0:01.400");
    expect(inspector.getAttribute("aria-valuetext")).toContain("Events at this point");

    inspector.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }) as unknown as Event);
    expect(events.textContent).not.toContain("death observed");
    inspector.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }) as unknown as Event);
    expect(events.textContent).toContain("Marksman death observed in the 0:03.000–0:04.000 one-second bucket");
    expect(root.querySelector(".timeline-marker.death")?.classList.contains("is-current")).toBe(true);

    inspector.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Home", bubbles: true }) as unknown as Event);
    play.click();
    animationFrame!(0);
    animationFrame!(1_000);
    expect(events.textContent).toContain("MarieRose loadout phase 1 at 0:01");
    expect(root.querySelector(".timeline-marker.death")?.classList.contains("is-current")).toBe(false);
  });

  it("keeps pointer scrubbing active while the pointer is over a hoverable death marker", () => {
    const root = mountedTimeline();
    const svg = root.querySelector<SVGSVGElement>(".timeline-svg")!;
    const inspector = root.querySelector<SVGRectElement>("[data-timeline-inspector]")!;
    const death = root.querySelector<SVGGraphicsElement>(".timeline-marker.death")!;
    const play = root.querySelector<HTMLButtonElement>("[data-timeline-play]")!;
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 980, bottom: 360, width: 980, height: 360,
      toJSON: () => ({}),
    });
    const deathViewX = Number(svg.dataset.plotLeft)
      + Number(svg.dataset.plotWidth) * 3.5 / (Number(svg.dataset.durationMicros) / 1_000_000);

    play.click();
    svg.dispatchEvent(new window.MouseEvent("pointermove", {
      bubbles: true,
      clientX: 20,
      clientY: 100,
    }) as unknown as Event);
    expect(play.textContent).toBe("Pause");

    death.dispatchEvent(new window.MouseEvent("pointermove", {
      bubbles: true,
      clientX: deathViewX / 1_040 * 980,
      clientY: 100,
    }) as unknown as Event);

    expect(inspector.getAttribute("aria-valuenow")).toBe("4");
    expect(root.querySelector("[data-timeline-events]")?.textContent).toContain("Marksman death observed");
    expect(play.textContent).toBe("Play");
  });

  it("aggregates only nearby same-lane events and supports mouse, keyboard, touch pinning, Escape, and outside close", () => {
    const report = structuredClone(load<PublicParseReport>("parse-report.v1.json"));
    const timeline = report.runs[0]!.timeline!;
    const mine = timeline.loadout_markers[0]!;
    const teammate = timeline.loadout_markers[1]!;
    timeline.loadout_markers = [mine,
      ...Array.from({ length: 7 }, (_, index) => ({
        ...mine, at_micros: 1_010_000 + index * 10_000, phase_index: 20 + index,
      })),
      { ...teammate, at_micros: 1_020_000, phase_index: 99 },
    ];
    const root = window.document.createElement("main") as unknown as HTMLElement;
    root.innerHTML = renderTimeline(selectCanonicalGraph(report.runs[0]!));
    window.document.body.append(root as never);
    bindParseReportInteractions(root)();
    const trigger = root.querySelector<SVGGraphicsElement>('[data-timeline-marker-lane="participant-0"]')!;
    const preview = root.querySelector<HTMLElement>("[data-timeline-lane-preview]")!;

    trigger.dispatchEvent(new window.PointerEvent("pointerenter", { pointerType: "mouse" }) as unknown as Event);
    expect(preview.hidden).toBe(false);
    expect(preview.textContent).toContain("8 nearby events");
    expect(preview.textContent).toContain("2 more nearby events");
    expect(preview.textContent).not.toContain("Verdant Oracle");
    trigger.dispatchEvent(new window.PointerEvent("pointerleave", { pointerType: "mouse" }) as unknown as Event);
    expect(preview.hidden).toBe(true);

    trigger.dispatchEvent(new window.FocusEvent("focus") as unknown as Event);
    expect(preview.hidden).toBe(false);
    trigger.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }) as unknown as Event);
    expect(preview.hidden).toBe(true);

    trigger.dispatchEvent(new window.PointerEvent("pointerenter", { pointerType: "touch" }) as unknown as Event);
    expect(preview.hidden).toBe(true);
    trigger.dispatchEvent(new window.MouseEvent("click", { bubbles: true }) as unknown as Event);
    expect(preview.hidden).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    window.document.body.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true }));
    expect(preview.hidden).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens death details on hover and focus, closes on Escape and participant hide", () => {
    const root = mountedDeathCauseTimeline();
    const trigger = root.querySelector<SVGGraphicsElement>("[data-timeline-death-trigger]")!;
    const summary = root.querySelector<HTMLElement>("[data-timeline-death-summary]")!;
    let escapedToDocument = false;
    window.document.addEventListener("keydown", () => { escapedToDocument = true; });

    expect(summary.hidden).toBe(true);
    expect(summary.textContent).toContain("MarieRose (source actor ID 7)");
    expect(summary.textContent).toContain("Powerdraw (ability ID 2203291)");
    trigger.dispatchEvent(new window.MouseEvent("pointerenter", { bubbles: false }) as unknown as Event);
    expect(summary.hidden).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    trigger.dispatchEvent(new window.MouseEvent("pointerleave", { bubbles: false }) as unknown as Event);
    expect(summary.hidden).toBe(false);

    trigger.dispatchEvent(new window.FocusEvent("focus") as unknown as Event);
    expect(summary.hidden).toBe(false);
    trigger.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }) as unknown as Event);
    expect(summary.hidden).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(escapedToDocument).toBe(false);

    trigger.dispatchEvent(new window.FocusEvent("blur") as unknown as Event);
    trigger.dispatchEvent(new window.FocusEvent("focus") as unknown as Event);
    expect(summary.hidden).toBe(false);
    const participantToggle = root.querySelector<HTMLButtonElement>('[data-participant-toggle="2"]')!;
    participantToggle.click();
    expect(trigger.hasAttribute("hidden")).toBe(true);
    expect(summary.hidden).toBe(true);
    participantToggle.click();
    expect(trigger.hasAttribute("hidden")).toBe(false);
    expect(summary.hidden).toBe(true);
  });

  it("renders trusted published hit labels as text without creating injected elements", () => {
    const report = load<PublicParseReport>("parse-report.v1.json");
    const timeline = report.runs[0]!.timeline!;
    timeline.schema_version = 5;
    const marker = timeline.death_markers[0]!;
    marker.precision = "exact_microsecond";
    marker.cause = {
      evidence: "packet_terminal_damage",
      final_hit: {
        at_micros: marker.at_micros,
        source_actor_id: "monster-9",
        direct_source_actor_id: "summon-3",
        ability_id: "action-4",
        source_presentation: { actor_id: "monster-9", name: "Boss <script>bad()</script>", provenance: "exact_build_monster_catalog" },
        direct_source_presentation: { actor_id: "summon-3", name: "Summon <img src=x>", provenance: "exact_build_monster_catalog" },
        ability_presentation: { ability_id: "action-4", name: "Slash <svg onload=bad()>", provenance: "exact_build_action_catalog" },
        reported_damage: 100,
        effective_damage: 100,
        critical: false,
      },
      prior_hits: [],
      prior_hits_truncated: false,
    };
    const root = window.document.createElement("main") as unknown as HTMLElement;
    root.innerHTML = renderTimeline(selectCanonicalGraph(report.runs[0]!));
    const summary = root.querySelector<HTMLElement>("[data-timeline-death-summary]")!;

    expect(summary.textContent).toContain("Boss <script>bad()</script> (source actor ID monster-9)");
    expect(summary.textContent).toContain("Summon <img src=x> (direct source actor ID summon-3)");
    expect(summary.textContent).toContain("Slash <svg onload=bad()> (ability ID action-4)");
    expect(summary.querySelector("script")).toBeNull();
    expect(summary.querySelector("img")).toBeNull();
    expect(summary.querySelector("svg")).toBeNull();
  });

  it("keeps hover details open while crossing the SVG-to-summary gap", () => {
    vi.useFakeTimers();
    try {
      const root = mountedDeathCauseTimeline();
      const trigger = root.querySelector<SVGGraphicsElement>("[data-timeline-death-trigger]")!;
      const summary = root.querySelector<HTMLElement>("[data-timeline-death-summary]")!;

      trigger.dispatchEvent(new window.MouseEvent("pointerenter") as unknown as Event);
      expect(summary.hidden).toBe(false);
      trigger.dispatchEvent(new window.MouseEvent("pointerleave") as unknown as Event);
      vi.advanceTimersByTime(800);
      expect(summary.hidden).toBe(false);
      summary.dispatchEvent(new window.MouseEvent("pointerenter") as unknown as Event);
      vi.advanceTimersByTime(500);
      expect(summary.hidden).toBe(false);
      expect(trigger.getAttribute("aria-expanded")).toBe("true");

      summary.dispatchEvent(new window.MouseEvent("pointerleave") as unknown as Event);
      vi.advanceTimersByTime(1_199);
      expect(summary.hidden).toBe(false);
      vi.advanceTimersByTime(1);
      expect(summary.hidden).toBe(true);
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
    } finally {
      vi.useRealTimers();
    }
  });

  it("toggles death details with repeated click and keyboard activation", () => {
    const root = mountedDeathCauseTimeline();
    const trigger = root.querySelector<SVGGraphicsElement>("[data-timeline-death-trigger]")!;
    const summary = root.querySelector<HTMLElement>("[data-timeline-death-summary]")!;
    const click = () => trigger.dispatchEvent(new window.MouseEvent("click", { bubbles: true }) as unknown as Event);
    const key = (value: string) => trigger.dispatchEvent(new window.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true }) as unknown as Event);

    click();
    expect(summary.hidden).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    click();
    expect(summary.hidden).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    key("Enter");
    expect(summary.hidden).toBe(false);
    key("Enter");
    expect(summary.hidden).toBe(true);
    key(" ");
    expect(summary.hidden).toBe(false);
    key(" ");
    expect(summary.hidden).toBe(true);
  });

  it("opens and pins on the first touch activation, then closes on the second", () => {
    const root = mountedDeathCauseTimeline();
    const trigger = root.querySelector<SVGGraphicsElement>("[data-timeline-death-trigger]")!;
    const summary = root.querySelector<HTMLElement>("[data-timeline-death-summary]")!;
    const touchPointerDown = () => {
      const event = new window.Event("pointerdown", { bubbles: true });
      Object.defineProperty(event, "pointerType", { value: "touch" });
      trigger.dispatchEvent(event as unknown as Event);
    };

    touchPointerDown();
    trigger.dispatchEvent(new window.FocusEvent("focus") as unknown as Event);
    trigger.dispatchEvent(new window.MouseEvent("click", { bubbles: true }) as unknown as Event);
    expect(summary.hidden).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.dataset.timelineDeathPinned).toBe("true");

    touchPointerDown();
    trigger.dispatchEvent(new window.MouseEvent("click", { bubbles: true }) as unknown as Event);
    expect(summary.hidden).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.dataset.timelineDeathPinned).toBe("false");
  });

  it("hides and restores participant-scoped markers and cursor evidence without resetting timeline state", () => {
    const root = mountedTimeline();
    const timeline = root.querySelector<HTMLElement>("[data-timeline-metric]")!;
    const start = root.querySelector<HTMLInputElement>("input[data-timeline-viewport-start]")!;
    const end = root.querySelector<HTMLInputElement>("input[data-timeline-viewport-end]")!;
    const scrubber = root.querySelector<HTMLInputElement>("[data-timeline-scrubber]")!;
    const inspector = root.querySelector<SVGRectElement>("[data-timeline-inspector]")!;
    const marker = root.querySelector<SVGLineElement>('[data-timeline-marker-participant="3"][data-timeline-marker-boundary="2"]')!;
    const death = root.querySelector<SVGGraphicsElement>('.timeline-marker.death[data-timeline-marker-participant="2"]')!;

    start.value = "1";
    start.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    end.value = "3";
    end.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    root.querySelector<HTMLButtonElement>('[data-metric="effective_healing"]')!.click();
    root.querySelector<HTMLButtonElement>('[data-window="10"]')!.click();
    scrubber.value = "2";
    scrubber.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    expect(root.querySelector("[data-timeline-events]")?.textContent).toContain("Heavy Guardian loadout phase 1");
    expect(marker.classList.contains("is-current")).toBe(true);

    root.querySelector<HTMLButtonElement>('[data-participant-toggle="3"]')!.click();
    root.querySelector<HTMLButtonElement>('[data-participant-toggle="2"]')!.click();
    expect(marker.hasAttribute("hidden")).toBe(true);
    expect(death.hasAttribute("hidden")).toBe(true);
    expect(marker.classList.contains("is-current")).toBe(false);
    expect(root.querySelector("[data-timeline-events]")?.textContent).not.toContain("Heavy Guardian");
    expect(inspector.getAttribute("aria-valuetext")).not.toContain("Heavy Guardian");
    expect(timeline.dataset.timelineMetric).toBe("effective_healing");
    expect(timeline.dataset.timelineWindow).toBe("10");
    expect(timeline.dataset.timelineViewportStart).toBe("1");
    expect(timeline.dataset.timelineViewportEnd).toBe("3");
    expect(scrubber.value).toBe("2");

    root.querySelector<HTMLButtonElement>("[data-participant-show-all]")!.click();
    expect(marker.hasAttribute("hidden")).toBe(false);
    expect(death.hasAttribute("hidden")).toBe(false);
    expect(marker.classList.contains("is-current")).toBe(true);
    expect(root.querySelector("[data-timeline-events]")?.textContent).toContain("Heavy Guardian loadout phase 1");
    expect(inspector.getAttribute("aria-valuetext")).toContain("Heavy Guardian loadout phase 1");

    root.querySelector<HTMLButtonElement>("[data-participant-clear]")!.click();
    expect([...root.querySelectorAll<SVGLineElement>("[data-timeline-marker-participant]")]
      .every((candidate) => candidate.hasAttribute("hidden"))).toBe(true);
    expect(root.querySelector("[data-timeline-events]")?.textContent).toBe("");
    expect(timeline.dataset.timelineMetric).toBe("effective_healing");
    expect(timeline.dataset.timelineWindow).toBe("10");
    expect(timeline.dataset.timelineViewportStart).toBe("1");
    expect(timeline.dataset.timelineViewportEnd).toBe("3");
    expect(scrubber.value).toBe("2");
  });

  it("keeps ambiguous and unmatched markers visible through participant filtering", () => {
    const report = load<PublicParseReport>("parse-report.v1.json");
    const graph = selectCanonicalGraph(report.runs[0]);
    const duplicate = {
      ...structuredClone(graph.participants[1]!),
      actor_id: graph.participants[2]!.actor_id,
      character_id: graph.participants[3]!.character_id,
      display_name: "Ambiguous witness",
    };
    const participants = [...graph.participants, duplicate];
    const timeline = {
      ...graph.timeline!,
      participant_tracks: [...graph.timeline!.participant_tracks, {
        actor_id: duplicate.actor_id,
        character_id: duplicate.character_id,
        observed_character_key: duplicate.observed_character_key ?? null,
        display_name: duplicate.display_name,
        canonical_participant_index: participants.length - 1,
        series_point_count: duplicate.series?.length ?? 0,
      }],
      loadout_markers: [...graph.timeline!.loadout_markers, {
        ...graph.timeline!.loadout_markers[1]!,
        character_id: "unmatched-character",
        at_micros: 1_500_000,
      }],
    };
    const root = window.document.createElement("main") as unknown as HTMLElement;
    root.innerHTML = renderTimeline({ ...graph, participants, timeline });
    window.document.body.append(root as never);
    bindParseReportInteractions(root)();
    const scrubber = root.querySelector<HTMLInputElement>("[data-timeline-scrubber]")!;
    scrubber.value = "2";
    scrubber.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);

    const ambiguous = root.querySelector<SVGLineElement>('.timeline-marker.loadout[data-timeline-marker-label^="Character c13"]')!;
    const unmatched = root.querySelector<SVGLineElement>('.timeline-marker.loadout[data-timeline-marker-label^="Character unmatched-character"]')!;
    expect(ambiguous.hasAttribute("data-timeline-marker-participant")).toBe(false);
    expect(unmatched.hasAttribute("data-timeline-marker-participant")).toBe(false);
    root.querySelector<HTMLButtonElement>("[data-participant-clear]")!.click();
    expect(ambiguous.hasAttribute("hidden")).toBe(false);
    expect(unmatched.hasAttribute("hidden")).toBe(false);
    expect(root.querySelector("[data-timeline-events]")?.textContent).toContain("Character c13 loadout phase 1");
    expect(root.querySelector("[data-timeline-events]")?.textContent).toContain("Character unmatched-character loadout changed");
  });

  it("does not advance a bucket early and completes a fractional run at its exact endpoint", () => {
    const report = load<PublicParseReport>("parse-report.v1.json");
    report.runs[0]!.timeline!.duration_micros = 2_200_000;
    const root = window.document.createElement("main") as unknown as HTMLElement;
    root.innerHTML = renderTimeline(selectCanonicalGraph(report.runs[0]!));
    window.document.body.append(root as never);
    bindParseReportInteractions(root)();
    const play = root.querySelector<HTMLButtonElement>("[data-timeline-play]")!;
    const inspector = root.querySelector<SVGRectElement>("[data-timeline-inspector]")!;

    play.click();
    animationFrame!(0);
    animationFrame!(499);
    expect(inspector.getAttribute("aria-valuenow")).toBe("0");
    animationFrame!(1_000);
    expect(inspector.getAttribute("aria-valuenow")).toBe("1");
    animationFrame!(2_199);
    expect(inspector.getAttribute("aria-valuenow")).toBe("2");
    expect(play.textContent).toBe("Pause");
    animationFrame!(2_200);
    expect(inspector.getAttribute("aria-valuenow")).toBe("3");
    expect(play.textContent).toBe("Play");
    const start = root.querySelector<HTMLInputElement>("input[data-timeline-viewport-start]")!;
    const overview = root.querySelector<HTMLElement>("[data-timeline-overview-slider]")!;
    start.value = "1";
    start.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    expect(Number.parseFloat(overview.style.getPropertyValue("--timeline-overview-left"))).toBeCloseTo(100 / 2.2, 5);
    expect(Number.parseFloat(overview.style.getPropertyValue("--timeline-overview-width"))).toBeCloseTo(100 * 1.2 / 2.2, 5);
    expect(overview.getAttribute("aria-valuetext")).toContain("0:01.000–0:02.200");
  });

  it("zooms the visible range, bounds navigation and playback, and resets without rebasing snapshots", () => {
    const root = mountedTimeline();
    const timeline = root.querySelector<HTMLElement>(".combat-timeline")!;
    const start = root.querySelector<HTMLInputElement>("input[data-timeline-viewport-start]")!;
    const end = root.querySelector<HTMLInputElement>("input[data-timeline-viewport-end]")!;
    const reset = root.querySelector<HTMLButtonElement>("[data-timeline-viewport-reset]")!;
    const scrubber = root.querySelector<HTMLInputElement>("[data-timeline-scrubber]")!;
    const inspector = root.querySelector<SVGRectElement>("[data-timeline-inspector]")!;
    const fullRangeCaption = root.querySelector(".timeline-range-table caption")?.textContent;

    scrubber.value = "2";
    scrubber.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    const ratesAtTwo = root.querySelector(".timeline-snapshot-table")?.textContent;

    start.value = "1";
    start.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    end.value = "3";
    end.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);

    expect(timeline.dataset.timelineViewportStart).toBe("1");
    expect(timeline.dataset.timelineViewportEnd).toBe("3");
    expect(scrubber.min).toBe("1");
    expect(scrubber.max).toBe("3");
    expect(reset.disabled).toBe(false);
    expect(root.querySelector("[data-timeline-viewport-status]")?.textContent).toContain("Visible");
    expect(root.querySelector(".timeline-range-table caption")?.textContent).toContain("0:01.000–0:03.000");
    expect(root.querySelector(".timeline-range-table")?.textContent).toContain("eDPS");
    expect(inspector.getAttribute("aria-valuenow")).toBe("2");
    expect(root.querySelector(".timeline-snapshot-table")?.textContent).toBe(ratesAtTwo);
    const deathSymbol = root.querySelector<SVGGElement>("[data-timeline-marker-symbol]")!;
    const viewportGeometry = deathSymbol.closest<SVGGElement>("[data-timeline-viewport-elapsed-geometry]")!;
    const elapsedScale = Number(viewportGeometry.getAttribute("transform")?.match(/^matrix\(([^ ]+)/u)?.[1]);
    const symbolScale = Number(deathSymbol.getAttribute("transform")?.match(/scale\(([^ ]+)/u)?.[1]);
    expect(elapsedScale * symbolScale).toBeCloseTo(1, 5);

    root.querySelector<HTMLButtonElement>('[data-metric="rdps_damage"]')!.click();
    const rdpsAtTwo = root.querySelector(".timeline-snapshot-table")?.textContent;
    const selectedRange = root.querySelector(".timeline-range-table")?.textContent;
    expect(rdpsAtTwo).toContain("rDPS");

    inspector.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Home", bubbles: true }) as unknown as Event);
    expect(inspector.getAttribute("aria-valuenow")).toBe("1");
    inspector.dispatchEvent(new window.KeyboardEvent("keydown", { key: "End", bubbles: true }) as unknown as Event);
    expect(inspector.getAttribute("aria-valuenow")).toBe("3");
    expect(root.querySelector(".timeline-snapshot-table caption")?.textContent).toContain("DPS at 0:03");
    expect(root.querySelector(".timeline-range-table")?.textContent).toBe(selectedRange);

    reset.click();
    expect(timeline.dataset.timelineViewportStart).toBe("0");
    expect(reset.disabled).toBe(true);
    expect(root.querySelector(".timeline-range-table caption")?.textContent).toBe(fullRangeCaption);
    scrubber.value = "2";
    scrubber.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    expect(root.querySelector(".timeline-snapshot-table")?.textContent).toBe(rdpsAtTwo);
  });

  it("pans the shared viewport from the overview with keyboard, tap, and drag", () => {
    const report = structuredClone(load<PublicParseReport>("parse-report.v1.json"));
    report.runs[0]!.timeline!.duration_micros = 4_000_000;
    const root = window.document.createElement("main") as unknown as HTMLElement;
    root.innerHTML = renderTimeline(selectCanonicalGraph(report.runs[0]!));
    window.document.body.append(root as never);
    bindParseReportInteractions(root)();
    const timeline = root.querySelector<HTMLElement>(".combat-timeline")!;
    const start = root.querySelector<HTMLInputElement>("input[data-timeline-viewport-start]")!;
    const end = root.querySelector<HTMLInputElement>("input[data-timeline-viewport-end]")!;
    const overview = root.querySelector<HTMLElement>("[data-timeline-overview-slider]")!;
    const play = root.querySelector<HTMLButtonElement>("[data-timeline-play]")!;
    const inspector = root.querySelector<SVGRectElement>("[data-timeline-inspector]")!;
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.assign(overview, {
      getBoundingClientRect: () => ({ left: 0, right: 100, top: 0, bottom: 44, width: 100, height: 44, x: 0, y: 0, toJSON: () => ({}) }),
      setPointerCapture,
      hasPointerCapture: () => true,
      releasePointerCapture,
    });

    expect(overview.getAttribute("aria-disabled")).toBe("true");
    expect(overview.getAttribute("aria-valuetext")).toContain("Full run");
    play.click();
    overview.dispatchEvent(new window.PointerEvent("pointerdown", { pointerId: 1, button: 0, clientX: 90, bubbles: true }) as unknown as Event);
    overview.dispatchEvent(new window.PointerEvent("pointerup", { pointerId: 1, button: 0, clientX: 90, bubbles: true }) as unknown as Event);
    expect(play.textContent).toBe("Pause");
    expect(play.getAttribute("aria-pressed")).toBe("true");
    overview.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }) as unknown as Event);
    expect(play.textContent).toBe("Pause");
    expect(play.getAttribute("aria-pressed")).toBe("true");
    expect(setPointerCapture).not.toHaveBeenCalled();
    play.click();
    start.value = "1";
    start.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    end.value = "3";
    end.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    expect(overview.getAttribute("aria-valuenow")).toBe("1");
    expect(overview.getAttribute("aria-valuemax")).toBe("2");
    expect(overview.getAttribute("aria-valuetext")).toContain("Visible 0:01.000–0:03.000");
    expect(overview.style.getPropertyValue("--timeline-overview-left")).toBe("25%");
    expect(overview.style.getPropertyValue("--timeline-overview-width")).toBe("50%");

    overview.dispatchEvent(new window.PointerEvent("pointerdown", { pointerId: 5, button: 0, clientX: 24, bubbles: true }) as unknown as Event);
    overview.dispatchEvent(new window.PointerEvent("pointerup", { pointerId: 5, button: 0, clientX: 24, bubbles: true }) as unknown as Event);
    expect(timeline.dataset.timelineViewportStart).toBe("0");
    expect(timeline.dataset.timelineViewportEnd).toBe("2");
    start.value = "1";
    start.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    end.value = "3";
    end.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    overview.dispatchEvent(new window.PointerEvent("pointerdown", { pointerId: 6, button: 0, clientX: 76, bubbles: true }) as unknown as Event);
    overview.dispatchEvent(new window.PointerEvent("pointerup", { pointerId: 6, button: 0, clientX: 76, bubbles: true }) as unknown as Event);
    expect(timeline.dataset.timelineViewportStart).toBe("2");
    expect(timeline.dataset.timelineViewportEnd).toBe("4");
    start.value = "1";
    start.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    end.value = "3";
    end.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);

    play.click();
    expect(play.textContent).toBe("Pause");
    overview.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }) as unknown as Event);
    expect(play.textContent).toBe("Play");
    expect(timeline.dataset.timelineViewportStart).toBe("2");
    expect(timeline.dataset.timelineViewportEnd).toBe("4");
    expect(start.value).toBe("2");
    expect(end.value).toBe("4");
    expect(inspector.getAttribute("aria-valuenow")).toBe("2");
    overview.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }) as unknown as Event);
    expect(timeline.dataset.timelineViewportStart).toBe("2");
    overview.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Home", bubbles: true }) as unknown as Event);
    expect(timeline.dataset.timelineViewportStart).toBe("0");
    expect(timeline.dataset.timelineViewportEnd).toBe("2");
    overview.dispatchEvent(new window.KeyboardEvent("keydown", { key: "PageUp", bubbles: true }) as unknown as Event);
    expect(timeline.dataset.timelineViewportStart).toBe("2");
    overview.dispatchEvent(new window.KeyboardEvent("keydown", { key: "PageDown", bubbles: true }) as unknown as Event);
    expect(timeline.dataset.timelineViewportStart).toBe("0");
    overview.dispatchEvent(new window.KeyboardEvent("keydown", { key: "End", bubbles: true }) as unknown as Event);
    expect(timeline.dataset.timelineViewportStart).toBe("2");

    overview.dispatchEvent(new window.PointerEvent("pointerdown", { pointerId: 7, button: 0, clientX: 10, bubbles: true }) as unknown as Event);
    expect(timeline.dataset.timelineViewportStart).toBe("2");
    overview.dispatchEvent(new window.PointerEvent("pointerup", { pointerId: 7, button: 0, clientX: 10, bubbles: true }) as unknown as Event);
    expect(timeline.dataset.timelineViewportStart).toBe("0");
    expect(setPointerCapture).toHaveBeenCalledWith(7);
    overview.dispatchEvent(new window.PointerEvent("pointerdown", { pointerId: 8, button: 0, clientX: 10, bubbles: true }) as unknown as Event);
    overview.dispatchEvent(new window.PointerEvent("pointermove", { pointerId: 8, clientX: 90, bubbles: true }) as unknown as Event);
    expect(timeline.dataset.timelineViewportStart).toBe("2");
    overview.dispatchEvent(new window.PointerEvent("pointercancel", { pointerId: 8, bubbles: true }) as unknown as Event);
    expect(releasePointerCapture).toHaveBeenCalledWith(8);
    overview.dispatchEvent(new window.PointerEvent("pointermove", { pointerId: 8, clientX: 10, bubbles: true }) as unknown as Event);
    expect(timeline.dataset.timelineViewportStart).toBe("2");
  });

  it("directly zooms and pans the plot while preserving inspection and interactive markers", () => {
    const report = structuredClone(load<PublicParseReport>("parse-report.v1.json"));
    report.runs[0]!.timeline!.duration_micros = 4_000_000;
    const root = window.document.createElement("main") as unknown as HTMLElement;
    root.innerHTML = renderTimeline(selectCanonicalGraph(report.runs[0]!));
    window.document.body.append(root as never);
    bindParseReportInteractions(root)();
    const timeline = root.querySelector<HTMLElement>(".combat-timeline")!;
    const svg = root.querySelector<SVGSVGElement>(".timeline-svg")!;
    const inspector = root.querySelector<SVGRectElement>("[data-timeline-inspector]")!;
    const death = root.querySelector<SVGGraphicsElement>("[data-timeline-death-trigger]")!;
    const loadout = root.querySelector<SVGLineElement>(".timeline-marker.loadout")!;
    const play = root.querySelector<HTMLButtonElement>("[data-timeline-play]")!;
    const zoomIn = root.querySelector<HTMLButtonElement>("[data-timeline-zoom-in]")!;
    const zoomOut = root.querySelector<HTMLButtonElement>("[data-timeline-zoom-out]")!;
    const earlier = root.querySelector<HTMLButtonElement>("[data-timeline-pan-earlier]")!;
    const later = root.querySelector<HTMLButtonElement>("[data-timeline-pan-later]")!;
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.assign(svg, {
      getBoundingClientRect: () => ({ left: 0, right: 1_040, top: 0, bottom: 320, width: 1_040, height: 320, x: 0, y: 0, toJSON: () => ({}) }),
      setPointerCapture,
      hasPointerCapture: () => true,
      releasePointerCapture,
    });

    const zoomOutAtFull = new window.WheelEvent("wheel", {
      clientX: 784, clientY: 100, deltaY: 100, cancelable: true, bubbles: true,
    } as never);
    svg.dispatchEvent(zoomOutAtFull as unknown as Event);
    expect(zoomOutAtFull.defaultPrevented).toBe(false);
    expect(zoomOut.disabled).toBe(true);

    play.click();
    const zoomAtCursor = new window.WheelEvent("wheel", {
      clientX: 784, clientY: 100, deltaY: -100, cancelable: true, bubbles: true,
    } as never);
    svg.dispatchEvent(zoomAtCursor as unknown as Event);
    expect(zoomAtCursor.defaultPrevented).toBe(true);
    expect(play.textContent).toBe("Play");
    expect(timeline.dataset.timelineViewportStart).toBe("1");
    expect(timeline.dataset.timelineViewportEnd).toBe("4");
    expect(earlier.disabled).toBe(false);
    expect(later.disabled).toBe(true);
    expect(zoomOut.disabled).toBe(false);

    const markerWheel = new window.WheelEvent("wheel", {
      clientX: 784, clientY: 100, deltaY: -100, cancelable: true, bubbles: true,
    } as never);
    death.dispatchEvent(markerWheel as unknown as Event);
    expect(markerWheel.defaultPrevented).toBe(false);
    expect(timeline.dataset.timelineViewportStart).toBe("1");

    const loadoutViewport = `${timeline.dataset.timelineViewportStart}:${timeline.dataset.timelineViewportEnd}`;
    const loadoutWheel = new window.WheelEvent("wheel", {
      clientX: 500, clientY: 100, deltaY: -100, cancelable: true, bubbles: true,
    } as never);
    loadout.dispatchEvent(loadoutWheel as unknown as Event);
    expect(loadoutWheel.defaultPrevented).toBe(false);
    expect(`${timeline.dataset.timelineViewportStart}:${timeline.dataset.timelineViewportEnd}`).toBe(loadoutViewport);
    const loadoutPan = new window.PointerEvent("pointerdown", {
      pointerId: 39, button: 0, shiftKey: true, clientX: 500, clientY: 100, cancelable: true, bubbles: true,
    });
    loadout.dispatchEvent(loadoutPan as unknown as Event);
    expect(loadoutPan.defaultPrevented).toBe(false);
    expect(setPointerCapture).not.toHaveBeenCalledWith(39);
    const loadoutReset = new window.MouseEvent("dblclick", {
      clientX: 500, clientY: 100, cancelable: true, bubbles: true,
    });
    loadout.dispatchEvent(loadoutReset as unknown as Event);
    expect(loadoutReset.defaultPrevented).toBe(false);
    expect(`${timeline.dataset.timelineViewportStart}:${timeline.dataset.timelineViewportEnd}`).toBe(loadoutViewport);

    earlier.click();
    expect(timeline.dataset.timelineViewportStart).toBe("0");
    expect(timeline.dataset.timelineViewportEnd).toBe("3");
    later.click();
    expect(timeline.dataset.timelineViewportStart).toBe("1");
    expect(timeline.dataset.timelineViewportEnd).toBe("4");

    earlier.click();
    const captureCount = setPointerCapture.mock.calls.length;
    death.dispatchEvent(new window.PointerEvent("pointerdown", {
      pointerId: 40, button: 0, shiftKey: true, clientX: 500, clientY: 100, cancelable: true, bubbles: true,
    }) as unknown as Event);
    expect(setPointerCapture).toHaveBeenCalledTimes(captureCount);
    svg.dispatchEvent(new window.PointerEvent("pointerdown", {
      pointerId: 41, button: 0, shiftKey: true, clientX: 500, clientY: 100, cancelable: true, bubbles: true,
    }) as unknown as Event);
    svg.dispatchEvent(new window.PointerEvent("pointermove", {
      pointerId: 41, clientX: 180, clientY: 100, cancelable: true, bubbles: true,
    }) as unknown as Event);
    expect(setPointerCapture).toHaveBeenCalledWith(41);
    expect(timeline.dataset.timelineViewportStart).toBe("1");
    svg.dispatchEvent(new window.PointerEvent("pointerup", { pointerId: 41, bubbles: true }) as unknown as Event);
    expect(releasePointerCapture).toHaveBeenCalledWith(41);

    zoomIn.click();
    svg.dispatchEvent(new window.PointerEvent("pointerdown", {
      pointerId: 42, button: 1, clientX: 500, clientY: 100, cancelable: true, bubbles: true,
    }) as unknown as Event);
    expect(setPointerCapture).toHaveBeenCalledWith(42);
    const beforeLostCapture = `${timeline.dataset.timelineViewportStart}:${timeline.dataset.timelineViewportEnd}`;
    svg.dispatchEvent(new window.PointerEvent("lostpointercapture", { pointerId: 42, bubbles: true }) as unknown as Event);
    expect(releasePointerCapture).toHaveBeenCalledWith(42);
    svg.dispatchEvent(new window.PointerEvent("pointermove", {
      pointerId: 42, clientX: 820, clientY: 100, cancelable: true, bubbles: true,
    }) as unknown as Event);
    expect(`${timeline.dataset.timelineViewportStart}:${timeline.dataset.timelineViewportEnd}`).toBe(beforeLostCapture);

    svg.dispatchEvent(new window.PointerEvent("pointerdown", {
      pointerId: 42, button: 1, clientX: 500, clientY: 100, cancelable: true, bubbles: true,
    }) as unknown as Event);
    svg.dispatchEvent(new window.PointerEvent("pointermove", {
      pointerId: 42, clientX: 820, clientY: 100, cancelable: true, bubbles: true,
    }) as unknown as Event);
    expect(`${timeline.dataset.timelineViewportStart}:${timeline.dataset.timelineViewportEnd}`).not.toBe(beforeLostCapture);
    svg.dispatchEvent(new window.PointerEvent("pointerup", { pointerId: 42, bubbles: true }) as unknown as Event);

    svg.dispatchEvent(new window.MouseEvent("dblclick", { clientX: 500, clientY: 100, cancelable: true, bubbles: true }) as unknown as Event);
    expect(timeline.dataset.timelineViewportStart).toBe("0");
    expect(timeline.dataset.timelineViewportEnd).toBe("4");
    expect(zoomOut.disabled).toBe(true);

    svg.dispatchEvent(new window.PointerEvent("pointermove", { pointerId: 99, clientX: 545, clientY: 100, bubbles: true }) as unknown as Event);
    expect(Number(inspector.getAttribute("aria-valuenow"))).toBeGreaterThan(0);
    death.dispatchEvent(new window.MouseEvent("click", { bubbles: true }) as unknown as Event);
    expect(death.getAttribute("aria-expanded")).toBe("true");
    expect(zoomIn.disabled).toBe(false);
  });

  it("rescales the active graph to visible data and restores its full-run maximum", () => {
    const root = mountedTimeline();
    const activeSeries = root.querySelector<SVGGElement>('[data-series="damage"][data-series-window="5"]')!;
    const originalMaximum = activeSeries.dataset.seriesScaleMaximum;
    const start = root.querySelector<HTMLInputElement>("input[data-timeline-viewport-start]")!;
    const end = root.querySelector<HTMLInputElement>("input[data-timeline-viewport-end]")!;
    const reset = root.querySelector<HTMLButtonElement>("[data-timeline-viewport-reset]")!;

    start.value = "50";
    start.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    end.value = "60";
    end.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);

    expect(activeSeries.dataset.timelineScaleMaximum).toBe("1");
    expect(activeSeries.querySelector("[data-timeline-scale-geometry]")?.getAttribute("transform"))
      .not.toBe("matrix(1 0 0 1 0 0)");
    expect(activeSeries.querySelector('[data-timeline-scale-tick="0"]')?.textContent).toBe("1");

    root.querySelector<HTMLButtonElement>('[data-metric="effective_healing"]')!.click();
    const healingSeries = root.querySelector<SVGGElement>('[data-series="effective_healing"][data-series-window="5"]')!;
    expect(healingSeries.dataset.timelineScaleMaximum).toBe("1");
    root.querySelector<HTMLButtonElement>('[data-window="1"]')!.click();
    expect(root.querySelector<SVGGElement>('[data-series="effective_healing"][data-series-window="1"]')!
      .dataset.timelineScaleMaximum).toBe("1");

    reset.click();
    root.querySelector<HTMLButtonElement>('[data-metric="damage"]')!.click();
    root.querySelector<HTMLButtonElement>('[data-window="5"]')!.click();
    expect(activeSeries.dataset.timelineScaleMaximum).toBe(originalMaximum);
  });

  it("removes hidden participants from the visible scale immediately", () => {
    const root = mountedTimeline();
    const activeSeries = root.querySelector<SVGGElement>('[data-series="damage"][data-series-window="5"]')!;
    const originalMaximum = Number(activeSeries.dataset.timelineScaleMaximum);
    const largestParticipant = root.querySelector<HTMLButtonElement>('[data-participant-toggle="0"]')!;

    largestParticipant.click();
    expect(Number(activeSeries.dataset.timelineScaleMaximum)).toBeLessThan(originalMaximum);
    largestParticipant.click();
    expect(Number(activeSeries.dataset.timelineScaleMaximum)).toBe(originalMaximum);
  });

  it("clears and restores every participant without changing the active timeline state", () => {
    const root = mountedTimeline();
    const timeline = root.querySelector<HTMLElement>("[data-timeline-metric]")!;
    const start = root.querySelector<HTMLInputElement>("input[data-timeline-viewport-start]")!;
    const end = root.querySelector<HTMLInputElement>("input[data-timeline-viewport-end]")!;
    const scrubber = root.querySelector<HTMLInputElement>("[data-timeline-scrubber]")!;
    const inspector = root.querySelector<SVGRectElement>("[data-timeline-inspector]")!;
    const activeSeries = root.querySelector<SVGGElement>('[data-series="damage"][data-series-window="5"]')!;

    start.value = "50";
    start.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    end.value = "60";
    end.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    scrubber.value = "55";
    scrubber.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    const visibleMaximum = activeSeries.dataset.timelineScaleMaximum;

    root.querySelector<HTMLButtonElement>("[data-participant-clear]")!.click();
    expect([...root.querySelectorAll<HTMLButtonElement>("[data-participant-toggle]")]
      .every((button) => button.getAttribute("aria-pressed") === "false")).toBe(true);
    expect([...root.querySelectorAll<SVGPolylineElement>(".timeline-trace")]
      .every((track) => track.hasAttribute("hidden"))).toBe(true);
    expect(activeSeries.dataset.timelineScaleMaximum).toBe("1");
    expect(root.querySelector("[data-timeline-range]")?.textContent).toContain("No participants selected");
    expect(root.querySelector("[data-timeline-snapshot]")?.textContent).toContain("No participants selected");
    expect(timeline.dataset.timelineMetric).toBe("damage");
    expect(timeline.dataset.timelineWindow).toBe("5");
    expect(timeline.dataset.timelineViewportStart).toBe("50");
    expect(timeline.dataset.timelineViewportEnd).toBe("60");
    expect(inspector.getAttribute("aria-valuenow")).toBe("55");

    root.querySelector<HTMLButtonElement>("[data-participant-show-all]")!.click();
    expect([...root.querySelectorAll<HTMLButtonElement>("[data-participant-toggle]")]
      .every((button) => button.getAttribute("aria-pressed") === "true")).toBe(true);
    expect([...root.querySelectorAll<SVGPolylineElement>(".timeline-trace")]
      .every((track) => !track.hasAttribute("hidden"))).toBe(true);
    expect(activeSeries.dataset.timelineScaleMaximum).toBe(visibleMaximum);
    expect(root.querySelector(".timeline-range-table")).not.toBeNull();
    expect(root.querySelector(".timeline-snapshot-table")).not.toBeNull();
    expect(timeline.dataset.timelineMetric).toBe("damage");
    expect(timeline.dataset.timelineWindow).toBe("5");
    expect(timeline.dataset.timelineViewportStart).toBe("50");
    expect(timeline.dataset.timelineViewportEnd).toBe("60");
    expect(inspector.getAttribute("aria-valuenow")).toBe("55");
  });

  it("uses the exact rDPS active clock at a fractional terminal boundary", () => {
    const report = load<PublicParseReport>("parse-report.v1.json");
    const run = report.runs[0]!;
    const participant = run.participants[0]!;
    participant.series = [
      { second: 0, damage: 0, effective_healing: 0, damage_taken: 0, rdps_damage: 10, rdps_contribution_given: 0, rdps_contribution_received: 0 },
      { second: 1, damage: 0, effective_healing: 0, damage_taken: 0, rdps_damage: 10, rdps_contribution_given: 0, rdps_contribution_received: 0 },
      { second: 2, damage: 0, effective_healing: 0, damage_taken: 0, rdps_damage: 120, rdps_contribution_given: 0, rdps_contribution_received: 0 },
    ];
    run.participants = [participant];
    run.timeline!.duration_micros = 2_200_000;
    run.timeline!.participant_tracks = [{
      actor_id: participant.actor_id,
      character_id: participant.character_id,
      observed_character_key: participant.observed_character_key ?? null,
      display_name: participant.display_name,
      canonical_participant_index: 0,
      series_point_count: 3,
    }];
    run.timeline!.rate_clock_complete = true;
    run.timeline!.omitted.rate_clock_points = 0;
    run.timeline!.rate_clock = [
      { second: 0, edps_elapsed_micros: 100_000, adps_elapsed_micros: 100_000 },
      { second: 1, edps_elapsed_micros: 200_000, adps_elapsed_micros: 200_000 },
      { second: 2, edps_elapsed_micros: 300_000, adps_elapsed_micros: 300_000 },
    ];
    const root = window.document.createElement("main") as unknown as HTMLElement;
    root.innerHTML = renderTimeline(selectCanonicalGraph(run));
    window.document.body.append(root as never);
    bindParseReportInteractions(root)();

    const start = root.querySelector<HTMLInputElement>("input[data-timeline-viewport-start]")!;
    start.value = "2";
    start.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    root.querySelector<HTMLButtonElement>('[data-metric="rdps_damage"]')!.click();
    root.querySelector<HTMLButtonElement>('[data-window="1"]')!.click();
    const rdpsSeries = root.querySelector<SVGGElement>('[data-series="rdps_damage"][data-series-window="1"]')!;

    expect(rdpsSeries.dataset.timelineScaleMaximum).toBe("2000");
    expect(rdpsSeries.querySelector('[data-timeline-scale-tick="0"]')?.textContent).toBe("2K");
  });

  it("updates snapshot rows when participants or metrics change and keeps partial rDPS unavailable", () => {
    const root = mountedTimeline();
    const rowsBefore = root.querySelectorAll(".timeline-snapshot-table tbody tr").length;
    const participant = root.querySelector<HTMLButtonElement>('[data-participant-toggle="0"]')!;
    participant.click();
    expect(participant.getAttribute("aria-pressed")).toBe("false");
    expect(root.querySelectorAll(".timeline-snapshot-table tbody tr")).toHaveLength(rowsBefore - 1);
    expect(root.querySelectorAll(".timeline-range-table tbody tr")).toHaveLength(rowsBefore - 1);

    root.querySelector<HTMLButtonElement>('[data-metric="rdps_damage"]')!.click();
    const table = root.querySelector(".timeline-snapshot-table")!;
    expect(table.textContent).toContain("rDPS");
    expect(table.textContent).not.toContain("eDPS");
    expect(table.textContent).toContain("—");
    expect(root.querySelector(".timeline-range-table")?.textContent).toContain("Adjusted damage");
    expect(root.querySelector(".timeline-range-scroll")?.textContent).toContain("unavailable");
  });

  it("switches partial transfer metrics without resetting viewport, cursor, or participant visibility", () => {
    const root = mountedTimeline();
    const timeline = root.querySelector<HTMLElement>("[data-timeline-metric]")!;
    const start = root.querySelector<HTMLInputElement>("input[data-timeline-viewport-start]")!;
    const end = root.querySelector<HTMLInputElement>("input[data-timeline-viewport-end]")!;
    const scrubber = root.querySelector<HTMLInputElement>("[data-timeline-scrubber]")!;
    const participant = root.querySelector<HTMLButtonElement>('[data-participant-toggle="0"]')!;
    start.value = "1";
    start.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    end.value = "3";
    end.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    scrubber.value = "2";
    scrubber.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    participant.click();
    root.querySelector<HTMLButtonElement>('[data-window="10"]')!.click();

    root.querySelector<HTMLButtonElement>('[data-metric="rdps_contribution_given"]')!.click();
    expect(timeline.dataset.timelineMetric).toBe("rdps_contribution_given");
    expect(timeline.dataset.timelineWindow).toBe("10");
    expect(timeline.dataset.timelineViewportStart).toBe("1");
    expect(timeline.dataset.timelineViewportEnd).toBe("3");
    expect(scrubber.value).toBe("2");
    expect(participant.getAttribute("aria-pressed")).toBe("false");
    expect(root.querySelector(".timeline-snapshot-table caption")?.textContent).toContain("Partial given at 0:02");
    expect(root.querySelector(".timeline-snapshot-table")?.textContent).toContain("—");
    expect(root.querySelector('[data-series="rdps_contribution_given"][data-series-window="5"] polyline')).not.toBeNull();
    expect(root.querySelector("[data-timeline-inspection]")?.textContent).toContain("cumulative transfer rate unavailable");
    expect(root.querySelector(".timeline-range-table")?.textContent).toContain("Contribution given");
    expect(root.querySelector(".timeline-range-table")?.textContent).toContain("Given/s");
    expect(root.querySelector(".timeline-range-scroll")?.textContent).toContain("unavailable");

    root.querySelector<HTMLButtonElement>('[data-metric="rdps_contribution_received"]')!.click();
    expect(timeline.dataset.timelineMetric).toBe("rdps_contribution_received");
    expect(timeline.dataset.timelineWindow).toBe("10");
    expect(timeline.dataset.timelineViewportStart).toBe("1");
    expect(timeline.dataset.timelineViewportEnd).toBe("3");
    expect(scrubber.value).toBe("2");
    expect(participant.getAttribute("aria-pressed")).toBe("false");
    expect(root.querySelector(".timeline-snapshot-table caption")?.textContent).toContain("Partial received at 0:02");
    expect(root.querySelector(".timeline-range-table")?.textContent).toContain("Contribution received");
    expect(root.querySelector(".timeline-range-table")?.textContent).toContain("Received/s");
  });

  it("focuses a legend participant across every metric and window without changing visibility", () => {
    const root = mountedTimeline();
    const participant = root.querySelector<HTMLButtonElement>('[data-participant-toggle="1"]')!;
    participant.dispatchEvent(new window.Event("pointerenter") as unknown as Event);
    expect(root.querySelectorAll('.timeline-trace[data-participant="1"].is-focused')).toHaveLength(6 * 3);
    expect(root.querySelectorAll('.timeline-trace[data-participant]:not([data-participant="1"]).is-dimmed').length).toBeGreaterThan(0);
    expect(participant.getAttribute("aria-pressed")).toBe("true");

    participant.dispatchEvent(new window.Event("pointerleave") as unknown as Event);
    expect(root.querySelectorAll(".timeline-trace.is-focused, .timeline-trace.is-dimmed")).toHaveLength(0);
  });

  it("plays and scrubs conserved reconciliation snapshots on the canonical timeline", () => {
    const report = load<PublicParseReport>("parse-report.v1.json");
    const reconciliation = load<PublicRunReconciliation>("parse-reconciliation.v1.json");
    reconciliation.schema_version = 20;
    reconciliation.rdps_status = "complete";
    reconciliation.status = "reconciled";
    reconciliation.attribution_replay_completed = true;
    reconciliation.reconciled_participants = report.runs[0].participants.map((participant) => ({
      ...participant,
      rdps_damage: participant.damage,
      contribution_given: 0,
      contribution_received: 0,
      rdps_incomplete: false,
    }));
    reconciliation.timeline!.source = "reconciled_canonical_spine";
    reconciliation.timeline!.schema_version = 5;
    reconciliation.timeline!.participant_tracks = report.runs[0].timeline!.participant_tracks;
    reconciliation.conservation = {
      raw_damage: reconciliation.reconciled_participants.reduce((sum, participant) => sum + participant.damage, 0),
      rdps_damage: reconciliation.reconciled_participants.reduce((sum, participant) => sum + participant.damage, 0),
      contribution_given: 0,
      contribution_received: 0,
      conserved: true,
    };
    const selection = selectCanonicalGraph(report.runs[0], reconciliation);
    expect(selection.reconciled).toBe(true);

    const root = window.document.createElement("main") as unknown as HTMLElement;
    root.innerHTML = renderTimeline(selection);
    bindParseReportInteractions(root)();
    const scrubber = root.querySelector<HTMLInputElement>("[data-timeline-scrubber]")!;
    scrubber.value = "2";
    scrubber.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    expect(root.querySelector(".timeline-snapshot-table")?.textContent).toContain("1s eDPS / aDPS");
    root.querySelector<HTMLButtonElement>('[data-metric="rdps_damage"]')!.click();
    expect(root.querySelector(".timeline-snapshot-table caption")?.textContent).toContain("rDPS at 0:02");
    expect(root.querySelector(".timeline-snapshot-table")?.textContent).toContain("rDPS");

    const totalCells = (selector: string) => [...root.querySelectorAll<HTMLElement>(selector)]
      .map((cell) => cell.textContent);
    root.querySelector<HTMLButtonElement>('[data-metric="rdps_contribution_given"]')!.click();
    const givenSnapshot = totalCells(".timeline-snapshot-table .timeline-snapshot-total td");
    const givenRange = totalCells(".timeline-range-table .timeline-snapshot-total td");
    expect(root.querySelector(".timeline-snapshot-table caption")?.textContent).toContain("Given at 0:02");
    expect(root.querySelector("[data-timeline-inspection]")?.textContent).toContain("run Given");
    expect(root.querySelector("[data-timeline-inspection]")?.textContent).not.toContain("unavailable");
    root.querySelector<HTMLButtonElement>('[data-metric="rdps_contribution_received"]')!.click();
    expect(root.querySelector(".timeline-snapshot-table caption")?.textContent).toContain("Received at 0:02");
    expect(root.querySelector("[data-timeline-inspection]")?.textContent).toContain("run Received");
    expect(totalCells(".timeline-snapshot-table .timeline-snapshot-total td")).toEqual(givenSnapshot);
    expect(totalCells(".timeline-range-table .timeline-snapshot-total td")).toEqual(givenRange);

    const play = root.querySelector<HTMLButtonElement>("[data-timeline-play]")!;
    play.click();
    expect(play.textContent).toBe("Pause");
    expect(play.getAttribute("aria-pressed")).toBe("true");
  });

  it("does not expose legacy reconciliation clocks to rDPS playback", () => {
    const report = load<PublicParseReport>("parse-report.v1.json");
    const reconciliation = load<PublicRunReconciliation>("parse-reconciliation.v1.json");
    reconciliation.status = "reconciled";
    reconciliation.attribution_replay_completed = true;
    reconciliation.reconciled_participants = report.runs[0].participants.map((participant) => ({
      ...participant, rdps_damage: participant.damage, contribution_given: 0,
      contribution_received: 0, rdps_incomplete: false,
    }));
    reconciliation.timeline!.source = "reconciled_canonical_spine";
    reconciliation.timeline!.participant_tracks = report.runs[0].timeline!.participant_tracks;
    const damage = reconciliation.reconciled_participants.reduce((sum, participant) => sum + participant.damage, 0);
    reconciliation.conservation = {
      raw_damage: damage, rdps_damage: damage, contribution_given: 0, contribution_received: 0, conserved: true,
    };

    const root = window.document.createElement("main") as unknown as HTMLElement;
    root.innerHTML = renderTimeline(selectCanonicalGraph(report.runs[0], reconciliation));
    bindParseReportInteractions(root)();

    expect(root.querySelector('[data-metric="rdps_damage"]')).toBeNull();
    expect(root.querySelector(".timeline-svg")?.getAttribute("data-rate-clock-complete")).toBe("false");
    expect(root.querySelector(".timeline-svg")?.hasAttribute("data-rate-clock")).toBe(false);
  });
});

describe("combat timeline raid snapshot readability", () => {
  it("keeps a visible total and every player in a bounded, sticky table", () => {
    const row = {
      variants: { one: 100, five: 90, ten: 80, cumulative: 70 },
      damageRates: { edps: 65, adps: 75 },
      rdps: null,
    };
    const rows = Array.from({ length: 20 }, (_, index) => ({
      ...row,
      label: `Raider ${index + 1}`,
      color: `hsl(${index * 18} 80% 60%)`,
    }));
    const html = renderTimelineSnapshotTable("damage", "DPS", "1:23", rows, {
      variants: { one: 2_000, five: 1_800, ten: 1_600, cumulative: 1_400 },
      damageRates: { edps: 1_300, adps: 1_500 },
      rdps: null,
    });
    expect(html.match(/<tr/gu)).toHaveLength(22);
    expect(html).toContain("Visible total");
    expect(html).toContain("Raider 20");

    const styles = readFileSync(new URL("../../styles/site.css", import.meta.url), "utf8");
    expect(styles).toMatch(/\.timeline-snapshot-scroll\s*\{[^}]*max-height:\s*340px;[^}]*overflow:\s*auto;/su);
    expect(styles).toMatch(/\.timeline-snapshot-table thead th\s*\{[^}]*position:\s*sticky;/su);
    expect(styles).toMatch(/@media \(max-width:\s*620px\)[\s\S]*?\.timeline-event-navigation button\s*\{[^}]*min-height:\s*44px;/u);
    expect(styles).toMatch(/\.timeline-overview-slider\s*\{[^}]*min-height:\s*44px;[^}]*touch-action:\s*pan-y;/su);
    expect(styles).toMatch(/\.timeline-overview-slider:focus-visible\s*\{[^}]*outline:/su);
    expect(styles).toMatch(/@media \(max-width:\s*620px\)[\s\S]*?\.timeline-viewport-actions button\s*\{[^}]*min-height:\s*44px;/u);
    expect(styles).toMatch(/@media \(pointer:\s*coarse\)[\s\S]*?\.timeline-lane-marker-hitbox,[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/u);
    expect(styles).toMatch(/@media \(pointer:\s*coarse\)[\s\S]*?\.timeline-marker-lanes-svg\s*\{[^}]*touch-action:\s*pan-y;/u);
    expect(styles).toMatch(/\.timeline-lane-preview\[hidden\]\s*\{[^}]*display:\s*none;/u);
  });
});
