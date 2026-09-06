import { describe, expect, it } from "vitest";

import { loadProfileCatalog, profileUrl, requestedProfileReference } from "./profile-browser";
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

  it("does not substitute stale developer fixtures when the API is unavailable", async () => {
    await expect(loadProfileCatalog(
      "https://api.rlogs.example",
      async () => Response.json(
        { error: "submission origin is unavailable", retryable: true },
        { status: 503 },
      ),
    )).rejects.toThrow("Profile catalog request failed with HTTP 503.");
  });

  it("prefers the live hosted catalog when it is healthy", async () => {
    const result = await loadProfileCatalog(
      "https://api.rlogs.example",
      async () => Response.json({ schema_version: 1, profiles: [] }),
    );
    expect(result).toEqual({ schema_version: 1, profiles: [] });
  });
});
