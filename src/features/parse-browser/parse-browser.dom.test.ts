import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicParseReport, PublicRunReconciliation } from "../../contracts/public-parse";
import {
  bindParseReportInteractions,
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

  afterEach(() => window.close());

  function mountedTimeline(): HTMLElement {
    const report = load<PublicParseReport>("parse-report.v1.json");
    const root = window.document.createElement("main") as unknown as HTMLElement;
    root.innerHTML = renderTimeline(selectCanonicalGraph(report.runs[0]));
    window.document.body.append(root as never);
    const initialize = bindParseReportInteractions(root);
    initialize();
    return root;
  }

  it("plays, pauses, scrubs, and supports keyboard cursor movement", () => {
    const root = mountedTimeline();
    const play = root.querySelector<HTMLButtonElement>("[data-timeline-play]")!;
    const scrubber = root.querySelector<HTMLInputElement>("[data-timeline-scrubber]")!;
    const inspector = root.querySelector<SVGRectElement>("[data-timeline-inspector]")!;

    expect(root.querySelector(".timeline-snapshot-table caption")?.textContent).toContain("DPS at 0:00");
    play.click();
    expect(play.textContent).toBe("Pause");
    expect(play.getAttribute("aria-pressed")).toBe("true");
    expect(animationFrame).not.toBeNull();
    play.click();
    expect(play.textContent).toBe("Play");
    expect(play.getAttribute("aria-pressed")).toBe("false");

    scrubber.value = "2";
    scrubber.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    expect(inspector.getAttribute("aria-valuenow")).toBe("2");
    expect(root.querySelector(".timeline-snapshot-table caption")?.textContent).toContain("DPS at 0:02");
    expect(root.querySelector(".timeline-snapshot-table")?.textContent).toContain("eDPS");
    expect(root.querySelector(".timeline-snapshot-table")?.textContent).toContain("aDPS");

    inspector.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }) as unknown as Event);
    expect(inspector.getAttribute("aria-valuenow")).toBe("3");
    inspector.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Home", bubbles: true }) as unknown as Event);
    expect(inspector.getAttribute("aria-valuenow")).toBe("0");
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
  });

  it("zooms the visible range, bounds navigation and playback, and resets without rebasing snapshots", () => {
    const root = mountedTimeline();
    const timeline = root.querySelector<HTMLElement>(".combat-timeline")!;
    const start = root.querySelector<HTMLInputElement>("input[data-timeline-viewport-start]")!;
    const end = root.querySelector<HTMLInputElement>("input[data-timeline-viewport-end]")!;
    const reset = root.querySelector<HTMLButtonElement>("[data-timeline-viewport-reset]")!;
    const scrubber = root.querySelector<HTMLInputElement>("[data-timeline-scrubber]")!;
    const inspector = root.querySelector<SVGRectElement>("[data-timeline-inspector]")!;

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
    expect(inspector.getAttribute("aria-valuenow")).toBe("2");
    expect(root.querySelector(".timeline-snapshot-table")?.textContent).toBe(ratesAtTwo);

    root.querySelector<HTMLButtonElement>('[data-metric="rdps_damage"]')!.click();
    const rdpsAtTwo = root.querySelector(".timeline-snapshot-table")?.textContent;
    expect(rdpsAtTwo).toContain("rDPS");

    inspector.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Home", bubbles: true }) as unknown as Event);
    expect(inspector.getAttribute("aria-valuenow")).toBe("1");
    inspector.dispatchEvent(new window.KeyboardEvent("keydown", { key: "End", bubbles: true }) as unknown as Event);
    expect(inspector.getAttribute("aria-valuenow")).toBe("3");
    expect(root.querySelector(".timeline-snapshot-table caption")?.textContent).toContain("DPS at 0:03");

    reset.click();
    expect(timeline.dataset.timelineViewportStart).toBe("0");
    expect(reset.disabled).toBe(true);
    scrubber.value = "2";
    scrubber.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    expect(root.querySelector(".timeline-snapshot-table")?.textContent).toBe(rdpsAtTwo);
  });

  it("updates snapshot rows when participants or metrics change and keeps partial rDPS unavailable", () => {
    const root = mountedTimeline();
    const rowsBefore = root.querySelectorAll(".timeline-snapshot-table tbody tr").length;
    const participant = root.querySelector<HTMLButtonElement>('[data-participant-toggle="0"]')!;
    participant.click();
    expect(participant.getAttribute("aria-pressed")).toBe("false");
    expect(root.querySelectorAll(".timeline-snapshot-table tbody tr")).toHaveLength(rowsBefore - 1);

    root.querySelector<HTMLButtonElement>('[data-metric="rdps_damage"]')!.click();
    const table = root.querySelector(".timeline-snapshot-table")!;
    expect(table.textContent).toContain("rDPS");
    expect(table.textContent).not.toContain("eDPS");
    expect(table.textContent).toContain("—");
  });

  it("focuses a legend participant across every metric and window without changing visibility", () => {
    const root = mountedTimeline();
    const participant = root.querySelector<HTMLButtonElement>('[data-participant-toggle="1"]')!;
    participant.dispatchEvent(new window.Event("pointerenter") as unknown as Event);
    expect(root.querySelectorAll('.timeline-trace[data-participant="1"].is-focused')).toHaveLength(4 * 3);
    expect(root.querySelectorAll('.timeline-trace[data-participant]:not([data-participant="1"]).is-dimmed').length).toBeGreaterThan(0);
    expect(participant.getAttribute("aria-pressed")).toBe("true");

    participant.dispatchEvent(new window.Event("pointerleave") as unknown as Event);
    expect(root.querySelectorAll(".timeline-trace.is-focused, .timeline-trace.is-dimmed")).toHaveLength(0);
  });

  it("plays and scrubs conserved reconciliation snapshots on the canonical timeline", () => {
    const report = load<PublicParseReport>("parse-report.v1.json");
    const reconciliation = load<PublicRunReconciliation>("parse-reconciliation.v1.json");
    reconciliation.schema_version = 18;
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
    root.querySelector<HTMLButtonElement>('[data-metric="rdps_damage"]')!.click();
    const scrubber = root.querySelector<HTMLInputElement>("[data-timeline-scrubber]")!;
    scrubber.value = "2";
    scrubber.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    expect(root.querySelector(".timeline-snapshot-table caption")?.textContent).toContain("rDPS at 0:02");
    expect(root.querySelector(".timeline-snapshot-table")?.textContent).toContain("rDPS");

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
  });
});
