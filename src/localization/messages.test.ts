import { describe, expect, it } from "vitest";
import { createMessageResolver, localeFallbackChain } from "./messages";

describe("website message resolver", () => {
  it("falls back exact locale, base locale, en-US, then stable key", () => {
    const catalogs = {
      "fr-CA": { exact: "exact-value" },
      fr: { base: "base-value" },
      "en-US": { english: "english-value", template: "value {count}" },
    };
    const messages = createMessageResolver("fr-ca", catalogs);
    expect(localeFallbackChain("fr-ca")).toEqual(["fr-CA", "fr", "en-US"]);
    expect(messages.message("exact")).toBe("exact-value");
    expect(messages.message("base")).toBe("base-value");
    expect(messages.message("english")).toBe("english-value");
    expect(messages.message("template", { count: 4 })).toBe("value 4");
    expect(messages.message("missing.stable.key")).toBe("missing.stable.key");
  });

  it("formats numbers with the requested locale even when messages fall back", () => {
    const messages = createMessageResolver("de-DE");
    expect(messages.number(1234.5, { maximumFractionDigits: 1 })).toBe("1.234,5");
    expect(messages.message("parse.timeline.play")).toBe("Play");
  });

  it("localizes timeline event navigation status and announcements", () => {
    const messages = createMessageResolver("en-US");
    expect(messages.message("parse.timeline.event_navigation.position", { position: 2, count: 4 }))
      .toBe("Event 2 of 4");
    expect(messages.message("parse.timeline.event_navigation.announcement", {
      position: 2, count: 4, events: "Player died at 0:07.500",
    })).toBe("Event 2 of 4: Player died at 0:07.500");
    expect(messages.message("parse.timeline.event_navigation.count.one", { count: 1 }))
      .toBe("1 event point in the visible range");
  });

  it("localizes exact hostile-cast target context", () => {
    const messages = createMessageResolver("en-US");
    expect(messages.message("parse.timeline.event.hostile_cast_targeted", {
      enemy: "Enemy actor 9", action: "Strike", time: "0:01.250", target: "Player",
    })).toBe("Enemy actor 9 used Strike at 0:01.250, targeting Player");
  });

  it("localizes the timeline overview navigator", () => {
    const messages = createMessageResolver("en-US");
    expect(messages.message("parse.timeline.overview.label")).toBe("Run overview");
    expect(messages.message("parse.timeline.overview.aria")).toBe("Visible timeline window");
    expect(messages.message("parse.timeline.viewport_navigation")).toBe("Timeline viewport navigation");
    expect(messages.message("parse.timeline.viewport_zoom_in")).toBe("Zoom in");
    expect(messages.message("parse.timeline.viewport_gesture_hint")).toContain("Shift-drag");
  });

  it("localizes recorded lane coverage and aggregate previews", () => {
    const messages = createMessageResolver("en-US");
    expect(messages.message("parse.timeline.lanes.aria")).toBe("Recorded event lanes");
    expect(messages.message("parse.timeline.lanes.preview.other", { count: 4 })).toBe("4 nearby events");
    expect(messages.message("parse.timeline.lanes.coverage.other", { omitted: 3 })).toContain("3 events were omitted");
    expect(messages.message("parse.timeline.lanes.coverage.one")).toContain("1 event was omitted");
  });

  it("localizes death-cause evidence and fallback summaries", () => {
    const messages = createMessageResolver("en-US");
    expect(messages.message("parse.timeline.death.terminal_hit")).toBe("Terminal recorded hit");
    expect(messages.message("parse.timeline.death.trigger", { death: "Player died" }))
      .toBe("Player died. Show death details.");
    expect(messages.message("parse.timeline.death.hit_damage", { damage: "900", reported: "1,000" }))
      .toBe("900 effective damage (1,000 reported)");
    expect(messages.message("parse.timeline.death.hit_source_named", { name: "MarieRose", id: "7" }))
      .toBe("MarieRose (source actor ID 7)");
    expect(messages.message("parse.timeline.death.hit_direct_source_named", { name: "Companion", id: "8" }))
      .toBe("Companion (direct source actor ID 8)");
    expect(messages.message("parse.timeline.death.hit_ability_named", { name: "Powerdraw", id: "2203291" }))
      .toBe("Powerdraw (ability ID 2203291)");
    expect(messages.message("parse.timeline.death.hit_breakdown_named", { name: "Burst", id: "230401" }))
      .toBe("Burst (breakdown ability ID 230401)");
    expect(messages.message("parse.timeline.death.hit_source_named", { name: "Exact-build Guardian", id: "monster-9" }))
      .toBe("Exact-build Guardian (source actor ID monster-9)");
    expect(messages.message("parse.timeline.death.hit_ability_named", { name: "Exact-build Slash", id: "action-4" }))
      .toBe("Exact-build Slash (ability ID action-4)");
    expect(messages.message("parse.timeline.death.legacy_unavailable")).toContain("legacy timeline");
    expect(messages.message("parse.timeline.death.cause_unavailable")).toContain("unavailable");
  });
});
