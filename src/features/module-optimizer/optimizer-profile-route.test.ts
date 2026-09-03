import { describe, expect, it } from "vitest";

import { optimizerProfileHref, requestedOptimizerProfile } from "./optimizer-profile-route";

describe("module optimizer profile routing", () => {
  it("carries the viewed profile identity into the optimizer", () => {
    expect(optimizerProfileHref("prf_0123456789abcdef0123456789abcdef"))
      .toBe("/optimizer/?profile=prf_0123456789abcdef0123456789abcdef");
  });

  it("prefers an explicit viewed profile and ignores an empty request", () => {
    expect(requestedOptimizerProfile("?profile=prf_0123456789abcdef0123456789abcdef"))
      .toBe("prf_0123456789abcdef0123456789abcdef");
    expect(requestedOptimizerProfile("?profile=%20%20")).toBeUndefined();
    expect(requestedOptimizerProfile("")).toBeUndefined();
  });
});
