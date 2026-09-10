import {
  isPublicParseCatalog,
  isPublicParseReport,
  isPublicRunReconciliation,
  type PublicParseCatalog,
  type PublicParseCatalogEntry,
  type PublicParseReport,
  type PublicParticipant,
  type PublicCombatLoadoutPhase,
  type PublicRun,
  type PublicRunReconciliation,
  type PublicTimelineRateClockPoint,
  validateReportId,
} from "../../contracts/public-parse";
import { createMessageResolver, type MessageResolver } from "../../localization/messages";

const baseUrl = import.meta.env.BASE_URL;
const configuredApi = String(import.meta.env.VITE_RLOGS_API_BASE_URL ?? "").replace(/\/$/, "");

type ParseControls = Record<"region" | "activity" | "scene" | "difficulty", HTMLSelectElement>;

export async function mountParseBrowser(): Promise<void> {
  const root = document.querySelector<HTMLElement>("#parse-browser");
  if (!root) return;

  const status = required<HTMLElement>("#parse-status");
  const list = required<HTMLElement>("#parse-list");
  const detail = required<HTMLElement>("#parse-detail");
  const controls: ParseControls = {
    region: required<HTMLSelectElement>("#parse-region"),
    activity: required<HTMLSelectElement>("#parse-activity"),
    scene: required<HTMLSelectElement>("#parse-scene"),
    difficulty: required<HTMLSelectElement>("#parse-difficulty"),
  };

  let catalog: PublicParseCatalog;
  let demoSource: PublicParseCatalog | undefined;
  try {
    catalog = await fetchCatalog();
    if (!configuredApi) demoSource = catalog;
    status.textContent = configuredApi ? "Live catalog" : "Demo catalog";
    status.className = "status-chip success";
  } catch (error) {
    status.textContent = "Catalog unavailable";
    status.className = "status-chip danger";
    list.innerHTML = `<p class="empty-state">${escapeHtml(message(error))}</p>`;
    return;
  }

  populateSelect(controls.region, catalog.facets.regions.map((item) => [item.id, label(item.id, item.count)]));
  populateSelect(controls.activity, catalog.facets.activities.map((item) => [item.id, label(item.id, item.count)]));
  populateSelect(
    controls.scene,
    catalog.facets.scenes.map((item) => [String(item.id), label(item.label ?? `Scene ${item.id}`, item.count)]),
  );
  populateSelect(
    controls.difficulty,
    catalog.facets.difficulties.map((item) => [item.id, label(item.id, item.count)]),
  );

  const renderList = (): void => {
    list.innerHTML = catalog.entries.length
      ? `${catalog.entries.map(renderCatalogEntry).join("")}${renderLoadMore(catalog)}`
      : '<p class="empty-state">No submitted parses match these filters.</p>';
    list.querySelectorAll<HTMLButtonElement>("[data-report-id]").forEach((button) => {
      button.addEventListener("click", () =>
        void openReport(button.dataset.reportId ?? "", Number(button.dataset.runIndex ?? "0")),
      );
    });
    list.querySelector<HTMLButtonElement>("[data-load-more]")?.addEventListener("click", () => void loadMore());
  };

  Object.values(controls).forEach((control) =>
    control.addEventListener("change", () => void refreshFilteredCatalog()),
  );
  renderList();

  const search = new URLSearchParams(location.search);
  const requestedReport = search.get("parse");
  const requestedRun = Number(search.get("run") ?? "0");
  if (requestedReport && validateReportId(requestedReport)) await openReport(requestedReport, requestedRun);

  async function refreshFilteredCatalog(): Promise<void> {
    list.innerHTML = '<p class="empty-state">Loading submitted parses&hellip;</p>';
    try {
      catalog = configuredApi
        ? await fetchCatalog(catalogQuery(controls))
        : filterDemoCatalog(demoSource ?? catalog, controls);
      renderList();
    } catch (error) {
      list.innerHTML = `<p class="empty-state">${escapeHtml(message(error))}</p>`;
    }
  }

  async function loadMore(): Promise<void> {
    if (!configuredApi || catalog.next_offset == null) return;
    const next = await fetchCatalog(catalogQuery(controls, catalog.next_offset));
    catalog = { ...next, entries: [...catalog.entries, ...next.entries], offset: 0 };
    renderList();
  }

  async function openReport(reportId: string, runIndex = 0): Promise<void> {
    if (!validateReportId(reportId)) return;
    detail.innerHTML = '<p class="empty-state">Loading server-verified parse&hellip;</p>';
    try {
      const report = await fetchReport(reportId);
      const run = report.runs.find((candidate) => candidate.run_index === runIndex) ?? report.runs[0];
      const reconciliation = run?.run_group_id ? await fetchReconciliation(run.run_group_id) : undefined;
      detail.innerHTML = renderReport(report, runIndex, reconciliation);
      wireTimelineControls(detail);
      history.replaceState(
        null,
        "",
        `${location.pathname}?parse=${encodeURIComponent(reportId)}&run=${runIndex}#parse`,
      );
    } catch (error) {
      detail.innerHTML = `<p class="empty-state">${escapeHtml(message(error))}</p>`;
    }
  }
}

async function fetchCatalog(query = ""): Promise<PublicParseCatalog> {
  return fetchTyped(
    configuredApi ? `${configuredApi}/v1/parses?limit=250${query}` : `${baseUrl}fixtures/parse-catalog.v1.json`,
    isPublicParseCatalog,
  );
}

async function fetchReport(reportId: string): Promise<PublicParseReport> {
  return fetchTyped(
    configuredApi ? `${configuredApi}/v1/parses/${reportId}` : `${baseUrl}fixtures/parse-report.v1.json`,
    isPublicParseReport,
  );
}

async function fetchReconciliation(runGroupId: string): Promise<PublicRunReconciliation | undefined> {
  const url = configuredApi
    ? `${configuredApi}/v1/run-groups/${encodeURIComponent(runGroupId)}/reconciliation`
    : `${baseUrl}fixtures/parse-reconciliation.v1.json`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`Reconciliation request failed (${response.status}).`);
  const value: unknown = await response.json();
  if (!isPublicRunReconciliation(value) || value.run_group_id !== runGroupId) {
    throw new Error("The server returned an unsupported reconciliation contract.");
  }
  return value;
}

