import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { validateProfileLabSource } from "./profile-lab";

describe("Character Profile Lab source validation", () => {
  it("accepts and unwraps the native sealed local profile package", async () => {
    const source = readFileSync(
      new URL("../../../public/fixtures/bpsr-local-profile-package.v1.json", import.meta.url),
      "utf8",
    );

    const result = await validateProfileLabSource(source);

    expect(result.errors).toEqual([]);
    expect(result.sourceKind).toBe("local-package");
    expect(result.profile?.envelope.body.display_name).toBe("Example Adventurer");
    expect(result.profile?.entry.source_package_id).toHaveLength(64);
  });

  it("accepts a validated WebsitePayload character profile", async () => {
    const result = await validateProfileLabSource(JSON.stringify({
      schema_version: 1,
      game_plugin_id: "app.rlogs.game.blue-protocol-star-resonance",
      payload_kind: "character-profile",
      payload_schema_id: "app.rlogs.bpsr.character-profile",
      payload_schema_version: 1,
      routing: {
        "character-id": "42",
        deployment: "global",
        region: "north-america",
      },
      body: { display_name: "Validated Preview" },
    }));

    expect(result.errors).toEqual([]);
    expect(result.sourceKind).toBe("website-payload");
    expect(result.profile?.entry.character_id).toBe("42");
  });

  it("rejects malformed JSON, prohibited data, and other payload kinds", async () => {
    expect((await validateProfileLabSource("{" )).errors[0]).toContain("Invalid JSON");

    const base = {
      schema_version: 1,
      game_plugin_id: "app.rlogs.game.blue-protocol-star-resonance",
      payload_kind: "character-profile",
      payload_schema_id: "app.rlogs.bpsr.character-profile",
      payload_schema_version: 1,
      routing: { "character-id": "42" },
      body: { account: { token: "never" } },
    };
    expect((await validateProfileLabSource(JSON.stringify(base))).errors.join(" ")).toContain("prohibited");
    expect((await validateProfileLabSource(JSON.stringify({
      ...base,
      payload_kind: "combat-report",
      body: {},
    }))).errors).toContain('payload_kind must be "character-profile" for the Profile Lab.');
  });
});
