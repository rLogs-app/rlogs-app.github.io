import { describe, expect, it } from "vitest";

import { parseAccount, parseAppToken, parseWebSession } from "./account";

const account = {
  schema_version: 1,
  submitter_id: `usr_${"a".repeat(32)}`,
  discord_username: "tester",
  discord_global_name: "Tester",
  discord_avatar_url: null,
};

describe("account contracts", () => {
  it("validates the Discord-backed account identity", () => {
    expect(parseAccount(account).discord_username).toBe("tester");
  });

  it("validates a bounded browser session", () => {
    const session = parseWebSession({
      schema_version: 1,
      access_token: `rlw_${"b".repeat(64)}`,
      expires_unix_millis: Date.now() + 60_000,
      account,
    });
    expect(session.account.submitter_id).toBe(account.submitter_id);
  });

  it("validates the one-time desktop token response", () => {
    const token = parseAppToken({
      schema_version: 1,
      device_token: `rld_${"c".repeat(64)}`,
      device_id: `dev_${"d".repeat(32)}`,
      created_unix_millis: 10,
    });
    expect(token.device_token).toMatch(/^rld_/u);
  });
});
