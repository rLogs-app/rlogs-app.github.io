import { describe, expect, it } from "vitest";

import { isObservedCharacterCatalog } from "./public-characters";

const digest = `sha256:${"a".repeat(64)}`;
const report = {
  report_id: `rpt_${"b".repeat(32)}`,
  run_index: 0,
  created_unix_millis: 1,
  scene_id: 6515,
  scene_name: "Cursed Radiant Tomb",
  terminal_state: "completed",
};
const character = {
  observed_character_key: `obs_${"a".repeat(32)}`,
  identity_kind: "legacy_name_observation",
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
  reports: [report],
};

describe("observed character contract", () => {
  it("keeps schema 1 readable without presentation provenance", () => {
    expect(isObservedCharacterCatalog({ schema_version: 1, generated_unix_millis: 1, total_characters: 1, characters: [character] })).toBe(true);
  });

  it("requires nullable complete authority fields in schema 2", () => {
    const exact = {
      ...character,
      presentation_authority: { deployment_id: "global", client_build: "24687926", protocol_pack_digest: digest },
      reports: [{ ...report, deployment_id: "global", client_build: "24687926", protocol_pack_digest: digest,
        difficulty_family: "master", difficulty_tier: 20 }],
    };
    const catalog = { schema_version: 2, generated_unix_millis: 1, total_characters: 1, characters: [exact] };
    expect(isObservedCharacterCatalog(catalog)).toBe(true);
    expect(isObservedCharacterCatalog({ ...catalog, characters: [{ ...exact, presentation_authority: null, reports: [{ ...report, deployment_id: null, client_build: null, protocol_pack_digest: null }] }] })).toBe(true);
    expect(isObservedCharacterCatalog({ ...catalog, characters: [{ ...character, reports: exact.reports }] })).toBe(false);
    expect(isObservedCharacterCatalog({ ...catalog, characters: [{ ...exact, reports: [{ ...report, deployment_id: "global", client_build: null, protocol_pack_digest: null }] }] })).toBe(false);
    expect(isObservedCharacterCatalog({ ...catalog, characters: [{ ...exact, presentation_authority: { ...exact.presentation_authority, protocol_pack_digest: "sha256:nope" } }] })).toBe(false);
    expect(isObservedCharacterCatalog({ ...catalog, characters: [{ ...exact, reports: [{ ...exact.reports[0], difficulty_tier: -1 }] }] })).toBe(false);
    expect(isObservedCharacterCatalog({ ...catalog, characters: [{ ...exact, reports: [{ ...exact.reports[0], difficulty_tier: 1.5 }] }] })).toBe(false);
    expect(isObservedCharacterCatalog({ ...catalog, characters: [{ ...exact, reports: [{ ...exact.reports[0], difficulty_family: 20 }] }] })).toBe(false);
    expect(isObservedCharacterCatalog({ ...catalog, characters: [{ ...exact, reports: [{ ...exact.reports[0], difficulty_family: null, difficulty_tier: null }] }] })).toBe(true);
  });
});
