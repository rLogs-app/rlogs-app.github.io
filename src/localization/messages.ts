export type MessageValues = Readonly<Record<string, string | number>>;
export type MessageCatalog = Readonly<Record<string, string>>;
export type MessageCatalogs = Readonly<Record<string, MessageCatalog>>;

const enUsMessages: MessageCatalog = {
  "parse.timeline.title": "Combat timeline",
  "parse.timeline.aria": "Combat timeline",
  "parse.timeline.metric_group": "Timeline metric",
  "parse.timeline.metric.damage": "DPS",
  "parse.timeline.metric.healing": "HPS",
  "parse.timeline.metric.taken": "TPS",
  "parse.timeline.metric.taken_title": "Damage taken per second",
  "parse.timeline.metric.rdps_title": "Exact server-published rDPS-adjusted damage per reviewed Game-time second",
  "parse.timeline.window_group": "Trailing average window",
  "parse.timeline.trailing_average": "Trailing average",
  "parse.timeline.window.one": "1s",
  "parse.timeline.window.five": "5s",
  "parse.timeline.window.ten": "10s",
  "parse.timeline.playback_group": "Timeline playback",
  "parse.timeline.play": "Play",
  "parse.timeline.pause": "Pause",
  "parse.timeline.position": "Timeline position",
  "parse.timeline.inspection.title": "Point inspection",
  "parse.timeline.inspection.hint": "Hover the graph or focus it and use the arrow keys.",
  "parse.timeline.inspection.none": "No participants selected.",
  "parse.timeline.inspection.visible_total": "Visible total",
  "parse.timeline.snapshot.caption": "{metric} at {time}",
  "parse.timeline.snapshot.player": "Player",
  "parse.timeline.snapshot.one": "1s",
  "parse.timeline.snapshot.five": "5s",
  "parse.timeline.snapshot.ten": "10s",
  "parse.timeline.snapshot.run": "Run",
  "parse.timeline.snapshot.edps": "eDPS",
  "parse.timeline.snapshot.adps": "aDPS",
  "parse.timeline.snapshot.rdps": "rDPS",
  "parse.timeline.inspection.rate_unavailable": "eDPS/aDPS unavailable",
  "parse.timeline.inspection.rdps_unavailable": "cumulative rDPS unavailable",
  "parse.timeline.inspection.edps_adps": "eDPS {edps} · aDPS {adps}",
  "parse.timeline.inspection.rdps": "rDPS {rdps}",
  "parse.timeline.inspection.run_rate": "run {metric} {value}",
  "parse.timeline.inspection.rates": "1s {one} · 5s {five} · 10s {ten} · {cumulative}",
  "parse.timeline.inspector_aria": "Timeline point inspector",
  "parse.timeline.player": "Player {id}",
  "parse.timeline.participants": "Visible participants",
  "parse.timeline.graph_aria": "Sparse one-second combat rates over {duration}; death and loadout markers use run elapsed time",
  "parse.timeline.marker.death": "Death",
  "parse.timeline.marker.loadout": "Loadout change",
  "parse.timeline.marker_at": "{label} at {time}",
  "parse.timeline.rdps.exact": "rDPS",
  "parse.timeline.rdps.partial": "Partial rDPS",
  "parse.timeline.trust.reconciled": "{count} POVs / conserved replay",
  "parse.timeline.trust.pending": "Canonical POV / reconciliation pending",
  "parse.timeline.trust.single": "Canonical POV / no merged replay",
  "parse.timeline.trust_chip.reconciled": "Reconciled canonical spine",
  "parse.timeline.trust_chip.single": "Single canonical report",
  "parse.timeline.coverage.complete": "Complete run bounds",
  "parse.timeline.coverage.partial": "Partial run bounds",
  "parse.timeline.gaps.none": "No known gaps",
  "parse.timeline.gaps.one": "{count} unpositioned gap",
  "parse.timeline.gaps.other": "{count} unpositioned gaps",
  "parse.timeline.clock.exact": "Exact Game-time/active-combat clocks",
  "parse.timeline.clock.unavailable": "Game-time/active-combat clocks unavailable",
  "parse.timeline.note.rdps_buckets": "{label} uses exact server-published adjusted-damage buckets. Its 1s, 5s, 10s, and cumulative rates all use the reducer-authored reviewed Game-time clock; missing buckets or clocks are never replaced with ordinary damage or wall time.",
  "parse.timeline.note.run_span.one": "{count} verified rDPS affected-damage span is shown in the evidence lane.",
  "parse.timeline.note.run_span.other": "{count} verified rDPS affected-damage spans are shown in the evidence lane.",
  "parse.timeline.note.capture_span.one": "{count} rDPS influence span is capture-clock evidence and is intentionally not positioned on this run-elapsed graph.",
  "parse.timeline.note.capture_span.other": "{count} rDPS influence spans are capture-clock evidence and are intentionally not positioned on this run-elapsed graph.",
  "parse.timeline.note.clock_unavailable": "Time-local eDPS, aDPS, and rDPS are unavailable because no complete reducer-authored rate clock was published; wall time is not substituted.",
  "parse.timeline.note.series_truncated": "Time-local cumulative rates are unavailable because the public series numerator was truncated.",
  "parse.timeline.note.omissions.one": "{count} bounded item was omitted by the public projection.",
  "parse.timeline.note.omissions.other": "{count} bounded items were omitted by the public projection.",
  "parse.timeline.evidence_span": "Verified rDPS affected-damage span {index}: {start}–{end}",
  "parse.report.empty": "This report contains no public run.",
  "parse.report.scene": "Scene {id}",
  "parse.report.server_replayed": "Server replayed",
  "parse.report.verification.replayed": "Replayed",
  "parse.report.verification.corroborated": "Corroborated",
  "parse.report.verification.ranked": "Ranked",
  "parse.report.metric.run": "Run",
  "parse.report.metric.game": "Game",
  "parse.report.metric.active": "Active",
  "parse.report.metric.team_edps": "Team eDPS",
  "parse.report.metric.team_adps": "Team aDPS",
  "parse.report.metric.retries": "Retries",
  "parse.report.retry_summary.one": "{retries} / {boss} boss retry",
  "parse.report.retry_summary.other": "{retries} / {boss} boss retries",
  "parse.report.party.title": "Party",
  "parse.report.party.summary.one": "{count} combatant / rDPS {status}",
  "parse.report.party.summary.other": "{count} combatants / rDPS {status}",
  "parse.report.participant.damage": "Damage",
  "parse.report.participant.edps": "eDPS",
  "parse.report.participant.adps": "aDPS",
  "parse.report.participant.deaths": "Deaths",
  "parse.report.class_unresolved": "Class unresolved",
  "parse.report.difficulty_unresolved": "Difficulty unresolved",
  "parse.report.proof": "Build {build} / {events} / {gaps} / report {report}",
  "parse.report.proof.events.one": "{count} canonical event",
  "parse.report.proof.events.other": "{count} canonical events",
  "parse.report.proof.gaps.one": "{count} data gap",
  "parse.report.proof.gaps.other": "{count} data gaps",
  "parse.report.proof_group": "{proof} / group {group}",
  "parse.loadout.aria": "Party runes and loadouts",
  "parse.loadout.title": "Runes & loadouts",
  "parse.loadout.summary.one": "{exact} exact / {count} party member",
  "parse.loadout.summary.other": "{exact} exact / {count} party members",
  "parse.loadout.selection_note": "Multi-POV loadouts are selected only when their phase sequences agree. Conflicting snapshots remain separate evidence and are never merged.",
  "parse.loadout.evidence.no_identity": "No stable character identity",
  "parse.loadout.evidence.missing_pov": "Missing POV loadout evidence",
  "parse.loadout.evidence.conflict": "Conflicting POV loadouts — none selected",
  "parse.loadout.evidence.matching_povs": "{count} matching POVs",
  "parse.loadout.evidence.exact_local": "Exact local POV",
  "parse.loadout.evidence.exact_canonical": "Exact canonical POV",
  "parse.loadout.evidence.missing_canonical": "Missing canonical POV evidence",
  "parse.loadout.none_selected": "No loadout was selected.",
  "parse.loadout.modules.one": "{count} module",
  "parse.loadout.modules.other": "{count} modules",
  "parse.loadout.modules.unknown": "? modules",
  "parse.loadout.phases.one": "{count} phase",
  "parse.loadout.phases.other": "{count} phases",
  "parse.loadout.context.active": "Active combat",
  "parse.loadout.context.baseline": "Run baseline",
  "parse.loadout.context.between": "Between pulls",
  "parse.loadout.module": "Slot {slot}: module {id}",
  "parse.loadout.level": "Lv {level}",
  "parse.loadout.rune": "rune {id}",
  "parse.loadout.link_points": "{points} LP",
  "parse.loadout.no_rune_effects": "No rune effects",
  "parse.loadout.complete_empty": "Complete module snapshot: no modules equipped.",
  "parse.loadout.invalid": "Invalid module snapshot — partial runes withheld.",
  "parse.loadout.missing": "Module/rune evidence missing.",
  "parse.loadout.none_observed": "None observed",
  "parse.loadout.imagine": "slot {slot}: {id}",
  "parse.loadout.tier": "tier {tier}",
  "parse.loadout.phase": "Phase {number}",
  "parse.loadout.selected_phase": "Selected phase",
  "parse.loadout.equipment.one": "{count} equipment item",
  "parse.loadout.equipment.other": "{count} equipment items",
  "parse.loadout.equipment.unknown": "? equipment items",
  "parse.loadout.talents.one": "{count} talent",
  "parse.loadout.talents.other": "{count} talents",
  "parse.loadout.talents.unknown": "? talents",
  "parse.loadout.skills": "Skills",
  "parse.loadout.imagines": "Imagines",
};

