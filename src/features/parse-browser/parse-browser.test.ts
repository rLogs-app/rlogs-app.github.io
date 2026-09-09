import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PublicParseReport, PublicRunReconciliation } from "../../contracts/public-parse";
import { selectCanonicalGraph } from "./parse-browser";

const load = <T>(name: string): T => JSON.parse(readFileSync(new URL(`../../../public/fixtures/${name}`, import.meta.url), "utf8")) as T;

describe("canonical timeline selection", () => {
  const report = load<PublicParseReport>("parse-report.v1.json");
  const reconciliation = load<PublicRunReconciliation>("parse-reconciliation.v1.json");

  it("falls back to one canonical report instead of summing POVs", () => {
    const selected = selectCanonicalGraph(report.runs[0], reconciliation);
    expect(selected.reconciled).toBe(false);
    expect(selected.participants).toBe(report.runs[0].participants);
  });

  it("uses reconciled participants only after a conserved replay completes", () => {
    const reconciled = {
      ...reconciliation,
      reconciled_participants: report.runs[0].participants.map((participant) => ({
        ...participant, rdps_damage: participant.damage, contribution_given: 0, contribution_received: 0, rdps_incomplete: false,
      })),
      timeline: { ...reconciliation.timeline, participant_tracks: report.runs[0].timeline.participant_tracks },
    } satisfies PublicRunReconciliation;
    expect(selectCanonicalGraph(report.runs[0], reconciled).participants).toBe(reconciled.reconciled_participants);
    expect(selectCanonicalGraph(report.runs[0], { ...reconciled, attribution_replay_completed: false }).reconciled).toBe(false);
    expect(selectCanonicalGraph(report.runs[0], { ...reconciled, conservation: { ...reconciled.conservation!, conserved: false } }).reconciled).toBe(false);
    const mismatched = { ...reconciled, timeline: { ...reconciled.timeline, participant_tracks: [
      { ...report.runs[0].timeline.participant_tracks[0], actor_id: "mismatched" },
    ] } } satisfies PublicRunReconciliation;
    expect(selectCanonicalGraph(report.runs[0], mismatched).reconciled).toBe(false);
  });
});
