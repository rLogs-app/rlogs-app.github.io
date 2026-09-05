import { describe, expect, it } from "vitest";

import { siteDeveloperModeEnabled } from "./site-developer-mode";

describe("site developer mode", () => {
  it("requires both the server-issued account role and the local preference", () => {
    const developer = JSON.stringify({ account: { developer: true } });
    const ordinary = JSON.stringify({ account: { developer: false } });
    expect(siteDeveloperModeEnabled(developer, "1")).toBe(true);
    expect(siteDeveloperModeEnabled(developer, "0")).toBe(false);
    expect(siteDeveloperModeEnabled(ordinary, "1")).toBe(false);
  });

  it("stays disabled for malformed or missing sessions", () => {
    expect(siteDeveloperModeEnabled("not-json", "1")).toBe(false);
    expect(siteDeveloperModeEnabled(null, "1")).toBe(false);
  });
});
