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
});
