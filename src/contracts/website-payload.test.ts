import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { validateWebsitePayload } from "./website-payload";

function publicProfile(): Record<string, unknown> {
  return {
    schema_version: 1,
    game_plugin_id: "app.rlogs.game.blue-protocol-star-resonance",
    payload_kind: "character-profile",
    payload_schema_id: "app.rlogs.bpsr.character-profile",
    payload_schema_version: 1,
    routing: {
      deployment: "global",
      region: "north-america",
      "character-id": "public-character-123",
    },
    body: {
      display_name: "Example",
      level: 60,
    },
  };
}

describe("website payload contract", () => {
  it("accepts the public version-one profile envelope", () => {
    const result = validateWebsitePayload(publicProfile());

    expect(result.errors).toEqual([]);
    expect(result.envelope?.routing["character-id"]).toBe(
      "public-character-123",
    );
  });

  it("rejects credentials nested anywhere in the profile", () => {
    const profile = publicProfile();
    profile.body = {
      character: {
        token: "must-never-leave",
      },
    };

    const result = validateWebsitePayload(profile);

    expect(result.envelope).toBeUndefined();
    expect(result.errors).toContain(
      "prohibited account or credential field found at body.character.token.",
    );
  });

  it("rejects account containers even when the child field looks harmless", () => {
    const profile = publicProfile();
    profile.body = {
      account: {
        id: "private",
      },
    };

    const result = validateWebsitePayload(profile);

    expect(result.envelope).toBeUndefined();
    expect(result.errors).toContain(
      "prohibited account or credential field found at body.account.",
    );
  });

  it("rejects unsupported envelope versions", () => {
    const profile = publicProfile();
    profile.schema_version = 2;

    const result = validateWebsitePayload(profile);

    expect(result.envelope).toBeUndefined();
    expect(result.errors[0]).toContain("schema_version must be 1");
  });

  it("accepts the sanitized MarieRose capture with the complete module inventory", () => {
    const source = readFileSync(
      new URL(
        "../../public/profiles/3296036/profile.v1.json",
        import.meta.url,
      ),
      "utf8",
    );
    const profile = JSON.parse(source) as {
      body: {
        talents: Array<Record<string, unknown>>;
        modules: {
          equipped_slots: Record<string, string>;
          inventory: unknown[];
        };
      };
    };

    const result = validateWebsitePayload(profile);

    expect(result.errors).toEqual([]);
    expect(profile.body.modules.inventory).toHaveLength(649);
    expect(Object.keys(profile.body.modules.equipped_slots)).toHaveLength(5);
    expect(profile.body.talents).toHaveLength(70);
    expect(profile.body.talents.every((talent) =>
      Object.keys(talent).every((key) => key === "talent_id" || key === "level") &&
      !("position" in talent) &&
      !("prerequisite_node_ids" in talent) &&
      !("dependent_node_ids" in talent)
    )).toBe(true);
  });
});
