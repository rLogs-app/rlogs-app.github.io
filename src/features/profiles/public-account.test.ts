import { describe, expect, it } from "vitest";

import {
  parsePublicAccountCatalog,
  publicAccountIdFromLocation,
  publicAccountIdFromPath,
  publicAccountUrl,
} from "./public-account";

describe("public rLogs accounts", () => {
  it("accepts only namespaced twelve-digit account routes", () => {
    expect(publicAccountIdFromPath("/users/583104927614/")).toBe(583104927614);
    expect(publicAccountIdFromPath("/users/3296036/")).toBeUndefined();
    expect(publicAccountIdFromPath("/profiles/583104927614/")).toBeUndefined();
  });

  it("uses a static profiles route for canonical public-account URLs", () => {
    expect(publicAccountUrl(583104927614)).toBe("/profiles/?user=583104927614");
    expect(publicAccountIdFromLocation("/profiles/", "?user=583104927614")).toBe(583104927614);
    expect(publicAccountIdFromLocation("/users/583104927614/", "")).toBe(583104927614);
    expect(publicAccountIdFromLocation("/profiles/", "?user=3296036")).toBeUndefined();
  });

  it("validates the public identity and claimed profile catalog together", () => {
    const parsed = parsePublicAccountCatalog({
      schema_version: 1,
      account: { schema_version: 1, account_id: 583104927614, username: "marie-rose" },
      profiles: [],
    });
    expect(parsed.account.username).toBe("marie-rose");
  });
});