async function fetchTyped<T>(url: string, guard: (value: unknown) => value is T): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Request failed (${response.status}).`);
  const value: unknown = await response.json();
  if (!guard(value)) throw new Error("The server returned an unsupported parse contract.");
  return value;
}

function renderCatalogEntry(entry: PublicParseCatalogEntry): string {
  const difficulty = [title(entry.difficulty_family), entry.difficulty_tier ? ` ${entry.difficulty_tier}` : ""]
    .join("")
    .trim();
  return `<button class="parse-row" type="button" data-report-id="${escapeHtml(entry.report_id)}" data-run-index="${entry.run_index}">
    <span><strong>${escapeHtml(entry.scene_name ?? entry.activity_id ?? `Scene ${entry.scene_id ?? "?"}`)}</strong>
      <small>${escapeHtml([difficulty, title(entry.terminal_state)].filter(Boolean).join(" / "))}</small></span>
    <span><small>Region</small><strong>${escapeHtml(title(entry.region_id))}</strong></span>
    <span><small>Party</small><strong>${entry.participant_count}</strong></span>
    <span><small>Evidence</small><strong>${entry.contribution_count ?? 1} report${(entry.contribution_count ?? 1) === 1 ? "" : "s"} / ${entry.distinct_submitter_count ?? 0} submitter${(entry.distinct_submitter_count ?? 0) === 1 ? "" : "s"}</strong></span>
    <span><small>Run time</small><strong>${formatDuration(entry.total_run_time_micros)}</strong></span>
    <span><small>Recorded</small><strong>${new Date(entry.created_unix_millis).toLocaleDateString()}</strong></span>
    <span aria-hidden="true">&rsaquo;</span>
  </button>`;
}

export function renderReport(report: PublicParseReport, runIndex: number, reconciliation?: PublicRunReconciliation, messages = createMessageResolver()): string {
  const run = report.runs.find((candidate) => candidate.run_index === runIndex) ?? report.runs[0];
  if (!run) return `<p class="empty-state">${escapeHtml(messages.message("parse.report.empty"))}</p>`;
  const graph = selectCanonicalGraph(run, reconciliation);
  const teamEdps = graph.participants.reduce((sum, actor) => sum + actor.dps, 0);
  const teamAdps = graph.participants.reduce((sum, actor) => sum + actor.encounter_dps, 0);
  const count = (value: number) => messages.number(value, { maximumFractionDigits: 0 });
  const scene = run.scene_name ?? run.activity_id ?? messages.message("parse.report.scene", { id: run.scene_id ?? "?" });
  const verification = messages.message(`parse.report.verification.${report.verification.tier}`);
  const partySummary = messages.message(graph.participants.length === 1 ? "parse.report.party.summary.one" : "parse.report.party.summary.other", {
    count: count(graph.participants.length), status: run.rdps_status,
  });
  const eventCount = messages.message(report.verification.event_count === 1 ? "parse.report.proof.events.one" : "parse.report.proof.events.other", { count: count(report.verification.event_count) });
  const gapCount = messages.message(run.data_gap_count === 1 ? "parse.report.proof.gaps.one" : "parse.report.proof.gaps.other", { count: count(run.data_gap_count) });
  const proof = messages.message("parse.report.proof", {
    build: report.client_build, events: eventCount, gaps: gapCount, report: report.report_id,
  });
  return `<article class="parse-report">
    <div class="parse-report-heading"><div><p class="eyebrow">${escapeHtml(report.region_id)} / ${escapeHtml(verification)}</p>
      <h3>${escapeHtml(scene)}</h3>
      <p>${escapeHtml(formatDifficulty(run, messages))} / ${escapeHtml(title(run.terminal_state))}</p></div>
      <span class="status-chip success">${escapeHtml(messages.message("parse.report.server_replayed"))}</span></div>
    <div class="parse-metrics">
      ${metric(messages.message("parse.report.metric.run"), formatDuration(run.total_run_time_micros))}
      ${metric(messages.message("parse.report.metric.game"), formatDuration(run.game_time_micros))}
      ${metric(messages.message("parse.report.metric.active"), formatDuration(run.active_combat_micros))}
      ${metric(messages.message("parse.report.metric.team_edps"), formatNumber(teamEdps, messages))}
      ${metric(messages.message("parse.report.metric.team_adps"), formatNumber(teamAdps, messages))}
      ${metric(messages.message("parse.report.metric.retries"), messages.message(run.boss_retry_count === 1 ? "parse.report.retry_summary.one" : "parse.report.retry_summary.other", { retries: count(run.retry_count), boss: count(run.boss_retry_count) }))}
    </div>
    ${renderTimeline(graph, messages)}
    ${renderPartyLoadouts(run, graph.participants, reconciliation, messages)}
    <div class="parse-party"><div class="parse-party-head"><strong>${escapeHtml(messages.message("parse.report.party.title"))}</strong><small>${escapeHtml(partySummary)}</small></div>
      ${graph.participants.map((participant) => renderParticipant(participant, run.rdps_status, messages)).join("")}
    </div>
    <p class="parse-proof">${escapeHtml(run.run_group_id ? messages.message("parse.report.proof_group", { proof, group: run.run_group_id }) : proof)}</p>
  </article>`;
}

export interface PartyLoadoutSummary {
  participant: PublicParticipant;
  disposition: "exact" | "conflict" | "missing";
  evidenceLabel: string;
  phases: PublicCombatLoadoutPhase[];
}

export function partyLoadoutSummaries(
  run: PublicRun,
  participants: readonly PublicParticipant[],
  reconciliation?: PublicRunReconciliation,
  messages = createMessageResolver(),
): PartyLoadoutSummary[] {
  const characters = new Map(reconciliation?.characters.map((character) => [character.character_id, character]));
  return participants.map((participant) => {
    const characterId = participant.character_id;
    if (!characterId) return { participant, disposition: "missing", evidenceLabel: messages.message("parse.loadout.evidence.no_identity"), phases: [] };
    if (reconciliation) {
      const character = characters.get(characterId);
      if (!character || character.combat_loadout_disposition === "missing") {
        return { participant, disposition: "missing", evidenceLabel: messages.message("parse.loadout.evidence.missing_pov"), phases: [] };
      }
      if (character.combat_loadout_disposition === "multiple_reports_require_ordering") {
        return { participant, disposition: "conflict", evidenceLabel: messages.message("parse.loadout.evidence.conflict"), phases: [] };
      }
      return {
        participant,
        disposition: "exact",
        evidenceLabel: character.combat_loadout_disposition === "multiple_reports_identical"
          ? messages.message("parse.loadout.evidence.matching_povs", { count: messages.number(character.participant_report_count, { maximumFractionDigits: 0 }) })
          : messages.message("parse.loadout.evidence.exact_local"),
        phases: character.selected_combat_loadout_phases,
      };
    }
    const phases = run.combat_loadout_phases.filter((phase) => phase.character_id === characterId);
    return phases.length
      ? { participant, disposition: "exact", evidenceLabel: messages.message("parse.loadout.evidence.exact_canonical"), phases }
      : { participant, disposition: "missing", evidenceLabel: messages.message("parse.loadout.evidence.missing_canonical"), phases: [] };
  });
}

export function renderPartyLoadouts(
  run: PublicRun,
  participants: readonly PublicParticipant[],
  reconciliation?: PublicRunReconciliation,
  messages = createMessageResolver(),
): string {
  const summaries = partyLoadoutSummaries(run, participants, reconciliation, messages);
  const exact = summaries.filter((summary) => summary.disposition === "exact").length;
  const summary = messages.message(summaries.length === 1 ? "parse.loadout.summary.one" : "parse.loadout.summary.other", {
    exact: messages.number(exact, { maximumFractionDigits: 0 }), count: messages.number(summaries.length, { maximumFractionDigits: 0 }),
  });
  return `<section class="party-loadouts" aria-label="${escapeHtml(messages.message("parse.loadout.aria"))}">
    <div class="parse-party-head"><strong>${escapeHtml(messages.message("parse.loadout.title"))}</strong><small>${escapeHtml(summary)}</small></div>
    <div class="party-loadout-grid">${summaries.map((loadout) => renderPartyLoadout(loadout, messages)).join("")}</div>
    <p class="timeline-note">${escapeHtml(messages.message("parse.loadout.selection_note"))}</p>
  </section>`;
}

function renderPartyLoadout(summary: PartyLoadoutSummary, messages: MessageResolver): string {
  const name = summary.participant.display_name ?? messages.message("parse.timeline.player", { id: summary.participant.actor_id });
  const className = summary.participant.class_name ?? messages.message("parse.report.class_unresolved");
  const statusClass = summary.disposition === "exact" ? "success" : summary.disposition === "conflict" ? "warning" : "neutral";
  if (summary.disposition !== "exact") {
    return `<article class="party-loadout-card"><div class="party-loadout-title"><span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(className)}</small></span><span class="status-chip ${statusClass}">${escapeHtml(summary.evidenceLabel)}</span></div><p class="party-loadout-empty">${escapeHtml(messages.message("parse.loadout.none_selected"))}</p></article>`;
  }
  const phases = [...summary.phases].sort((left, right) => left.run_elapsed_micros - right.run_elapsed_micros);
  const moduleCount = phases.at(-1)?.equipped_module_count;
  const modules = moduleCount == null ? messages.message("parse.loadout.modules.unknown")
    : messages.message(moduleCount === 1 ? "parse.loadout.modules.one" : "parse.loadout.modules.other", { count: messages.number(moduleCount, { maximumFractionDigits: 0 }) });
  const phaseCount = messages.message(phases.length === 1 ? "parse.loadout.phases.one" : "parse.loadout.phases.other", { count: messages.number(phases.length, { maximumFractionDigits: 0 }) });
  return `<details class="party-loadout-card"><summary class="party-loadout-title"><span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(`${className} · ${modules} · ${phaseCount}`)}</small></span><span class="status-chip ${statusClass}">${escapeHtml(summary.evidenceLabel)}</span></summary>
    <div class="party-loadout-phases">${phases.map((phase, index) => renderLoadoutPhase(phase, index, phases.length, messages)).join("")}</div></details>`;
}

function renderLoadoutPhase(phase: PublicCombatLoadoutPhase, index: number, count: number, messages: MessageResolver): string {
  const integer = (value: number) => messages.number(value, { maximumFractionDigits: 0 });
  const context = messages.message(phase.in_active_combat ? "parse.loadout.context.active" : index === 0 ? "parse.loadout.context.baseline" : "parse.loadout.context.between");
  const modules = phase.module_snapshot_disposition === "complete"
    ? phase.equipped_modules.length
      ? `<div class="loadout-modules">${phase.equipped_modules.map((module) => {
        const moduleLabel = messages.message("parse.loadout.module", { slot: integer(module.equipped_slot), id: module.config_id });
        const level = module.level == null ? "" : ` · ${messages.message("parse.loadout.level", { level: integer(module.level) })}`;
        const effects = module.effects.length ? module.effects.map((effect) => {
          const rune = messages.message("parse.loadout.rune", { id: effect.effect_id });
          return effect.initial_link_points == null ? rune : `${rune} · ${messages.message("parse.loadout.link_points", { points: integer(effect.initial_link_points) })}`;
        }).join(" / ") : messages.message("parse.loadout.no_rune_effects");
        return `<span><strong>${escapeHtml(`${moduleLabel}${level}`)}</strong><small>${escapeHtml(effects)}</small></span>`;
      }).join("")}</div>`
      : `<p class="party-loadout-empty">${escapeHtml(messages.message("parse.loadout.complete_empty"))}</p>`
    : `<p class="party-loadout-empty">${escapeHtml(messages.message(phase.module_snapshot_disposition === "invalid" ? "parse.loadout.invalid" : "parse.loadout.missing"))}</p>`;
  const skills = phase.equipped_skill_ids.length ? phase.equipped_skill_ids.join(", ") : messages.message("parse.loadout.none_observed");
  const imagines = phase.equipped_imagines.length ? phase.equipped_imagines.map((imagine) => {
    const item = messages.message("parse.loadout.imagine", { slot: integer(imagine.equipped_slot), id: imagine.skill_id });
    return imagine.tier == null ? item : `${item} (${messages.message("parse.loadout.tier", { tier: integer(imagine.tier) })})`;
  }).join(", ") : messages.message("parse.loadout.none_observed");
  const phaseLabel = count > 1 ? messages.message("parse.loadout.phase", { number: integer(index + 1) }) : messages.message("parse.loadout.selected_phase");
  const equipment = phase.equipment_count == null ? messages.message("parse.loadout.equipment.unknown")
    : messages.message(phase.equipment_count === 1 ? "parse.loadout.equipment.one" : "parse.loadout.equipment.other", { count: integer(phase.equipment_count) });
  const talents = phase.talent_count == null ? messages.message("parse.loadout.talents.unknown")
    : messages.message(phase.talent_count === 1 ? "parse.loadout.talents.one" : "parse.loadout.talents.other", { count: integer(phase.talent_count) });
  const className = [phase.class_name, phase.specialization_name].filter(Boolean).join(" / ") || messages.message("parse.report.class_unresolved");
  return `<section class="loadout-phase" data-loadout-at-micros="${phase.run_elapsed_micros}"><div class="loadout-phase-heading"><strong>${escapeHtml(phaseLabel)}</strong><small>${escapeHtml(`${context} · ${formatDuration(phase.run_elapsed_micros)}`)}</small></div>
    <p><strong>${escapeHtml(className)}</strong> · ${escapeHtml(equipment)} · ${escapeHtml(talents)}</p>
    ${modules}<p><small>${escapeHtml(messages.message("parse.loadout.skills"))}</small> ${escapeHtml(skills)}</p><p><small>${escapeHtml(messages.message("parse.loadout.imagines"))}</small> ${escapeHtml(imagines)}</p></section>`;
}

export interface CanonicalGraphSelection {
  participants: PublicParticipant[];
  timeline: PublicRun["timeline"];
  reconciled: boolean;
  trustKind: "reconciled" | "pending" | "single";
  contributingReportCount: number;
  rdpsStatus: string;
}

export function selectCanonicalGraph(run: PublicRun, reconciliation?: PublicRunReconciliation): CanonicalGraphSelection {
  const usable = reconciliation?.status === "reconciled" && reconciliation.attribution_replay_completed &&
    reconciliation.conservation?.conserved === true && reconciliation.canonical_spine.report_id === reconciliation.timeline.canonical_report_id &&
    reconciliation.timeline.source === "reconciled_canonical_spine" && reconciliation.timeline.time_basis === "run_elapsed" &&
    reconciliation.reconciled_participants.length > 0 && reconciliation.timeline.participant_tracks.every((track) =>
      reconciliation.reconciled_participants[track.canonical_participant_index]?.actor_id === track.actor_id &&
      track.series_point_count <= reconciliation.reconciled_participants[track.canonical_participant_index]!.series.length);
  if (usable) {
    return { participants: reconciliation.reconciled_participants, timeline: reconciliation.timeline, reconciled: true,
      trustKind: "reconciled", contributingReportCount: reconciliation.reports.length, rdpsStatus: run.rdps_status };
  }
  return { participants: run.participants, timeline: run.timeline, reconciled: false,
    trustKind: reconciliation ? "pending" : "single", contributingReportCount: reconciliation?.reports.length ?? 1, rdpsStatus: run.rdps_status };
}

type TimelineMetric = "damage" | "effective_healing" | "damage_taken" | "rdps_damage";
const palette = ["#52cfff", "#ffcc66", "#91e6a5", "#ff7aa8", "#b8a1ff", "#ff9166", "#7ce3dc", "#d9f06f"];

export function renderTimeline(graph: CanonicalGraphSelection, messages = createMessageResolver()): string {
  const { timeline, participants } = graph;
  const durationSeconds = Math.max(1, Math.ceil(timeline.duration_micros / 1_000_000));
  const plotted = timeline.participant_tracks.flatMap((track, trackIndex) => {
    const actor = participants[track.canonical_participant_index];
    if (!actor || actor.actor_id !== track.actor_id) return [];
    return [{ actor, track, color: palette[trackIndex % palette.length] }];
  });
  const rdpsTracks = plotted.filter(({ actor, track }) => hasCompleteRdpsBuckets(actor.series.slice(0, track.series_point_count)));
  const exactCumulativeRdpsTracks = rdpsTracks.filter(({ actor }) => actor.rdps_incomplete === false);
  const partialRdps = graph.rdpsStatus.startsWith("partial_") || plotted.some(({ actor, track }) =>
    actor.rdps_incomplete === true || !hasCompleteRdpsBuckets(actor.series.slice(0, track.series_point_count)));
  const rdpsLabel = messages.message(partialRdps ? "parse.timeline.rdps.partial" : "parse.timeline.rdps.exact");
  const captureSpans = timeline.rdps_influence_spans.filter((span) => span.time_basis === "capture_observed").length;
  const runAlignedSpans = timeline.rdps_influence_spans.filter((span) => span.time_basis === "run_elapsed").length;
  const omissions = Object.values(timeline.omitted).reduce((sum, value) => sum + value, 0);
  const count = (value: number) => messages.number(value, { maximumFractionDigits: 0 });
  const trustLabel = graph.trustKind === "reconciled"
    ? messages.message("parse.timeline.trust.reconciled", { count: count(graph.contributingReportCount) })
    : messages.message(`parse.timeline.trust.${graph.trustKind}`);
  const trustChip = messages.message(graph.reconciled ? "parse.timeline.trust_chip.reconciled" : "parse.timeline.trust_chip.single");
  const coverage = messages.message(timeline.coverage.authoritative_start && timeline.coverage.authoritative_completion
    ? "parse.timeline.coverage.complete" : "parse.timeline.coverage.partial");
  const gaps = timeline.coverage.data_gap_count
    ? messages.message(timeline.coverage.data_gap_count === 1 ? "parse.timeline.gaps.one" : "parse.timeline.gaps.other", { count: count(timeline.coverage.data_gap_count) })
    : messages.message("parse.timeline.gaps.none");
  const rateClock = messages.message(timeline.rate_clock_complete === true && timeline.rate_clock?.length
    ? "parse.timeline.clock.exact" : "parse.timeline.clock.unavailable");
  const notes = [
    rdpsTracks.length ? messages.message("parse.timeline.note.rdps_buckets", { label: rdpsLabel }) : "",
    runAlignedSpans ? messages.message(runAlignedSpans === 1 ? "parse.timeline.note.run_span.one" : "parse.timeline.note.run_span.other", { count: count(runAlignedSpans) }) : "",
    captureSpans ? messages.message(captureSpans === 1 ? "parse.timeline.note.capture_span.one" : "parse.timeline.note.capture_span.other", { count: count(captureSpans) }) : "",
    !timeline.rate_clock_complete ? messages.message("parse.timeline.note.clock_unavailable") : "",
    timeline.omitted.series_points ? messages.message("parse.timeline.note.series_truncated") : "",
    omissions ? messages.message(omissions === 1 ? "parse.timeline.note.omissions.one" : "parse.timeline.note.omissions.other", { count: count(omissions) }) : "",
  ].filter(Boolean).join(" ");
  return `<section class="combat-timeline" data-timeline-metric="damage" data-timeline-window="5" data-timeline-rdps-label="${escapeHtml(rdpsLabel)}" data-timeline-participant-count="${plotted.length}" data-timeline-exact-rdps-track-count="${exactCumulativeRdpsTracks.length}" data-locale="${escapeHtml(messages.locale)}" aria-label="${escapeHtml(messages.message("parse.timeline.aria"))}">
    <div class="timeline-heading"><div><strong>${escapeHtml(messages.message("parse.timeline.title"))}</strong><small>${escapeHtml(trustLabel)}</small></div>
      <div class="timeline-controls" role="group" aria-label="${escapeHtml(messages.message("parse.timeline.metric_group"))}">
        <button type="button" data-metric="damage" aria-pressed="true">${escapeHtml(messages.message("parse.timeline.metric.damage"))}</button>
        <button type="button" data-metric="effective_healing" aria-pressed="false">${escapeHtml(messages.message("parse.timeline.metric.healing"))}</button>
        <button type="button" data-metric="damage_taken" aria-pressed="false" title="${escapeHtml(messages.message("parse.timeline.metric.taken_title"))}">${escapeHtml(messages.message("parse.timeline.metric.taken"))}</button>
        ${rdpsTracks.length ? `<button type="button" data-metric="rdps_damage" aria-pressed="false" title="${escapeHtml(messages.message("parse.timeline.metric.rdps_title"))}">${escapeHtml(rdpsLabel)}</button>` : ""}
      </div></div>
    <div class="timeline-window-controls" role="group" aria-label="${escapeHtml(messages.message("parse.timeline.window_group"))}">
      <span>${escapeHtml(messages.message("parse.timeline.trailing_average"))}</span>
      <button type="button" data-window="1" aria-pressed="false">${escapeHtml(messages.message("parse.timeline.window.one"))}</button>
      <button type="button" data-window="5" aria-pressed="true">${escapeHtml(messages.message("parse.timeline.window.five"))}</button>
      <button type="button" data-window="10" aria-pressed="false">${escapeHtml(messages.message("parse.timeline.window.ten"))}</button>
    </div>
    <div class="timeline-trust"><span class="status-chip ${graph.reconciled ? "success" : "neutral"}">${escapeHtml(trustChip)}</span><span>${escapeHtml(coverage)}</span><span>${escapeHtml(gaps)}</span><span>${escapeHtml(rateClock)}</span></div>
    <div class="timeline-playback" role="group" aria-label="${escapeHtml(messages.message("parse.timeline.playback_group"))}">
      <button type="button" data-timeline-play aria-pressed="false">${escapeHtml(messages.message("parse.timeline.play"))}</button>
      <input type="range" data-timeline-scrubber min="0" max="${durationSeconds}" step="1" value="0" aria-label="${escapeHtml(messages.message("parse.timeline.position"))}" />
    </div>
    <div class="timeline-chart-scroll">${renderTimelineSvg(timeline, plotted, rdpsLabel, messages)}</div>
    <div class="timeline-inspection" data-timeline-inspection aria-live="polite"><strong>${escapeHtml(messages.message("parse.timeline.inspection.title"))}</strong><span>${escapeHtml(messages.message("parse.timeline.inspection.hint"))}</span></div>
    <div class="timeline-legend" role="group" aria-label="${escapeHtml(messages.message("parse.timeline.participants"))}">${plotted.map(({ actor, color }, participantIndex) => `<button type="button" data-participant-toggle="${participantIndex}" aria-pressed="true" style="--track:${color}"><i></i><span>${escapeHtml(actor.display_name ?? messages.message("parse.timeline.player", { id: actor.actor_id }))}</span></button>`).join("")}</div>
    ${notes ? `<p class="timeline-note">${escapeHtml(notes)}</p>` : ""}
  </section>`;
}

function renderTimelineSvg(timeline: PublicRun["timeline"], plotted: Array<{ actor: PublicParticipant; track: PublicRun["timeline"]["participant_tracks"][number]; color: string }>, rdpsLabel: string, messages: MessageResolver): string {
  const width = 920, height = 270, left = 48, right = 14, top = 16, bottom = 34;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const seconds = Math.max(1, Math.ceil(timeline.duration_micros / 1_000_000));
  const hasRdps = plotted.some(({ actor, track }) => hasCompleteRdpsBuckets(actor.series.slice(0, track.series_point_count)));
  const metrics: TimelineMetric[] = ["damage", "effective_healing", "damage_taken", ...(hasRdps ? ["rdps_damage" as const] : [])];
  const windows = [1, 5, 10] as const;
  const groups = metrics.flatMap((metric) => windows.map((windowSeconds) => {
    const metricLabel = metric === "damage" ? messages.message("parse.timeline.metric.damage") : metric === "effective_healing" ? messages.message("parse.timeline.metric.healing") : metric === "damage_taken" ? messages.message("parse.timeline.metric.taken") : rdpsLabel;
    const curves = plotted.flatMap(({ actor, track, color }, participantIndex) => {
      const points = actor.series.slice(0, track.series_point_count);
      if (metric === "rdps_damage" && !hasCompleteRdpsBuckets(points)) return [];
      return [{ actor, track, color, participantIndex, points: rollingBucketSeries(points, metric, seconds, windowSeconds) }];
    });
    const max = Math.max(1, ...curves.flatMap(({ points }) => points.map(([, value]) => value)));
    const lines = curves.map(({ actor, color, participantIndex, points: samples }) => {
      const actorLabel = actor.display_name ?? messages.message("parse.timeline.player", { id: actor.actor_id });
      const coords = samples.map(([second, value]) => {
        const x = left + (second / seconds) * plotWidth;
        const y = top + plotHeight - (value / max) * plotHeight;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      });
      // The one-second curve is the authoritative inspection source. Rolling curves
      // keep only their SVG coordinates; their samples are derived and cached in the
      // browser instead of duplicating a potentially raid-sized payload three times.
      const values = windowSeconds === 1
        ? ` data-values="${samples.map(([second, value]) => `${second}:${value}`).join(",")}"`
        : "";
      const cumulativeComplete = metric !== "rdps_damage" || actor.rdps_incomplete === false;
      return `<polyline data-participant="${participantIndex}" data-label="${escapeHtml(actorLabel)}" data-cumulative-complete="${cumulativeComplete}"${values} points="${coords.join(" ")}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"><title>${escapeHtml(actorLabel)} ${escapeHtml(metricLabel)}</title></polyline>`;
    }).join("");
    const visible = metric === "damage" && windowSeconds === 5;
    return `<g data-series="${metric}" data-series-window="${windowSeconds}"${visible ? "" : " hidden"}>${lines}<text x="6" y="22" class="timeline-axis-label">${escapeHtml(metricLabel)}</text><text x="6" y="${top + plotHeight}" class="timeline-axis-label">0</text></g>`;
  })).join("");
  const deaths = timeline.death_markers.map((marker) => markerLine(marker.at_micros, timeline.duration_micros, left, plotWidth, top, plotHeight, "death", messages.message("parse.timeline.marker_at", { label: messages.message("parse.timeline.marker.death"), time: formatDuration(marker.at_micros) }))).join("");
  const loadouts = timeline.loadout_markers.map((marker) => markerLine(marker.at_micros, timeline.duration_micros, left, plotWidth, top, plotHeight, "loadout", messages.message("parse.timeline.marker_at", { label: messages.message("parse.timeline.marker.loadout"), time: formatDuration(marker.at_micros) }))).join("");
  const rdpsEvidence = timeline.rdps_influence_spans.filter((span) => span.time_basis === "run_elapsed").map((span) => {
    const start = left + Math.min(1, span.start_micros / Math.max(1, timeline.duration_micros)) * plotWidth;
    const end = left + Math.min(1, span.end_micros / Math.max(1, timeline.duration_micros)) * plotWidth;
    const title = messages.message("parse.timeline.evidence_span", {
      index: messages.number(span.influence_index + 1, { maximumFractionDigits: 0 }),
      start: formatDuration(span.start_micros), end: formatDuration(span.end_micros),
    });
    return `<rect class="timeline-rdps-evidence" x="${start.toFixed(1)}" y="${top + plotHeight - 6}" width="${Math.max(1.5, end - start).toFixed(1)}" height="6"><title>${escapeHtml(title)}</title></rect>`;
  }).join("");
  const rateClock = timeline.rate_clock_complete === true && timeline.rate_clock?.length
    ? timeline.rate_clock.map((point) => `${point.second}:${point.edps_elapsed_micros}:${point.adps_elapsed_micros}`).join(",") : "";
  return `<svg class="timeline-svg" viewBox="0 0 ${width} ${height}" role="group" aria-label="${escapeHtml(messages.message("parse.timeline.graph_aria", { duration: formatDuration(timeline.duration_micros) }))}" data-duration-seconds="${seconds}" data-plot-left="${left}" data-plot-width="${plotWidth}" data-series-complete="${timeline.omitted.series_points === 0}" data-rate-clock-complete="${rateClock ? "true" : "false"}"${rateClock ? ` data-rate-clock="${rateClock}"` : ""}>
    <line x1="${left}" y1="${top + plotHeight}" x2="${left + plotWidth}" y2="${top + plotHeight}" class="timeline-axis" />
    <text x="${left}" y="${height - 8}" class="timeline-tick">0:00</text><text x="${left + plotWidth}" y="${height - 8}" text-anchor="end" class="timeline-tick">${formatDuration(timeline.duration_micros)}</text>
    ${groups}${rdpsEvidence}${loadouts}${deaths}
    <g class="timeline-crosshair" data-timeline-crosshair hidden aria-hidden="true"><line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotHeight}" /></g>
    <rect class="timeline-inspector-hitbox" data-timeline-inspector x="${left}" y="${top}" width="${plotWidth}" height="${plotHeight}" tabindex="0" role="slider" aria-label="${escapeHtml(messages.message("parse.timeline.inspector_aria"))}" aria-valuemin="0" aria-valuemax="${seconds}" aria-valuenow="0" aria-valuetext="0:00" />
  </svg>`;
}

export function rollingBucketSeries(points: readonly PublicParticipant["series"][number][], metric: TimelineMetric, totalSeconds: number, windowSeconds: number): Array<[number, number]> {
  return rollingTimelineSamples(points.flatMap((point) => {
    const amount = point[metric];
    return amount == null ? [] : [[point.second, amount] as [number, number]];
  }), totalSeconds, windowSeconds);
}

export function rollingTimelineSamples(samples: readonly [number, number][], totalSeconds: number, windowSeconds: number): Array<[number, number]> {
  const duration = Math.max(1, Math.floor(totalSeconds));
  const window = Math.max(1, Math.floor(windowSeconds));
  const totals = new Map<number, number>();
  for (const [sampleSecond, amount] of samples) {
    if (sampleSecond > duration || amount === 0) continue;
    for (let second = sampleSecond; second <= Math.min(duration, sampleSecond + window - 1); second += 1) {
      totals.set(second, (totals.get(second) ?? 0) + amount);
    }
  }
  const values = [...totals].map(([second, total]) => [second, total / Math.min(window, second + 1)] as [number, number]);
  const nonzero = values.sort(([left], [right]) => left - right);
  const outputSamples: Array<[number, number]> = [[0, totals.get(0) ?? 0]];
  nonzero.forEach(([second, value], index) => {
    const prior = nonzero[index - 1];
    const next = nonzero[index + 1];
    if (second > 0 && (!prior || prior[0] + 1 < second) && outputSamples.at(-1)?.[0] !== second - 1) outputSamples.push([second - 1, 0]);
    if (second !== 0) outputSamples.push([second, value]);
    if (second < duration && (!next || next[0] > second + 1)) outputSamples.push([second + 1, 0]);
  });
  if (outputSamples.at(-1)?.[0] !== duration) outputSamples.push([duration, 0]);
  return outputSamples;
}

export function hasCompleteRdpsBuckets(points: readonly PublicParticipant["series"][number][]): boolean {
  return points.length > 0 && points.every((point) => point.rdps_damage !== undefined &&
    point.rdps_contribution_given !== undefined && point.rdps_contribution_received !== undefined);
}

export function timelineValueAtSecond(samples: readonly [number, number][], second: number): number {
  const exact = samples.find(([sampleSecond]) => sampleSecond === second);
  return exact?.[1] ?? 0;
}

export function timelineRateVariantsAtSecond(
  samples: { one: readonly [number, number][]; five: readonly [number, number][]; ten: readonly [number, number][] },
  second: number,
): { one: number; five: number; ten: number; cumulative: number } {
  const bounded = Math.max(0, Math.round(second));
  const cumulativeTotal = samples.one.reduce(
    (total, [sampleSecond, value]) => sampleSecond <= bounded ? total + value : total,
    0,
  );
  return {
    one: timelineValueAtSecond(samples.one, bounded),
    five: timelineValueAtSecond(samples.five, bounded),
    ten: timelineValueAtSecond(samples.ten, bounded),
    cumulative: cumulativeTotal / (bounded + 1),
  };
}

export function timelineDamageRatesAtSecond(
  oneSecondDamage: readonly [number, number][],
  rateClock: readonly PublicTimelineRateClockPoint[] | null,
  second: number,
): { edps: number; adps: number } | null {
  if (!rateClock?.length) return null;
  const bounded = Math.max(0, Math.round(second));
  const clock = rateClock[Math.min(bounded, rateClock.length - 1)];
  if (!clock || clock.edps_elapsed_micros <= 0 || clock.adps_elapsed_micros <= 0) return null;
  const damage = oneSecondDamage.reduce(
    (total, [sampleSecond, value]) => sampleSecond <= bounded ? total + value : total,
    0,
  );
  return {
    edps: damage * 1_000_000 / clock.edps_elapsed_micros,
    adps: damage * 1_000_000 / clock.adps_elapsed_micros,
  };
}

export function timelineRdpsAtSecond(
  oneSecondAdjustedDamage: readonly [number, number][],
  rateClock: readonly PublicTimelineRateClockPoint[] | null,
  second: number,
): number | null {
  if (!rateClock?.length) return null;
  const bounded = Math.max(0, Math.round(second));
  const clock = rateClock[Math.min(bounded, rateClock.length - 1)];
  if (!clock || clock.adps_elapsed_micros <= 0) return null;
  const adjustedDamage = oneSecondAdjustedDamage.reduce(
    (total, [sampleSecond, value]) => sampleSecond <= bounded ? total + value : total,
    0,
  );
  return adjustedDamage * 1_000_000 / clock.adps_elapsed_micros;
}

export interface TimelineCursorRateRow {
  variants: { one: number; five: number; ten: number; cumulative: number };
  damageRates: { edps: number; adps: number } | null;
  rdps: number | null;
}

export function timelineVisibleTotalAtSecond(
  rows: readonly TimelineCursorRateRow[],
  rdpsCoverageComplete = false,
): TimelineCursorRateRow | null {
  if (!rows.length) return null;
  const sum = (select: (row: TimelineCursorRateRow) => number) => rows.reduce((total, row) => total + select(row), 0);
  const damageRates = rows.every((row) => row.damageRates !== null)
    ? { edps: sum((row) => row.damageRates!.edps), adps: sum((row) => row.damageRates!.adps) }
    : null;
  const rdps = !rdpsCoverageComplete || rows.some((row) => row.rdps === null)
    ? null
    : sum((row) => row.rdps!);
  return {
    variants: {
      one: sum((row) => row.variants.one),
      five: sum((row) => row.variants.five),
      ten: sum((row) => row.variants.ten),
      cumulative: sum((row) => row.variants.cumulative),
    },
    damageRates,
    rdps,
  };
}

function markerLine(atMicros: number, durationMicros: number, left: number, width: number, top: number, height: number, kind: string, title: string): string {
  const x = left + Math.min(1, atMicros / Math.max(1, durationMicros)) * width;
  return `<line x1="${x.toFixed(1)}" y1="${top}" x2="${x.toFixed(1)}" y2="${top + height}" class="timeline-marker ${kind}"><title>${escapeHtml(title)}</title></line>`;
}

function wireTimelineControls(root: HTMLElement): void {
  root.querySelectorAll<HTMLButtonElement>("[data-metric]").forEach((button) => button.addEventListener("click", () => {
    const metric = button.dataset.metric;
    const timeline = button.closest<HTMLElement>("[data-timeline-metric]");
    if (!timeline || !metric) return;
    timeline.dataset.timelineMetric = metric;
    timeline.querySelectorAll<HTMLButtonElement>("[data-metric]").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    timeline.querySelectorAll<SVGGElement>("[data-series]").forEach((series) => {
      if (series.dataset.series === metric && series.dataset.seriesWindow === timeline.dataset.timelineWindow) series.removeAttribute("hidden");
      else series.setAttribute("hidden", "");
    });
    refreshTimelineInspection(timeline);
  }));
  root.querySelectorAll<HTMLButtonElement>("[data-window]").forEach((button) => button.addEventListener("click", () => {
    const window = button.dataset.window;
    const timeline = button.closest<HTMLElement>("[data-timeline-window]");
    if (!timeline || !window) return;
    timeline.dataset.timelineWindow = window;
    timeline.querySelectorAll<HTMLButtonElement>("[data-window]").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    timeline.querySelectorAll<SVGGElement>("[data-series]").forEach((series) => {
      if (series.dataset.series === timeline.dataset.timelineMetric && series.dataset.seriesWindow === window) series.removeAttribute("hidden");
      else series.setAttribute("hidden", "");
    });
    refreshTimelineInspection(timeline);
  }));
  root.querySelectorAll<HTMLButtonElement>("[data-participant-toggle]").forEach((button) => button.addEventListener("click", () => {
    const timeline = button.closest<HTMLElement>("[data-timeline-metric]");
    const participant = button.dataset.participantToggle;
    if (!timeline || participant == null) return;
    const visible = button.getAttribute("aria-pressed") !== "true";
    button.setAttribute("aria-pressed", String(visible));
    timeline.querySelectorAll<SVGPolylineElement>(`[data-participant="${participant}"]`).forEach((track) => {
      if (visible) track.removeAttribute("hidden");
      else track.setAttribute("hidden", "");
    });
    refreshTimelineInspection(timeline);
  }));
  root.querySelectorAll<SVGRectElement>("[data-timeline-inspector]").forEach((inspector) => {
    const timeline = inspector.closest<HTMLElement>("[data-timeline-metric]");
    if (!timeline) return;
    const messages = createMessageResolver(timeline.dataset.locale);
    const play = timeline.querySelector<HTMLButtonElement>("[data-timeline-play]");
    const scrubber = timeline.querySelector<HTMLInputElement>("[data-timeline-scrubber]");
    let playing = false;
    let playbackFrame: number | null = null;
    let playbackOriginMillis = 0;
    let playbackOriginSecond = 0;
    const stopPlayback = () => {
      playing = false;
      if (playbackFrame !== null) cancelAnimationFrame(playbackFrame);
      playbackFrame = null;
      if (play) {
        play.textContent = messages.message("parse.timeline.play");
        play.setAttribute("aria-pressed", "false");
      }
    };
    const tickPlayback = (now: number) => {
      if (!playing) return;
      if (!timeline.isConnected) {
        stopPlayback();
        return;
      }
      const duration = Number(inspector.getAttribute("aria-valuemax") ?? "0");
      const second = playbackOriginSecond + (now - playbackOriginMillis) / 1_000;
      const boundedSecond = Math.min(duration, Math.round(second));
      if (Number(inspector.getAttribute("aria-valuenow") ?? "-1") !== boundedSecond) {
        showTimelineInspection(timeline, boundedSecond);
      }
      if (second >= duration) {
        showTimelineInspection(timeline, duration);
        stopPlayback();
        return;
      }
      playbackFrame = requestAnimationFrame(tickPlayback);
    };
    const startPlayback = () => {
      if (playing || !play) return;
      const duration = Number(inspector.getAttribute("aria-valuemax") ?? "0");
      const current = Number(inspector.getAttribute("aria-valuenow") ?? "0");
      playbackOriginSecond = current >= duration ? 0 : current;
      playbackOriginMillis = performance.now();
      playing = true;
      play.textContent = messages.message("parse.timeline.pause");
      play.setAttribute("aria-pressed", "true");
      showTimelineInspection(timeline, playbackOriginSecond);
      playbackFrame = requestAnimationFrame(tickPlayback);
    };
    play?.addEventListener("click", () => playing ? stopPlayback() : startPlayback());
    scrubber?.addEventListener("input", () => {
      stopPlayback();
      showTimelineInspection(timeline, Number(scrubber.value));
    });
    inspector.addEventListener("pointermove", (event) => {
      stopPlayback();
      const svg = inspector.ownerSVGElement;
      if (!svg) return;
      const bounds = svg.getBoundingClientRect();
      const left = Number(svg.dataset.plotLeft), plotWidth = Number(svg.dataset.plotWidth);
      const viewBoxWidth = svg.viewBox.baseVal.width || bounds.width;
      const viewX = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * viewBoxWidth;
      const second = Math.round(((viewX - left) / Math.max(1, plotWidth)) * Number(svg.dataset.durationSeconds));
      showTimelineInspection(timeline, Math.max(0, Math.min(Number(svg.dataset.durationSeconds), second)));
    });
    inspector.addEventListener("focus", () => showTimelineInspection(timeline, Number(inspector.getAttribute("aria-valuenow") ?? "0")));
    inspector.addEventListener("keydown", (event) => {
      const duration = Number(inspector.getAttribute("aria-valuemax") ?? "0");
      const current = Number(inspector.getAttribute("aria-valuenow") ?? "0");
      const next = event.key === "ArrowLeft" || event.key === "ArrowDown" ? current - 1
        : event.key === "ArrowRight" || event.key === "ArrowUp" ? current + 1
        : event.key === "Home" ? 0 : event.key === "End" ? duration : undefined;
      if (next == null) return;
      event.preventDefault();
      stopPlayback();
      showTimelineInspection(timeline, Math.max(0, Math.min(duration, next)));
    });
  });
}

function refreshTimelineInspection(timeline: HTMLElement): void {
  const inspector = timeline.querySelector<SVGRectElement>("[data-timeline-inspector]");
  if (inspector && !timeline.querySelector<SVGGElement>("[data-timeline-crosshair]")?.hasAttribute("hidden")) {
    showTimelineInspection(timeline, Number(inspector.getAttribute("aria-valuenow") ?? "0"));
  }
}

function showTimelineInspection(timeline: HTMLElement, second: number): void {
  const messages = createMessageResolver(timeline.dataset.locale);
  const svg = timeline.querySelector<SVGSVGElement>(".timeline-svg");
  const inspector = svg?.querySelector<SVGRectElement>("[data-timeline-inspector]");
  const crosshair = svg?.querySelector<SVGGElement>("[data-timeline-crosshair]");
  const output = timeline.querySelector<HTMLElement>("[data-timeline-inspection]");
  if (!svg || !inspector || !crosshair || !output) return;
  const duration = Number(svg.dataset.durationSeconds), left = Number(svg.dataset.plotLeft), width = Number(svg.dataset.plotWidth);
  const bounded = Math.max(0, Math.min(duration, Math.round(second)));
  const x = left + (bounded / Math.max(1, duration)) * width;
  crosshair.removeAttribute("hidden");
  crosshair.querySelector("line")?.setAttribute("x1", x.toFixed(1));
  crosshair.querySelector("line")?.setAttribute("x2", x.toFixed(1));
  inspector.setAttribute("aria-valuenow", String(bounded));
  const scrubber = timeline.querySelector<HTMLInputElement>("[data-timeline-scrubber]");
  if (scrubber) scrubber.value = String(bounded);
  const active = [...svg.querySelectorAll<SVGPolylineElement>(`[data-series="${timeline.dataset.timelineMetric}"][data-series-window="${timeline.dataset.timelineWindow}"]:not([hidden]) polyline:not([hidden])`)].map((line) => ({
    participant: line.dataset.participant ?? "",
    label: line.dataset.label ?? "Player",
    color: line.getAttribute("stroke") ?? "currentColor",
    variants: timelineRateVariantsAtSecond({
      one: timelineSamplesFor(svg, timeline.dataset.timelineMetric ?? "damage", "1", line.dataset.participant ?? ""),
      five: timelineSamplesFor(svg, timeline.dataset.timelineMetric ?? "damage", "5", line.dataset.participant ?? ""),
      ten: timelineSamplesFor(svg, timeline.dataset.timelineMetric ?? "damage", "10", line.dataset.participant ?? ""),
    }, bounded),
    damageRates: timeline.dataset.timelineMetric === "damage" && svg.dataset.seriesComplete === "true" ? timelineDamageRatesAtSecond(
      timelineSamplesFor(svg, "damage", "1", line.dataset.participant ?? ""),
      timelineRateClockFor(svg),
      bounded,
    ) : null,
    rdps: timeline.dataset.timelineMetric === "rdps_damage" && svg.dataset.seriesComplete === "true" && line.dataset.cumulativeComplete === "true"
      ? timelineRdpsAtSecond(
        timelineSamplesFor(svg, "rdps_damage", "1", line.dataset.participant ?? ""),
        timelineRateClockFor(svg),
        bounded,
      ) : null,
  }));
  const metric = timeline.dataset.timelineMetric === "effective_healing" ? messages.message("parse.timeline.metric.healing")
    : timeline.dataset.timelineMetric === "damage_taken" ? messages.message("parse.timeline.metric.taken")
    : timeline.dataset.timelineMetric === "rdps_damage" ? timeline.dataset.timelineRdpsLabel ?? messages.message("parse.timeline.rdps.exact") : messages.message("parse.timeline.metric.damage");
  const time = formatDuration(bounded * 1_000_000);
  const cumulative = (row: TimelineCursorRateRow): string => row.damageRates
    ? messages.message("parse.timeline.inspection.edps_adps", { edps: messages.number(row.damageRates.edps, { maximumFractionDigits: 1 }), adps: messages.number(row.damageRates.adps, { maximumFractionDigits: 1 }) })
    : timeline.dataset.timelineMetric === "damage" ? messages.message("parse.timeline.inspection.rate_unavailable")
    : timeline.dataset.timelineMetric === "rdps_damage"
      ? row.rdps == null ? messages.message("parse.timeline.inspection.rdps_unavailable") : messages.message("parse.timeline.inspection.rdps", { rdps: messages.number(row.rdps, { maximumFractionDigits: 1 }) })
      : messages.message("parse.timeline.inspection.run_rate", { metric, value: messages.number(row.variants.cumulative, { maximumFractionDigits: 1 }) });
  const rateLine = (row: TimelineCursorRateRow): string => messages.message("parse.timeline.inspection.rates", {
    one: messages.number(row.variants.one, { maximumFractionDigits: 1 }),
    five: messages.number(row.variants.five, { maximumFractionDigits: 1 }),
    ten: messages.number(row.variants.ten, { maximumFractionDigits: 1 }),
    cumulative: cumulative(row),
  });
  const allRdpsTracksExact = Number(timeline.dataset.timelineExactRdpsTrackCount) === Number(timeline.dataset.timelineParticipantCount);
  const visibleTotal = timelineVisibleTotalAtSecond(active, timeline.dataset.timelineMetric === "rdps_damage" && allRdpsTracksExact);
  const total = visibleTotal && active.length > 1
    ? `<span class="timeline-inspection-total">${escapeHtml(messages.message("parse.timeline.inspection.visible_total"))} <strong>${escapeHtml(rateLine(visibleTotal))}</strong></span>`
    : "";
  const details = active.length ? `${total}${active.map((row) => `<span><i style="--track:${row.color}"></i>${escapeHtml(row.label)} <strong>${escapeHtml(rateLine(row))}</strong></span>`).join("")}` : `<span>${escapeHtml(messages.message("parse.timeline.inspection.none"))}</span>`;
  output.innerHTML = `<strong>${time}</strong>${details}`;
  const totalAria = visibleTotal && active.length > 1 ? `${messages.message("parse.timeline.inspection.visible_total")}: ${rateLine(visibleTotal)}; ` : "";
  inspector.setAttribute("aria-valuetext", `${time}; ${totalAria}${active.map((row) => `${row.label}: ${rateLine(row)}`).join("; ") || messages.message("parse.timeline.inspection.none")}`);
}

export function timelineCumulativeRateLabel(metric: string): string {
  return `run ${metric}`;
}

const timelineSampleCache = new WeakMap<SVGSVGElement, Map<string, Array<[number, number]>>>();
const timelineRateClockCache = new WeakMap<SVGSVGElement, PublicTimelineRateClockPoint[] | null>();

function timelineRateClockFor(svg: SVGSVGElement): PublicTimelineRateClockPoint[] | null {
  if (timelineRateClockCache.has(svg)) return timelineRateClockCache.get(svg) ?? null;
  const clock = svg.dataset.rateClockComplete === "true" && svg.dataset.rateClock
    ? svg.dataset.rateClock.split(",").flatMap((entry) => {
      const [second, edps_elapsed_micros, adps_elapsed_micros] = entry.split(":").map(Number);
      return Number.isSafeInteger(second) && Number.isSafeInteger(edps_elapsed_micros) && Number.isSafeInteger(adps_elapsed_micros)
        ? [{ second, edps_elapsed_micros, adps_elapsed_micros }] : [];
    }) : null;
  timelineRateClockCache.set(svg, clock?.length ? clock : null);
  return clock?.length ? clock : null;
}

function timelineSamplesFor(svg: SVGSVGElement, metric: string, window: string, participant: string): Array<[number, number]> {
  let cache = timelineSampleCache.get(svg);
  if (!cache) {
    cache = new Map();
    timelineSampleCache.set(svg, cache);
  }
  const key = `${metric}:${window}:${participant}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const sourceKey = `${metric}:1:${participant}`;
  let oneSecond = cache.get(sourceKey);
  if (!oneSecond) {
    const source = svg.querySelector<SVGPolylineElement>(`[data-series="${metric}"][data-series-window="1"] [data-participant="${participant}"]`);
    oneSecond = parseTimelineValues(source?.dataset.values ?? "");
    cache.set(sourceKey, oneSecond);
  }
  const samples = window === "1" ? oneSecond : rollingTimelineSamples(
    oneSecond,
    Number(svg.dataset.durationSeconds),
    Number(window),
  );
  cache.set(key, samples);
  return samples;
}

