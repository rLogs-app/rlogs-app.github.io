import { describe, expect, it } from "vitest";

import { isPublicProfileCatalog } from "./public-profiles";

describe("public profile catalog", () => {
  it("accepts privacy-reviewed recently synced profiles", () => {
    expect(
      isPublicProfileCatalog({
        schema_version: 1,
        profiles: [
          {
            profile_id: `prf_${"a".repeat(32)}`,
            claimed: true,
            package_id: "package",
            updated_unix_millis: 1,
            source_client_build: "steam-24687926",
            deployment: "global",
            region: "north-america",
            realm: "asteria",
            world: null,
            character_id: "3296036",
            display_name: "Player",
            module_inventory_count: 50,
            equipped_module_count: 5,
          },
        ],
      }),
    ).toBe(true);
  });
});
