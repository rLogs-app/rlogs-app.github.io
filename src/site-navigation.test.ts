import { describe, expect, it } from "vitest";
import { hasActiveSession, pageFromPath } from "./site-navigation";

describe("site navigation", () => {
  it.each([
    ["/", "home"],
    ["/parses/", "parses"],
    ["/my-parses/", "my-parses"],
    ["/profiles/", "profiles"],
    ["/account", "account"],
    ["/optimizer/", "optimizer"],
    ["/unknown/", "home"],
  ] as const)("maps %s to %s", (path, expected) => {
    expect(pageFromPath(path)).toBe(expected);
  });

  it("shows My Profile only for a structurally valid, unexpired session", () => {
    const active = JSON.stringify({ access_token: "rlw_test", expires_unix_millis: 2_000 });
    expect(hasActiveSession(active, 1_000)).toBe(true);
    expect(hasActiveSession(active, 2_000)).toBe(false);
    expect(hasActiveSession("not-json", 1_000)).toBe(false);
  });
});