export const bundledMessageCatalogs: MessageCatalogs = { "en-US": enUsMessages };

export interface MessageResolver {
  readonly locale: string;
  message(key: string, values?: MessageValues): string;
  number(value: number, options?: Intl.NumberFormatOptions): string;
}

export function localeFallbackChain(locale: string): string[] {
  const canonical = canonicalLocale(locale);
  const base = canonical.split("-")[0];
  return [...new Set([canonical, ...(base !== canonical ? [base] : []), "en-US"])];
}

export function createMessageResolver(
  locale = browserLocale(),
  catalogs: MessageCatalogs = bundledMessageCatalogs,
): MessageResolver {
  const canonical = canonicalLocale(locale);
  const chain = localeFallbackChain(canonical);
  const numberFormatters = new Map<string, Intl.NumberFormat>();
  return {
    locale: canonical,
    message(key, values = {}) {
      const template = chain.map((candidate) => catalogs[candidate]?.[key]).find((value) => value !== undefined) ?? key;
      return template.replace(/\{([a-z0-9_]+)\}/giu, (token, name: string) =>
        Object.hasOwn(values, name) ? String(values[name]) : token);
    },
    number(value, options = {}) {
      const cacheKey = JSON.stringify(options);
      let formatter = numberFormatters.get(cacheKey);
      if (!formatter) {
        formatter = new Intl.NumberFormat(canonical, options);
        numberFormatters.set(cacheKey, formatter);
      }
      return formatter.format(value);
    },
  };
}

function browserLocale(): string {
  return typeof navigator !== "undefined" && navigator.languages?.[0] ? navigator.languages[0] : "en-US";
}

function canonicalLocale(locale: string): string {
  try {
    return Intl.getCanonicalLocales(locale)[0] ?? "en-US";
  } catch {
    return "en-US";
  }
}
