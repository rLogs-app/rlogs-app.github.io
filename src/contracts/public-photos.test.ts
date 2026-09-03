import { describe, expect, it } from "vitest";

import { isPublicPhotoCatalog } from "./public-photos";

describe("public photo catalog contract", () => {
  it("accepts a bounded server-owned photo feed row", () => {
    expect(
      isPublicPhotoCatalog({
        schema_version: 1,
        total_entries: 1,
        entries: [
          {
            profile_id: `prf_${"a".repeat(32)}`,
            character_id: "3296036",
            display_name: "MarieRose",
            photo_id: 42,
            image_path: `/v1/profiles/prf_${"a".repeat(32)}/photo-wall/42`,
            uploaded_unix_millis: 1_788_000_000_000,
            like_count: 3,
            viewer_liked: true,
          },
        ],
      }),
    ).toBe(true);
  });

  it("rejects external image URLs and malformed counters", () => {
    expect(
      isPublicPhotoCatalog({
        schema_version: 1,
        total_entries: 1,
        entries: [
          {
            profile_id: `prf_${"a".repeat(32)}`,
            character_id: "3296036",
            display_name: null,
            photo_id: 0,
            image_path: "https://example.test/tracker.png",
            uploaded_unix_millis: 1,
            like_count: -1,
            viewer_liked: false,
          },
        ],
      }),
    ).toBe(false);
  });
});
