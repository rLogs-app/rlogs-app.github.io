import { describe, expect, it } from "vitest";

import {
  parseAccount,
  parseAppToken,
  parseDiscordCompletion,
  parseLinkedProfileCatalog,
  parseWebSession,
} from "./account";

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

  it("validates the browser-side Discord completion receipt", () => {
    const receipt = parseDiscordCompletion({
      schema_version: 1,
      login_code: `login_${"e".repeat(64)}`,
    });
    expect(receipt.login_code).toMatch(/^login_/u);
  });

  it("validates the account-scoped linked UID catalog", () => {
    const catalog = parseLinkedProfileCatalog({
      schema_version: 1,
      profiles: [
        {
          profile_id: `prf_${"a".repeat(32)}`,
          claimed: true,
          package_id: "pkg_test",
          updated_unix_millis: 1,
          source_client_build: "steam-24687926",
          deployment: "global",
          region: "north-america",
          realm: "asteria",
          world: null,
          character_id: "3296036",
          display_name: "MarieRose",
          module_inventory_count: 42,
          equipped_module_count: 8,
        },
      ],
    });
    expect(catalog.profiles[0]?.character_id).toBe("3296036");
  });
});
