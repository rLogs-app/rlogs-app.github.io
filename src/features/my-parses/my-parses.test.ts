import { describe, expect, it } from "vitest";

import type { MyParseCatalogEntry } from "../../contracts/public-parse";
import type { ParsePresentationCatalog } from "../parse-browser/parse-presentation";
import {
  bindMyParseReportInteractions,
  filterMyParses,
  renderMyParseEntry,
} from "./my-parses";

const digest = "sha256:4372050d9d549808b229b16de315080f9bac427efe9602dabd9b93c4502dbbae";
const presentation: ParsePresentationCatalog = {
  schema_version: 5, locale: "en-US", deployment_id: "global", game_build: "24687926",
  protocol_pack_digest: digest, source: "test", actions: {}, effects: {}, imagines: {}, modules: {}, module_effects: {},
  scenes: { "32154": "Floor 54" }, classes: {}, specializations: {},
};

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
  client_build: "24687926",
  protocol_pack_digest: digest,
  region_id: "global",
  activity_id: "scene.32154",
  activity_family_id: "stimen-vaults",
  scene_id: 32154,
  scene_name: "Floor 54",
  difficulty_family: "challenge",
  difficulty_tier: 54,
  terminal_state: "completed",
  total_run_time_micros: 1,
  participant_count: 5,
  visibility: "unlisted",
  submitted_by_you: false,
  matched_character_ids: ["3296036"],
};

describe("My Parses", () => {
  it("opens grouped Other skill details from authenticated parse reports", () => {
    const clicks: Array<(event: Event) => void> = [];
    const details = "<article>All remaining skills</article>";
    const template = { innerHTML: details };
    const row = { closest: () => null, querySelector: () => template };
    const button = { closest: (selector: string) => selector === ".parse-skill-other-row" ? row : null };
    const nestedTarget = { closest: () => button };
    const root = {
      addEventListener: (_type: string, listener: (event: Event) => void) => { clicks.push(listener); },
      querySelectorAll: () => [],
      contains: (node: unknown) => node === button,
    } as unknown as HTMLElement;
    let shown = "";

    bindMyParseReportInteractions(root, { show: (html) => { shown = html; } });
    clicks[0]?.({
      target: nestedTarget,
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
    } as unknown as Event);

    expect(shown).toBe(details);
  });

  it("hydrates the shared timeline controls after a private report is rendered", () => {
    const queried: string[] = [];
    const root = {
      addEventListener: () => undefined,
      querySelectorAll: (selector: string) => {
        queried.push(selector);
        return [];
      },
    } as unknown as HTMLElement;

    const refresh = bindMyParseReportInteractions(root, { show: () => undefined });
    expect(queried).toEqual([]);

    refresh();
    expect(queried).toEqual([
      "[data-timeline-metric]",
      "[data-metric]",
      "[data-window]",
      "[data-timeline-death-trigger]",
      "[data-participant-toggle]",
      "[data-hostile-mechanics-toggle]",
      "[data-participant-show-all], [data-participant-clear]",
      "[data-timeline-inspector]",
    ]);
  });

  it("searches verified membership, scene, and visibility", () => {
    expect(filterMyParses([entry], "3296036 unlisted floor 54", presentation, 7)).toEqual([entry]);
    expect(filterMyParses([entry], "private")).toEqual([]);
  });

  it("keeps catalog labels for legacy and wrong-identity parses while leaving difficulty raw", () => {
    const wrong = { ...entry, protocol_pack_digest: `sha256:${"f".repeat(64)}` };
    for (const [candidate, schema] of [[entry, 6], [wrong, 7]] as const) {
      const html = renderMyParseEntry(candidate, presentation, schema);
      expect(html).toContain("Floor 54");
      expect(html).toContain("Tier 54");
      expect(html).toContain("Participant: 3296036");
      expect(html).not.toContain("Challenge");
      expect(filterMyParses([candidate], "floor", presentation, schema)).toEqual([candidate]);
      expect(filterMyParses([candidate], "32154 unlisted 3296036", presentation, schema)).toEqual([candidate]);
    }
  });

  it("lets only the uploader change a parse's visibility", () => {
    const participantHtml = renderMyParseEntry(entry, presentation, 7);
    const ownerHtml = renderMyParseEntry({ ...entry, submitted_by_you: true }, presentation, 7);

    expect(participantHtml).not.toContain("data-visibility-report");
    expect(participantHtml).toContain("Participant: 3296036");
    expect(ownerHtml).toContain(`data-visibility-report="${entry.report_id}"`);
    expect(ownerHtml).toContain('<option value="public">Public</option>');
    expect(ownerHtml).toContain('<option value="unlisted" selected>Unlisted</option>');
    expect(ownerHtml).toContain('<option value="private">Private</option>');
  });
});
