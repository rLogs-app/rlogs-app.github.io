import { describe, expect, it } from "vitest";

import {
  loadObservedCharacterCatalog,
  loadProfileCatalog,
  observedClassLabel,
  observedReportDifficultyLabel,
  observedReportSceneLabel,
  profileUrl,
  requestedProfileReference,
  searchableDirectoryEntry,
} from "./profile-browser";
import type { ObservedCharacterEntry } from "../../contracts/public-characters";
import type { ParsePresentationCatalog } from "../parse-browser/parse-presentation";

const digest = "sha256:4372050d9d549808b229b16de315080f9bac427efe9602dabd9b93c4502dbbae";
const presentation: ParsePresentationCatalog = {
  schema_version: 5, locale: "en-US", deployment_id: "global", game_build: "24687926",
  protocol_pack_digest: digest, source: "test", actions: {}, effects: {}, imagines: {}, modules: {}, module_effects: {},
  scenes: { "13021": "Clash! Field of Forgotten Illusions", "6515": "Cursed Radiant Tomb" }, classes: { "1": "Stormblade", "4": "Wind Knight" }, specializations: { "101": "Iaido Slash Spec", "107": "Vanguard Spec" },
};
describe("public profile routes", () => {
  it("uses the observable character UID as the canonical URL", () => {
    expect(profileUrl("3296036")).toBe("/profiles/?profile=3296036");
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

  it("uses an opaque observed character key as a stable unclaimed profile route", () => {
    expect(profileUrl(`obs_${"a".repeat(32)}`)).toBe(`/profiles/?profile=obs_${"a".repeat(32)}`);
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

  it("loads a materialized observed character directory", async () => {
    const catalog = {
      schema_version: 1 as const,
      generated_unix_millis: 1,
      total_characters: 1,
      characters: [{
        observed_character_key: `obs_${"a".repeat(32)}`,
        identity_kind: "legacy_name_observation" as const,
        character_id: null,
        claimed_profile_id: null,
        display_name: "Player",
        deployment: "global",
        region: "north-america",
        class_id: 4,
        class_name: "Wind Knight",
        specialization_id: 107,
        specialization_name: "Vanguard Spec",
        first_seen_unix_millis: 1,
        last_seen_unix_millis: 1,
        report_count: 1,
        reports: [{
          report_id: `rpt_${"b".repeat(32)}`,
          run_index: 0,
          created_unix_millis: 1,
          scene_id: 6515,
          scene_name: "Cursed Radiant Tomb",
          terminal_state: "completed",
        }],
      }],
    };
    await expect(loadObservedCharacterCatalog(
      "https://api.rlogs.example",
      async () => Response.json(catalog),
    )).resolves.toEqual(catalog);
  });

  it("shows catalog labels across identities while keeping difficulty semantics exact", () => {
    const character: ObservedCharacterEntry = {
      observed_character_key: `obs_${"a".repeat(32)}`,
      identity_kind: "legacy_name_observation",
      character_id: null,
      claimed_profile_id: null,
      display_name: "Captured Player",
      deployment: "global",
      region: "north-america",
      class_id: 4,
      class_name: "Wind Knight",
      specialization_id: 107,
      specialization_name: "Vanguard Spec",
      first_seen_unix_millis: 1,
      last_seen_unix_millis: 1,
      report_count: 1,
      presentation_authority: { deployment_id: "global", client_build: "24687926", protocol_pack_digest: digest },
      reports: [{
        report_id: `rpt_${"b".repeat(32)}`,
        run_index: 0,
        created_unix_millis: 1,
        scene_id: 6515,
        scene_name: "Cursed Radiant Tomb",
        terminal_state: "completed",
        deployment_id: "global",
        client_build: "24687926",
        protocol_pack_digest: digest,
        difficulty_family: "master",
        difficulty_tier: 5,
      }],
    };
    const directory = { kind: "observed" as const, character };
    expect(observedClassLabel(character, presentation, 2)).toBe("Wind Knight / Vanguard Spec");
    expect(observedReportSceneLabel(character.reports[0]!, presentation, 2)).toBe("Cursed Radiant Tomb");
    expect(observedReportDifficultyLabel(character.reports[0]!, presentation, 2)).toBe("Master 5");
    expect(searchableDirectoryEntry(directory, presentation, 2)).toContain("wind knight");

    const wrong = {
      ...character,
      presentation_authority: { ...character.presentation_authority!, protocol_pack_digest: `sha256:${"f".repeat(64)}` },
      reports: [{ ...character.reports[0]!, protocol_pack_digest: `sha256:${"f".repeat(64)}` }],
    };
    const unavailable = {
      ...character,
      presentation_authority: null,
      reports: [{ ...character.reports[0]!, deployment_id: null, client_build: null, protocol_pack_digest: null }],
    };
    for (const [candidate, schema] of [[wrong, 2], [unavailable, 2], [character, 1]] as const) {
      expect(observedClassLabel(candidate, presentation, schema)).toBe("Wind Knight / Vanguard Spec");
      expect(observedReportSceneLabel(candidate.reports[0]!, presentation, schema)).toBe("Cursed Radiant Tomb");
      expect(observedReportDifficultyLabel(candidate.reports[0]!, presentation, schema)).toBe("Tier 5");
      const searchable = searchableDirectoryEntry({ kind: "observed", character: candidate }, presentation, schema);
      expect(searchable).toContain("captured player");
      expect(searchable).toContain("4 107 global north-america");
      expect(searchable).toContain("wind knight");
      expect(searchable).toContain("vanguard spec");
    }

    expect(observedClassLabel({ ...character, reports: wrong.reports }, presentation, 2)).toBe("Wind Knight / Vanguard Spec");
    expect(observedReportSceneLabel(wrong.reports[0]!, presentation, 2)).toBe("Cursed Radiant Tomb");
    expect(observedReportDifficultyLabel({ ...character.reports[0]!, difficulty_tier: null }, presentation, 2)).toBe("Master");
    expect(observedReportDifficultyLabel({ ...character.reports[0]!, difficulty_family: null, difficulty_tier: null }, presentation, 2)).toBeUndefined();
  });
});
