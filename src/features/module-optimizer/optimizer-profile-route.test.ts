import { describe, expect, it } from "vitest";

import {
  optimizerProfileHref,
  requestedOptimizerLoadout,
  requestedOptimizerProfile,
} from "./optimizer-profile-route";

describe("module optimizer profile routing", () => {
  it("carries the viewed profile identity into the optimizer", () => {
    expect(optimizerProfileHref("prf_0123456789abcdef0123456789abcdef"))
      .toBe("/optimizer/?profile=prf_0123456789abcdef0123456789abcdef");
    expect(optimizerProfileHref("prf_0123456789abcdef0123456789abcdef", 5))
      .toBe("/optimizer/?profile=prf_0123456789abcdef0123456789abcdef&loadout=5");
  });

  it("prefers an explicit viewed profile and ignores an empty request", () => {
    expect(requestedOptimizerProfile("?profile=prf_0123456789abcdef0123456789abcdef"))
      .toBe("prf_0123456789abcdef0123456789abcdef");
    expect(requestedOptimizerProfile("?profile=%20%20")).toBeUndefined();
    expect(requestedOptimizerProfile("")).toBeUndefined();
  });

  it("accepts only a positive numeric saved-loadout identity", () => {
    expect(requestedOptimizerLoadout("?profile=prf_test&loadout=5")).toBe(5);
    expect(requestedOptimizerLoadout("?loadout=0")).toBeUndefined();
    expect(requestedOptimizerLoadout("?loadout=project-5")).toBeUndefined();
  });
});