function parseTimelineValues(value: string): Array<[number, number]> {
  return value ? value.split(",").flatMap((entry) => {
    const [second, amount] = entry.split(":").map(Number);
    return Number.isFinite(second) && Number.isFinite(amount) ? [[second, amount] as [number, number]] : [];
  }) : [];
}

function renderParticipant(actor: PublicRun["participants"][number], rdpsStatus: string, messages: MessageResolver): string {
  const rdpsLabel = messages.message(rdpsStatus.startsWith("partial_") || actor.rdps_incomplete === true ? "parse.timeline.rdps.partial" : "parse.timeline.rdps.exact");
  const actorName = actor.display_name ?? messages.message("parse.timeline.player", { id: actor.actor_id });
  const className = [actor.class_name, actor.specialization_name].filter(Boolean).join(" / ") || messages.message("parse.report.class_unresolved");
  return `<div class="parse-party-row"><span><strong>${escapeHtml(actorName)}</strong>
    <small>${escapeHtml(className)}</small></span>
    <span><small>${escapeHtml(messages.message("parse.report.participant.damage"))}</small><strong>${formatNumber(actor.damage, messages)}</strong></span>
    <span><small>${escapeHtml(messages.message("parse.report.participant.edps"))}</small><strong>${formatNumber(actor.dps, messages)}</strong></span>
    <span><small>${escapeHtml(messages.message("parse.report.participant.adps"))}</small><strong>${formatNumber(actor.encounter_dps, messages)}</strong></span>
    <span><small>${escapeHtml(rdpsLabel)}</small><strong>${actor.rdps == null ? "-" : formatNumber(actor.rdps, messages)}</strong></span>
    <span><small>${escapeHtml(messages.message("parse.report.participant.deaths"))}</small><strong>${messages.number(actor.deaths, { maximumFractionDigits: 0 })}</strong></span></div>`;
}

