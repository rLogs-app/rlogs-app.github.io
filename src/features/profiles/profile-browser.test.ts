import { describe, expect, it } from "vitest";

import { profileUrl, requestedProfileReference } from "./profile-browser";

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
});
