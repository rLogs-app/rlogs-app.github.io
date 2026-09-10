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
    expect(messages.message("parse.timeline.death.legacy_unavailable")).toContain("legacy timeline");
    expect(messages.message("parse.timeline.death.cause_unavailable")).toContain("unavailable");
  });
});
