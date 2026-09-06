import { describe, expect, it } from "vitest";

import { loadProfileCatalog, profileUrl, requestedProfileReference } from "./profile-browser";
import type { PublishedProfileIndex } from "../../contracts/published-profiles";

const snapshot: PublishedProfileIndex = {
  schema_version: 1,
  publication_mode: "developer-git",
  profiles: [{
    profile_id: "3296036",
    label: "MarieRose",
    game_plugin_id: "app.rlogs.game.blue-protocol-star-resonance",
    payload_schema_id: "app.rlogs.bpsr.character-profile",
    payload_schema_version: 1,
    deployment: "global",
    region: "north-america",
    character_id: "3296036",
    payload_path: "3296036/profile.v1.json",
    payload_sha256: "a".repeat(64),
    payload_bytes: 100,
  }],
};

describe("public profile routes", () => {
  it("uses the observable character UID as the canonical URL", () => {
    expect(profileUrl("3296036")).toBe("/profiles/3296036/");
    expect(requestedProfileReference("/profiles/3296036/", "")).toBe("3296036");
  });

  it("keeps the old internal profile query as a migration input", () => {
    expect(
      requestedProfileReference(
        "/profiles/",
        "?profile=prf_e569ead2193f107ea0ce6c44de4e5983",
      ),
    ).toBe("prf_e569ead2193f107ea0ce6c44de4e5983");
  });

  it("uses the read-only published snapshot when the hosted API is unavailable", async () => {
    const result = await loadProfileCatalog(
      "https://api.rlogs.example",
      async () => Response.json(
        { error: "submission origin is unavailable", retryable: true },
        { status: 503 },
      ),
      async () => snapshot,
    );
    expect(result.source).toBe("snapshot");
    expect(result.catalog.profiles.map((profile) => profile.character_id)).toEqual(["3296036"]);
  });

  it("prefers the live hosted catalog when it is healthy", async () => {
    const result = await loadProfileCatalog(
      "https://api.rlogs.example",
      async () => Response.json({ schema_version: 1, profiles: [] }),
      async () => { throw new Error("snapshot should not be loaded"); },
    );
    expect(result).toEqual({ catalog: { schema_version: 1, profiles: [] }, source: "api" });
  });
});
