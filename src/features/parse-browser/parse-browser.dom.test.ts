import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicParseReport } from "../../contracts/public-parse";
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