function metric(name: string, value: string): string {
  return `<span><small>${escapeHtml(name)}</small><strong>${escapeHtml(value)}</strong></span>`;
}

function populateSelect(select: HTMLSelectElement, options: Array<[string, string]>): void {
  select.insertAdjacentHTML(
    "beforeend",
    options.map(([value, text]) => `<option value="${escapeHtml(value)}">${escapeHtml(text)}</option>`).join(""),
  );
}

function renderLoadMore(catalog: PublicParseCatalog): string {
  return catalog.next_offset == null
    ? ""
    : `<button class="button secondary parse-load-more" type="button" data-load-more>Load more (${catalog.entries.length} of ${catalog.total_entries})</button>`;
}

function catalogQuery(controls: ParseControls, offset = 0): string {
  const params = new URLSearchParams();
  if (controls.region.value) params.set("region", controls.region.value);
  if (controls.activity.value) params.set("activity", controls.activity.value);
  if (controls.scene.value) params.set("scene", controls.scene.value);
  if (controls.difficulty.value) params.set("difficulty", controls.difficulty.value);
  if (offset) params.set("offset", String(offset));
  const value = params.toString();
  return value ? `&${value}` : "";
}

function filterDemoCatalog(catalog: PublicParseCatalog, controls: ParseControls): PublicParseCatalog {
  const entries = catalog.entries.filter(
    (entry) =>
      (!controls.region.value || controls.region.value === entry.region_id) &&
      (!controls.activity.value || controls.activity.value === entry.activity_id) &&
      (!controls.scene.value || Number(controls.scene.value) === entry.scene_id) &&
      (!controls.difficulty.value || controls.difficulty.value === entry.difficulty_family),
  );
  return { ...catalog, entries, total_entries: entries.length, next_offset: undefined };
}

function formatDifficulty(run: PublicRun, messages = createMessageResolver()): string {
  return (
    [title(run.difficulty_family), run.difficulty_tier ? ` ${run.difficulty_tier}` : ""].join("").trim() ||
    messages.message("parse.report.difficulty_unresolved")
  );
}

function formatDuration(micros: number | null | undefined): string {
  if (micros == null) return "-";
  const seconds = micros / 1_000_000;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(3).padStart(6, "0")}`;
}

function formatNumber(value: number, messages = createMessageResolver()): string {
  return messages.number(value, { maximumFractionDigits: 1 });
}

function title(value: string | null | undefined): string {
  return value ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "";
}

function label(value: string, count: number): string {
  return `${title(value)} (${count})`;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "The parse catalog could not be loaded.";
}

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing parse browser element ${selector}`);
  return element;
}
