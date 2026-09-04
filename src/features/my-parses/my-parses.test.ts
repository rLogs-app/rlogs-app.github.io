import { describe, expect, it } from "vitest";

import type { MyParseCatalogEntry } from "../../contracts/public-parse";
import {
  bindMyParseSkillDetails,
  filterMyParses,
  renderMyParseEntry,
} from "./my-parses";

const entry: MyParseCatalogEntry = {
  report_id: `rpt_${"ab".repeat(16)}`,
  report_ids: [`rpt_${"ab".repeat(16)}`],
  run_index: 0,
  run_group_id: `run_${"cd".repeat(16)}`,
  contribution_count: 1,
  distinct_submitter_count: 1,
  local_profile_witness_character_count: 0,
  attribution_reconciliation_status: "single_vantage",
  created_unix_millis: 1,
  deployment_id: "global",
  region_id: "global",
  activity_id: "scene.32154",
  activity_family_id: "stimen-vaults",
  scene_id: 32154,
  scene_name: "Floor 54",
  terminal_state: "completed",
  total_run_time_micros: 1,
  participant_count: 5,
  visibility: "unlisted",
  submitted_by_you: false,
  matched_character_ids: ["3296036"],
};

describe("My Parses", () => {
  it("opens grouped Other skill details from authenticated parse reports", () => {
    let click: ((event: Event) => void) | undefined;
    const details = "<article>All remaining skills</article>";
    const template = { innerHTML: details };
    const row = { closest: () => null, querySelector: () => template };
    const button = { closest: (selector: string) => selector === ".parse-skill-other-row" ? row : null };
    const nestedTarget = { closest: () => button };
    const root = {
      addEventListener: (_type: string, listener: (event: Event) => void) => { click = listener; },
      contains: (node: unknown) => node === button,
    } as unknown as HTMLElement;
    let shown = "";

    bindMyParseSkillDetails(root, { show: (html) => { shown = html; } });
    click?.({
      target: nestedTarget,
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
    } as unknown as Event);

    expect(shown).toBe(details);
  });

  it("searches verified membership, scene, and visibility", () => {
    expect(filterMyParses([entry], "3296036 unlisted floor 54")).toEqual([entry]);
    expect(filterMyParses([entry], "private")).toEqual([]);
  });

  it("lets only the uploader change a parse's visibility", () => {
    const participantHtml = renderMyParseEntry(entry);
    const ownerHtml = renderMyParseEntry({ ...entry, submitted_by_you: true });

    expect(participantHtml).not.toContain("data-visibility-report");
    expect(participantHtml).toContain("Participant: 3296036");
    expect(ownerHtml).toContain(`data-visibility-report="${entry.report_id}"`);
    expect(ownerHtml).toContain('<option value="public">Public</option>');
    expect(ownerHtml).toContain('<option value="unlisted" selected>Unlisted</option>');
    expect(ownerHtml).toContain('<option value="private">Private</option>');
  });
});
