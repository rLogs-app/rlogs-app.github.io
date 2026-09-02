import { describe, expect, it } from "vitest";

import { parsePublicAccountCatalog, publicAccountIdFromPath } from "./public-account";

describe("public rLogs accounts", () => {
  it("accepts only namespaced twelve-digit account routes", () => {
    expect(publicAccountIdFromPath("/users/583104927614/")).toBe(583104927614);
    expect(publicAccountIdFromPath("/users/3296036/")).toBeUndefined();
    expect(publicAccountIdFromPath("/profiles/583104927614/")).toBeUndefined();
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
