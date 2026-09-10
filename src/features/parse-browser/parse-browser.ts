import {
  isPublicParseCatalog,
  isPublicParseReport,
  isPublicRunReconciliation,
  type PublicParseCatalog,
  type PublicParseCatalogEntry,
  type PublicParseReport,
  type PublicParticipant,
  type PublicCombatLoadoutPhase,
  type PublicRdpsEffectPresentation,
  type PublicRdpsInfluence,
  type PublicReconciledParticipant,
  type PublicRunReconciliation,
  type PublicRun,
  type PublicTimelineRateClockPoint,
  validateReportId,
  validateRunGroupId,
} from "../../contracts/public-parse";
import { createParseDetailModal } from "./parse-detail-modal";
import {
  loadParsePresentation,
  localizedActionName,
  localizedEffectName,
  presentationForReport,
  type ParsePresentationCatalog,
} from "./parse-presentation";
import { fetchPublicRead } from "../../public-api";
import { createMessageResolver, type MessageResolver } from "../../localization/messages";

const baseUrl = import.meta.env.BASE_URL;
const configuredApi = String(import.meta.env.VITE_RLOGS_API_BASE_URL ?? "").replace(/\/$/, "");
const activityCategories = [
  ["dungeons", "Dungeons"],
  ["solo-content", "Solo Content"],
  ["raids", "Raids"],
  ["gauntlets", "Gauntlets"],
  ["stimens", "Stimens"],
] as const;

interface ParseControls {
  search: HTMLInputElement;
  region: HTMLSelectElement;
  activity: HTMLSelectElement;
  scene: HTMLSelectElement;
  difficulty: HTMLSelectElement;
  terminal: HTMLSelectElement;
}

export async function mountParseBrowser(): Promise<void> {
  const root = document.querySelector<HTMLElement>("#parse-browser");
  if (!root) return;

  const status = required<HTMLElement>("#parse-status");
  const list = required<HTMLElement>("#parse-list");
  const detailHost = required<HTMLElement>("#parse-detail");
  document.querySelector("#parse-skill-detail")?.remove();
  const skillDetailHost = document.createElement("div");
  skillDetailHost.id = "parse-skill-detail";
  document.body.append(skillDetailHost);
  const skillDetail = createParseDetailModal(skillDetailHost, () => undefined, {
    ariaLabel: "Other skill details",
    closeAriaLabel: "Close other skill details",
    bodyClass: "parse-skill-modal-open",
    hostClass: "parse-skill-detail-modal",
    panelClass: "parse-skill-detail-modal-panel",
  });
  bindOtherSkillDetails(detailHost, skillDetail);
  const refreshReportInteractions = bindParseReportInteractions(detailHost);
  const detail = createParseDetailModal(detailHost, () => {
    skillDetail.close();
    const url = new URL(location.href);
    url.searchParams.delete("parse");
    url.searchParams.delete("run");
    if (url.hash === "#parse") url.hash = "";
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  });
  const presentationRequest = loadParsePresentation().catch(() => undefined);
  const controls: ParseControls = {
    search: required<HTMLInputElement>("#parse-search"),
    region: required<HTMLSelectElement>("#parse-region"),
    activity: required<HTMLSelectElement>("#parse-activity"),
    scene: required<HTMLSelectElement>("#parse-scene"),
    difficulty: required<HTMLSelectElement>("#parse-difficulty"),
    terminal: required<HTMLSelectElement>("#parse-terminal"),
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
  populateSelect(
    controls.activity,
    activityCategories.map(([id, name]) => [
      id,
      label(name, catalog.facets.activities.find((item) => item.id === id)?.count ?? 0),
    ]),
  );
  populateSelect(
    controls.scene,
    catalog.facets.scenes.map((item) => [String(item.id), label(item.label ?? `Scene ${item.id}`, item.count)]),
  );
  populateSelect(
    controls.difficulty,
    catalog.facets.difficulties.map((item) => [item.id, label(item.id, item.count)]),
  );
  populateSelect(
    controls.terminal,
    catalog.facets.terminal_states.map((item) => [item.id, label(item.id, item.count)]),
  );

  const renderList = (): void => {
    const visibleEntries = filterSearch(catalog.entries, controls.search.value);
    list.innerHTML = visibleEntries.length
      ? `${visibleEntries.map(renderCatalogEntry).join("")}${renderLoadMore(catalog)}`
      : '<p class="empty-state">No submitted parses match your search and filters.</p>';
    status.textContent = `${visibleEntries.length.toLocaleString()} shown · ${catalog.total_entries.toLocaleString()} matched`;
    list.querySelectorAll<HTMLButtonElement>("[data-report-id]").forEach((button) => {
      button.addEventListener("click", () =>
        void openReport(button.dataset.reportId ?? "", Number(button.dataset.runIndex ?? "0")),
      );
    });
    list.querySelector<HTMLButtonElement>("[data-load-more]")?.addEventListener("click", () => void loadMore());
  };

  [controls.region, controls.activity, controls.scene, controls.difficulty, controls.terminal].forEach((control) =>
    control.addEventListener("change", () => void refreshFilteredCatalog()),
  );
  controls.search.addEventListener("input", renderList);
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
    detail.show('<p class="empty-state">Loading server-verified parse&hellip;</p>');
    try {
      const [report, presentation] = await Promise.all([
        fetchReport(reportId),
        presentationRequest,
      ]);
      const run = report.runs.find((candidate) => candidate.run_index === runIndex) ?? report.runs[0];
      let reconciliation: PublicRunReconciliation | null = null;
      let reconciliationError: string | null = null;
      if (configuredApi && run?.run_group_id && validateRunGroupId(run.run_group_id)) {
        try {
          reconciliation = await fetchReconciliation(run.run_group_id);
        } catch (error) {
          reconciliationError = message(error);
        }
      }
      detail.show(renderReport(report, runIndex, reconciliation, reconciliationError, presentation));
      refreshReportInteractions();
      history.replaceState(
        null,
        "",
        `${location.pathname}?parse=${encodeURIComponent(reportId)}&run=${runIndex}#parse`,
      );
    } catch (error) {
      detail.show(`<p class="empty-state">${escapeHtml(message(error))}</p>`);
    }
  }
}

export function bindOtherSkillDetails(
  root: HTMLElement,
  modal: Pick<ReturnType<typeof createParseDetailModal>, "show">,
): void {
  root.addEventListener("click", (event) => {
    const html = otherSkillDetailsHtml(root, event.target);
    if (!html) return;
    event.preventDefault();
    event.stopPropagation();
    modal.show(html);
  });
}

export function bindParseReportInteractions(root: HTMLElement): () => void {
  root.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;

    const timelineToggle = event.target.closest<HTMLButtonElement>("[data-timeline-toggle]");
    if (timelineToggle && root.contains(timelineToggle)) {
      const actorId = timelineToggle.dataset.timelineToggle;
      if (!actorId) return;
      const shown = timelineToggle.getAttribute("aria-pressed") !== "false";
      timelineToggle.setAttribute("aria-pressed", String(!shown));
      timelineToggle.closest(".parse-timeline-panel")
        ?.querySelectorAll<SVGElement>("[data-timeline-actor]")
        .forEach((element) => {
          if (element.dataset.timelineActor === actorId) element.classList.toggle("is-hidden", shown);
        });
      return;
    }

    const sortButton = event.target.closest<HTMLButtonElement>("[data-party-sort]");
    if (!sortButton || !root.contains(sortButton)) return;
    const table = sortButton.closest<HTMLElement>("[data-parse-party-table]");
    const rows = table?.querySelector<HTMLElement>("[data-party-rows]");
    const metric = sortButton.dataset.partySort as PartySortMetric | undefined;
    if (!table || !rows || !metric || !partySortMetrics.includes(metric)) return;
    const currentlyActive = sortButton.getAttribute("aria-sort");
    const direction = currentlyActive === "descending" ? "ascending" : "descending";
    const multiplier = direction === "ascending" ? 1 : -1;
    const sorted = [...rows.querySelectorAll<HTMLElement>("[data-party-row]")]
      .sort((left, right) => {
        const leftValue = Number(left.dataset[partyMetricDatasetKey(metric)] ?? "-1");
        const rightValue = Number(right.dataset[partyMetricDatasetKey(metric)] ?? "-1");
        return (leftValue - rightValue) * multiplier;
      });
    const maximum = Math.max(0, ...sorted.map((row) => Number(row.dataset[partyMetricDatasetKey(metric)] ?? "-1")));
    sorted.forEach((row) => {
      const value = Number(row.dataset[partyMetricDatasetKey(metric)] ?? "-1");
      const width = value < 0 || maximum <= 0 ? 0 : Math.max(0, value / maximum) * 100;
      row.style.setProperty("--row-fill", `${width.toFixed(2)}%`);
    });
    sorted.forEach((row) => rows.append(row));
    table.querySelectorAll<HTMLButtonElement>("[data-party-sort]").forEach((button) => {
      button.setAttribute("aria-sort", button === sortButton ? direction : "none");
    });
    table.dataset.partySort = metric;
    table.dataset.partySortDirection = direction;
  });
  return () => wireTimelineControls(root);
}

interface ClosestQueryTarget {
  closest(selector: string): ClosestQueryTarget | null;
  querySelector?(selector: string): { innerHTML?: string } | null;
}

export function otherSkillDetailsHtml(
  root: { contains(node: unknown): boolean },
  target: unknown,
): string | null {
  if (
    typeof target !== "object" ||
    target === null ||
    !("closest" in target) ||
    typeof target.closest !== "function"
  ) return null;
  const button = (target as ClosestQueryTarget).closest("[data-skill-other-trigger]");
  if (!button || !root.contains(button)) return null;
  const row = button.closest(".parse-skill-other-row");
  const template = row?.querySelector?.("template[data-skill-other-content]");
  return template?.innerHTML?.trim() || null;
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

async function fetchReconciliation(runGroupId: string): Promise<PublicRunReconciliation> {
  if (!validateRunGroupId(runGroupId)) throw new Error("The run group identifier is invalid.");
  return fetchTyped(
    `${configuredApi}/v1/run-groups/${encodeURIComponent(runGroupId)}/reconciliation`,
    isPublicRunReconciliation,
  );
}

async function fetchTyped<T>(url: string, guard: (value: unknown) => value is T): Promise<T> {
  const response = await fetchPublicRead(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Request failed (${response.status}).`);
  const value: unknown = await response.json();
  if (!guard(value)) throw new Error("The server returned an unsupported parse contract.");
  return value;
}

export function renderCatalogEntry(entry: PublicParseCatalogEntry): string {
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

export function renderReport(
  report: PublicParseReport,
  runIndex: number,
  reconciliation: PublicRunReconciliation | null = null,
  reconciliationErrorOrMessages: string | MessageResolver | null = null,
  presentation?: ParsePresentationCatalog,
  messages = createMessageResolver(),
): string {
  const reconciliationError = typeof reconciliationErrorOrMessages === "string"
    ? reconciliationErrorOrMessages
    : null;
  if (reconciliationErrorOrMessages && typeof reconciliationErrorOrMessages !== "string") {
    messages = reconciliationErrorOrMessages;
  }
  const run = report.runs.find((candidate) => candidate.run_index === runIndex) ?? report.runs[0];
  if (!run) return `<p class="empty-state">${escapeHtml(messages.message("parse.report.empty"))}</p>`;
  const reportPresentation = presentationForReport(
    presentation,
    report.deployment_id,
    report.client_build,
  );
  const graph = selectCanonicalGraph(run, reconciliation ?? undefined);
  const teamDps = run.participants.reduce((sum, actor) => sum + actor.dps, 0);
  const teamEdps = run.participants.reduce((sum, actor) => sum + actor.encounter_dps, 0);
  const reconciled = Boolean(
    reconciliation?.status === "reconciled" &&
      reconciliation.attribution_replay_completed &&
      reconciliation.conservation?.conserved &&
      reconciliation.reconciled_participants.length,
  );
  const participants = reconciled ? reconciliation!.reconciled_participants : run.participants;
  const skillInfluences = reconciled
    ? (reconciliation?.rdps_influences ?? [])
    : (run.rdps_influences ?? []);
  const skillEffects = reconciled
    ? (reconciliation?.rdps_effects ?? [])
    : (run.rdps_effects ?? []);
  const teamRdps = reconciled
    ? (run.game_time_micros == null ? null : damageRate(reconciliation!.conservation!.rdps_damage, run.game_time_micros))
    : null;
  const eventCount = messages.number(report.verification.event_count, { maximumFractionDigits: 0 });
  const gapCount = messages.number(run.data_gap_count, { maximumFractionDigits: 0 });
  const proof = messages.message("parse.report.proof", {
    build: report.client_build,
    events: messages.message(report.verification.event_count === 1 ? "parse.report.proof.events.one" : "parse.report.proof.events.other", { count: eventCount }),
    gaps: messages.message(run.data_gap_count === 1 ? "parse.report.proof.gaps.one" : "parse.report.proof.gaps.other", { count: gapCount }),
    report: report.report_id,
  });
  return `<article class="parse-report">
    <div class="parse-report-heading"><div><p class="eyebrow">${escapeHtml(report.region_id)} / ${escapeHtml(report.verification.tier)}</p>
      <h3>${escapeHtml(run.scene_name ?? run.activity_id ?? `Scene ${run.scene_id ?? "?"}`)}</h3>
      <p>${escapeHtml(formatDifficulty(run))} / ${escapeHtml(title(run.terminal_state))}</p></div>
      ${renderReplayStatus(reconciliation, reconciled, messages)}</div>
    <div class="parse-run-identity" aria-label="Run identifiers">
      <span><small>Run ID</small><code>${escapeHtml(run.run_group_id ?? `${report.report_id}:${run.run_index}`)}</code></span>
      <span><small>Report ID</small><code>${escapeHtml(report.report_id)}</code></span>
    </div>
    <div class="parse-metrics">
      ${metric(messages.message("parse.report.metric.run"), formatDuration(run.total_run_time_micros))}
      ${metric(messages.message("parse.report.metric.game"), formatDuration(run.game_time_micros))}
      ${metric(messages.message("parse.report.metric.active"), formatDuration(run.active_combat_micros))}
      ${metric(messages.message("parse.report.metric.team_edps"), formatNumber(teamDps, messages))}
      ${metric(messages.message("parse.report.metric.team_adps"), formatNumber(teamEdps, messages))}
      ${reconciled ? metric("Team rDPS", teamRdps == null ? "Unavailable" : formatNumber(teamRdps, messages)) : ""}
      ${metric(messages.message("parse.report.metric.retries"), messages.message(run.boss_retry_count === 1 ? "parse.report.retry_summary.one" : "parse.report.retry_summary.other", { retries: run.retry_count, boss: run.boss_retry_count }))}
    </div>
    ${renderReconciliationProof(reconciliation, reconciliationError, reconciled)}
    ${renderSwiftVortexCandidateAudit(reconciliation)}
    ${renderPartyTable(participants, run.game_time_micros, reconciled, run.rdps_status, messages)}
    ${renderPartyLoadouts(run, graph.participants, reconciliation ?? undefined, messages)}
    ${renderCombatLoadoutPhases(run, participants, reportPresentation)}
    ${graph.timeline ? renderTimeline(graph, messages) : renderRunTimeline(run, participants)}
    ${renderSkillContributions(participants, skillInfluences, skillEffects, reportPresentation)}
    ${renderRdpsCalculations(run, reconciliation, participants, reconciled, reportPresentation)}
    ${renderEvidenceCoverage(report, run, reconciliation, participants, reconciled)}
    <p class="parse-proof">${escapeHtml(run.run_group_id ? messages.message("parse.report.proof_group", { proof, group: run.run_group_id }) : proof)}</p>
  </article>`;
}

const partySortMetrics = [
  "adps", "edps", "damage", "rdps", "rdmg", "given", "received", "hps", "healing",
  "effectiveHealing", "tps", "damageTaken", "shielding", "casts", "hits", "critRate", "deaths",
] as const;
type PartySortMetric = (typeof partySortMetrics)[number];

const partyMetricLabels: Record<PartySortMetric, string> = {
  adps: "aDPS",
  edps: "eDPS",
  damage: "Damage",
  rdps: "rDPS",
  rdmg: "rDMG",
  given: "Given",
  received: "Received",
  hps: "HPS",
  healing: "Healing",
  effectiveHealing: "Effective healing",
  tps: "TPS",
  damageTaken: "Damage taken",
  shielding: "Shielding",
  casts: "Casts",
  hits: "Hits",
  critRate: "Crit %",
  deaths: "Deaths",
};

function partyMetricDatasetKey(metric: PartySortMetric): string {
  return `sort${metric[0]!.toUpperCase()}${metric.slice(1)}`;
}

function partyMetricValue(
  actor: AnalysisParticipant,
  metric: PartySortMetric,
  gameTimeMicros: number | null,
): number | null {
  const abilities = actor.abilities ?? [];
  switch (metric) {
    case "adps": return actor.encounter_dps;
    case "edps": return actor.dps;
    case "damage": return actor.damage;
    case "rdps": return "rdps_damage" in actor
      ? (actor.rdps_damage == null || gameTimeMicros == null ? null : damageRate(actor.rdps_damage, gameTimeMicros))
      : actor.rdps;
    case "rdmg": return "rdps_damage" in actor ? actor.rdps_damage : null;
    case "given": return "contribution_given" in actor ? actor.contribution_given : null;
    case "received": return "contribution_received" in actor ? actor.contribution_received : null;
    case "hps": return actor.hps;
    case "healing": return abilities.reduce((sum, ability) => sum + ability.healing, 0);
    case "effectiveHealing": return abilities.reduce((sum, ability) => sum + ability.effective_healing, 0);
    case "tps": return actor.tps;
    case "damageTaken": return (actor.series ?? []).reduce((sum, point) => sum + point.damage_taken, 0);
    case "shielding": return abilities.reduce((sum, ability) => sum + ability.shielding, 0);
    case "casts": return abilities.reduce((sum, ability) => sum + ability.casts, 0);
    case "hits": return abilities.reduce((sum, ability) => sum + ability.hits, 0);
    case "critRate": {
      const hits = abilities.reduce((sum, ability) => sum + ability.hits, 0);
      const criticalHits = abilities.reduce((sum, ability) => sum + ability.critical_hits, 0);
      return hits > 0 ? criticalHits / hits : null;
    }
    case "deaths": return actor.deaths;
  }
}

function localizedPartyMetricLabel(metric: PartySortMetric, messages: MessageResolver): string {
  if (metric === "adps") return messages.message("parse.report.participant.adps");
  if (metric === "edps") return messages.message("parse.report.participant.edps");
  if (metric === "damage") return messages.message("parse.report.participant.damage");
  if (metric === "deaths") return messages.message("parse.report.participant.deaths");
  return partyMetricLabels[metric];
}

function formatPartyMetric(metric: PartySortMetric, value: number, messages: MessageResolver): string {
  return metric === "critRate" ? `${formatNumber(value * 100, messages)}%` : formatNumber(value, messages);
}

export function sortPartyParticipants<T extends AnalysisParticipant>(
  participants: T[],
  metric: PartySortMetric = "adps",
  direction: "ascending" | "descending" = "descending",
  gameTimeMicros: number | null = 0,
): T[] {
  const multiplier = direction === "ascending" ? 1 : -1;
  return [...participants].sort((left, right) => {
    const leftValue = partyMetricValue(left, metric, gameTimeMicros) ?? -1;
    const rightValue = partyMetricValue(right, metric, gameTimeMicros) ?? -1;
    return (leftValue - rightValue) * multiplier;
  });
}

function renderPartyTable(
  participants: AnalysisParticipant[],
  gameTimeMicros: number | null,
  reconciled: boolean,
  rdpsStatus: string,
  messages: MessageResolver,
): string {
  const ordered = sortPartyParticipants(participants, "adps", "descending", gameTimeMicros);
  const initialMaximum = Math.max(0, ...ordered.map((actor) => partyMetricValue(actor, "adps", gameTimeMicros) ?? 0));
  const headers = partySortMetrics.map((metric) => `<button type="button" data-party-sort="${metric}" aria-sort="${metric === "adps" ? "descending" : "none"}">${escapeHtml(localizedPartyMetricLabel(metric, messages))}</button>`).join("");
  const rows = ordered.map((actor, index) => {
    const color = chartColors[index % chartColors.length];
    const data = partySortMetrics.map((metric) => `data-${partyMetricDatasetKey(metric).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}="${partyMetricValue(actor, metric, gameTimeMicros) ?? -1}"`).join(" ");
    const cells = partySortMetrics.map((metric) => {
      const value = partyMetricValue(actor, metric, gameTimeMicros);
      const incomplete = metric === "rdps" && "rdps_incomplete" in actor && actor.rdps_incomplete ? "*" : "";
      return `<span class="parse-party-metric"><strong>${value == null ? "—" : formatPartyMetric(metric, value, messages)}${incomplete}</strong></span>`;
    }).join("");
    const initialValue = partyMetricValue(actor, "adps", gameTimeMicros);
    const initialWidth = initialValue == null || initialMaximum <= 0 ? 0 : Math.max(0, initialValue / initialMaximum) * 100;
    return `<div class="parse-party-row" data-party-row ${data} style="--series-color:${color};--row-fill:${initialWidth.toFixed(2)}%"><span class="parse-party-player"><i></i><span><strong>${escapeHtml(participantName(actor))}</strong><small>${escapeHtml([actor.class_name, actor.specialization_name].filter(Boolean).join(" / "))}</small></span></span>${cells}</div>`;
  }).join("");
  return `<section class="parse-party" data-parse-party-table data-party-sort="adps" data-party-sort-direction="descending">
    <div class="parse-party-head"><span><strong>${escapeHtml(messages.message("parse.report.party.title"))}</strong><small>${escapeHtml(messages.message(participants.length === 1 ? "parse.report.party.summary.one" : "parse.report.party.summary.other", { count: messages.number(participants.length, { maximumFractionDigits: 0 }), status: `${rdpsStatus}${reconciled ? " · reconciled" : ""}` }))}</small></span><small>Choose a metric to sort and scale the row bars</small></div>
    <div class="parse-party-columns"><span>Player</span>${headers}</div>
    <div data-party-rows>${rows}</div>
  </section>`;
}

function renderReplayStatus(
  reconciliation: PublicRunReconciliation | null,
  reconciled: boolean,
  messages: MessageResolver,
): string {
  if (reconciled) return '<span class="status-chip success">Cross-vantage reconciled</span>';
  if (reconciliation && reconciliation.reports.length > 1) {
    return '<span class="status-chip neutral">Cross-vantage pending</span>';
  }
  return `<span class="status-chip success">${escapeHtml(messages.message("parse.report.server_replayed"))}</span>`;
}

function renderReconciliationProof(
  reconciliation: PublicRunReconciliation | null,
  reconciliationError: string | null,
  reconciled: boolean,
): string {
  if (reconciliationError) {
    return `<div class="reconciliation-proof pending"><strong>Cross-vantage evidence unavailable</strong><span>${escapeHtml(reconciliationError)} The representative server replay is shown.</span></div>`;
  }
  if (!reconciliation || reconciliation.reports.length <= 1) return "";
  if (reconciled) {
    const proof = reconciliation.conservation!;
    return `<div class="reconciliation-proof valid"><strong>Conserved cross-vantage replay</strong><span>${reconciliation.reports.length} reports / ${reconciliation.local_vantage_character_count} local character witnesses / given ${formatNumber(proof.contribution_given)} = received ${formatNumber(proof.contribution_received)} / party damage ${formatNumber(proof.raw_damage)} = rDMG ${formatNumber(proof.rdps_damage)}.</span></div>`;
  }
  const blockers = reconciliation.state_replay_blockers.length
    ? reconciliation.state_replay_blockers.map(title).join(", ")
    : title(reconciliation.state_replay_readiness);
  return `<div class="reconciliation-proof pending"><strong>Cross-vantage replay pending</strong><span>${reconciliation.reports.length} reports / ${reconciliation.local_vantage_character_count} local character witnesses. ${escapeHtml(blockers)}. The representative replay is shown without combining damage.</span></div>`;
}

function renderSwiftVortexCandidateAudit(reconciliation: PublicRunReconciliation | null): string {
  const audit = reconciliation?.swift_vortex_candidate_audit;
  if (!audit) return "";

  const magnitude = audit.magnitude_consensus
    ? `Consensus: Haste ${formatNumber(audit.magnitude_consensus.haste_basis_points)} bp, normal action speed ${formatNumber(audit.magnitude_consensus.normal_action_speed_basis_points)} bp, guide action speed ${formatNumber(audit.magnitude_consensus.guide_action_speed_basis_points)} bp.`
    : "No exact magnitude consensus yet.";
  const blockerSummary = Object.entries(audit.blockers)
    .filter(([, count]) => count > 0)
    .map(([blocker, count]) => `${title(blocker)} (${count})`)
    .join(", ");
  const gate = audit.magnitude_gate_satisfied
    ? "The magnitude review gate is satisfied."
    : "The magnitude review gate is not yet satisfied.";
  const blockers = blockerSummary ? ` Blockers: ${blockerSummary}.` : "";

  return `<div class="reconciliation-proof pending"><strong>Swift Vortex candidate evidence</strong><span>${audit.candidate_status_event_count} status events / ${audit.exact_paired_receipt_count} exact paired receipts / ${audit.distinct_provider_entity_count} providers / ${audit.distinct_recipient_entity_count} recipients. ${escapeHtml(magnitude)} ${escapeHtml(gate)} Production attribution remains disabled.${escapeHtml(blockers)}</span></div>`;
}

function renderCombatLoadoutPhases(
  run: PublicRun,
  participants: AnalysisParticipant[],
  presentation?: ParsePresentationCatalog,
): string {
  const phases = run.combat_loadout_phases ?? [];
  if (!phases.length) {
    return analysisPanel(
      "Combat loadouts",
      "No post-combat-start profile snapshot was observed, so rLogs will not substitute a lobby or newer profile into this parse.",
    );
  }
  const namesByCharacter = new Map(participants.flatMap((actor) =>
    actor.character_id ? [[actor.character_id, participantName(actor)] as const] : []));
  const cards = phases.map((phase, index) => {
    const identity = [phase.class_name, phase.specialization_name].filter(Boolean).join(" / ") || "Class/spec not present in this snapshot";
    const location = phase.in_active_combat
      ? `During combat${phase.encounter_index == null ? "" : ` · Encounter ${phase.encounter_index + 1}`}${phase.attempt_number == null ? "" : ` · Pull ${phase.attempt_number}`}`
      : `Between encounters${phase.segment_index == null ? "" : ` · Segment ${phase.segment_index + 1}`}`;
    const skills = phase.equipped_skill_ids
      .map((skillId) => `<li>${escapeHtml(localizedActionName(presentation, skillId, null))}</li>`)
      .join("");
    const imagines = phase.equipped_imagines
      .map((imagine) => `<li>${escapeHtml(localizedActionName(presentation, imagine.skill_id, null))} · Tier ${imagine.tier ?? 0}</li>`)
      .join("");
    const facts = [
      phase.equipment_count == null ? "" : `${phase.equipment_count} equipment`,
      phase.equipped_module_count == null ? "" : `${phase.equipped_module_count} modules`,
      phase.talent_count == null ? "" : `${phase.talent_count} talents`,
    ].filter(Boolean).join(" · ");
    return `<article class="parse-loadout-phase"><header><span class="parse-loadout-index">${index + 1}</span><span><strong>${escapeHtml(phase.display_name ?? namesByCharacter.get(phase.character_id) ?? `UID ${phase.character_id}`)}</strong><small>${escapeHtml(identity)}</small></span><time>+${escapeHtml(formatDuration(phase.run_elapsed_micros))}</time></header><p>${escapeHtml(location)}${facts ? ` · ${escapeHtml(facts)}` : ""}</p>${skills ? `<div><strong>Equipped skills</strong><ul>${skills}</ul></div>` : ""}${imagines ? `<div><strong>Main Imagines</strong><ul>${imagines}</ul></div>` : ""}</article>`;
  }).join("");
  return `<section class="parse-analysis-panel"><div class="parse-analysis-heading"><div><p class="eyebrow">Time-gated profile evidence</p><h4>Combat loadouts</h4></div><small>Only snapshots after combat starts; later swaps create a new phase</small></div><div class="parse-loadout-phases">${cards}</div></section>`;
}

type AnalysisParticipant = PublicParticipant | PublicReconciledParticipant;

const chartColors = [
  "#58e6df",
  "#6ea8ff",
  "#b58cff",
  "#ff78b9",
  "#ffb454",
  "#8cda66",
  "#f06d6d",
  "#8ad7ff",
  "#d6d96b",
  "#a6a9ff",
] as const;

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
        phases: character.selected_combat_loadout_phases ?? [],
      };
    }
    const phases = (run.combat_loadout_phases ?? []).filter((phase) => phase.character_id === characterId);
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
  const reconciliationTimeline = reconciliation?.timeline;
  const usable = Boolean(reconciliation && reconciliationTimeline && reconciliation.status === "reconciled" && reconciliation.attribution_replay_completed &&
    reconciliation.conservation?.conserved === true && reconciliation.canonical_spine.report_id === reconciliationTimeline.canonical_report_id &&
    reconciliationTimeline.source === "reconciled_canonical_spine" && reconciliationTimeline.time_basis === "run_elapsed" &&
    reconciliation.reconciled_participants.length > 0 && reconciliationTimeline.participant_tracks.every((track) =>
      reconciliation.reconciled_participants[track.canonical_participant_index]?.actor_id === track.actor_id &&
      track.series_point_count <= (reconciliation.reconciled_participants[track.canonical_participant_index]!.series?.length ?? 0)));
  if (usable && reconciliation && reconciliationTimeline) {
    return { participants: reconciliation.reconciled_participants, timeline: reconciliationTimeline, reconciled: true,
      trustKind: "reconciled", contributingReportCount: reconciliation.reports.length, rdpsStatus: run.rdps_status };
  }
  return { participants: run.participants, timeline: run.timeline, reconciled: false,
    trustKind: reconciliation ? "pending" : "single", contributingReportCount: reconciliation?.reports.length ?? 1, rdpsStatus: run.rdps_status };
}

type TimelineMetric = "damage" | "effective_healing" | "damage_taken" | "rdps_damage";
const palette = ["#52cfff", "#ffcc66", "#91e6a5", "#ff7aa8", "#b8a1ff", "#ff9166", "#7ce3dc", "#d9f06f"];

export function renderTimeline(graph: CanonicalGraphSelection, messages = createMessageResolver()): string {
  const { timeline, participants } = graph;
  if (!timeline) return "";
  const durationSeconds = Math.max(1, Math.ceil(timeline.duration_micros / 1_000_000));
  const plotted = timeline.participant_tracks.flatMap((track, trackIndex) => {
    const actor = participants[track.canonical_participant_index];
    if (!actor || actor.actor_id !== track.actor_id) return [];
    return [{ actor, track, color: palette[trackIndex % palette.length] }];
  });
  const hasGameTimeClock = timeline.rate_clock_complete === true && Boolean(timeline.rate_clock?.length);
  const rdpsTracks = hasGameTimeClock
    ? plotted.filter(({ actor, track }) => hasCompleteRdpsBuckets((actor.series ?? []).slice(0, track.series_point_count)))
    : [];
  const exactCumulativeRdpsTracks = rdpsTracks.filter(({ actor }) => actor.rdps_incomplete === false);
  const partialRdps = graph.rdpsStatus.startsWith("partial_") || plotted.some(({ actor, track }) =>
    actor.rdps_incomplete === true || !hasCompleteRdpsBuckets((actor.series ?? []).slice(0, track.series_point_count)));
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
    <div class="timeline-snapshot-scroll" data-timeline-snapshot></div>
    <div class="timeline-legend" role="group" aria-label="${escapeHtml(messages.message("parse.timeline.participants"))}">${plotted.map(({ actor, color }, participantIndex) => `<button type="button" data-participant-toggle="${participantIndex}" aria-pressed="true" style="--track:${color}"><i></i><span>${escapeHtml(actor.display_name ?? messages.message("parse.timeline.player", { id: actor.actor_id }))}</span></button>`).join("")}</div>
    ${notes ? `<p class="timeline-note">${escapeHtml(notes)}</p>` : ""}
  </section>`;
}

type CombatTimeline = NonNullable<PublicRun["timeline"]>;
type CombatTimelineTrack = CombatTimeline["participant_tracks"][number];
type ParticipantSeriesPoint = NonNullable<PublicParticipant["series"]>[number];

function renderTimelineSvg(timeline: CombatTimeline, plotted: Array<{ actor: PublicParticipant; track: CombatTimelineTrack; color: string }>, rdpsLabel: string, messages: MessageResolver): string {
  const width = 920, height = 270, left = 48, right = 14, top = 16, bottom = 34;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const seconds = Math.max(1, Math.ceil(timeline.duration_micros / 1_000_000));
  const hasRdps = plotted.some(({ actor, track }) => hasCompleteRdpsBuckets((actor.series ?? []).slice(0, track.series_point_count)));
  const metrics: TimelineMetric[] = ["damage", "effective_healing", "damage_taken", ...(hasRdps ? ["rdps_damage" as const] : [])];
  const windows = [1, 5, 10] as const;
  const groups = metrics.flatMap((metric) => windows.map((windowSeconds) => {
    const metricLabel = metric === "damage" ? messages.message("parse.timeline.metric.damage") : metric === "effective_healing" ? messages.message("parse.timeline.metric.healing") : metric === "damage_taken" ? messages.message("parse.timeline.metric.taken") : rdpsLabel;
    const curves = plotted.flatMap(({ actor, track, color }, participantIndex) => {
      const points = (actor.series ?? []).slice(0, track.series_point_count);
      if (metric === "rdps_damage" && !hasCompleteRdpsBuckets(points)) return [];
      const buckets = points.flatMap((point) => point[metric] == null ? [] : [[point.second + 1, point[metric]!] as [number, number]]);
      const samples = metric === "rdps_damage"
        ? rollingTimelineRateClockSamples(buckets, seconds, windowSeconds, timeline.duration_micros,
          timeline.rate_clock_complete === true ? timeline.rate_clock ?? null : null)
        : rollingTimelineSamples(buckets, seconds, windowSeconds, timeline.duration_micros);
      return [{ actor, track, color, participantIndex, buckets, points: samples }];
    });
    const max = Math.max(1, ...curves.flatMap(({ points }) => points.map(([, value]) => value)));
    const lines = curves.map(({ actor, color, participantIndex, buckets, points: samples }) => {
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
        ? ` data-values="${buckets.map(([second, value]) => `${second}:${value}`).join(",")}"`
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
  return `<svg class="timeline-svg" viewBox="0 0 ${width} ${height}" role="group" aria-label="${escapeHtml(messages.message("parse.timeline.graph_aria", { duration: formatDuration(timeline.duration_micros) }))}" data-duration-seconds="${seconds}" data-duration-micros="${timeline.duration_micros}" data-plot-left="${left}" data-plot-width="${plotWidth}" data-series-complete="${timeline.omitted.series_points === 0}" data-rate-clock-complete="${rateClock ? "true" : "false"}"${rateClock ? ` data-rate-clock="${rateClock}"` : ""}>
    <line x1="${left}" y1="${top + plotHeight}" x2="${left + plotWidth}" y2="${top + plotHeight}" class="timeline-axis" />
    <text x="${left}" y="${height - 8}" class="timeline-tick">0:00</text><text x="${left + plotWidth}" y="${height - 8}" text-anchor="end" class="timeline-tick">${formatDuration(timeline.duration_micros)}</text>
    ${groups}${rdpsEvidence}${loadouts}${deaths}
    <g class="timeline-crosshair" data-timeline-crosshair hidden aria-hidden="true"><line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotHeight}" /></g>
    <rect class="timeline-inspector-hitbox" data-timeline-inspector x="${left}" y="${top}" width="${plotWidth}" height="${plotHeight}" tabindex="0" role="slider" aria-label="${escapeHtml(messages.message("parse.timeline.inspector_aria"))}" aria-valuemin="0" aria-valuemax="${seconds}" aria-valuenow="0" aria-valuetext="0:00" />
  </svg>`;
}

export function rollingBucketSeries(points: readonly ParticipantSeriesPoint[], metric: TimelineMetric, totalSeconds: number, windowSeconds: number, durationMicros = totalSeconds * 1_000_000): Array<[number, number]> {
  // Public series seconds identify one-second buckets. The interactive cursor
  // identifies elapsed bucket boundaries: boundary 0 is the untouched start,
  // and bucket `second` becomes visible at boundary `second + 1`.
  return rollingTimelineSamples(points.flatMap((point) => {
    const amount = point[metric];
    return amount == null ? [] : [[point.second + 1, amount] as [number, number]];
  }), totalSeconds, windowSeconds, durationMicros);
}

export function rollingTimelineSamples(samples: readonly [number, number][], totalSeconds: number, windowSeconds: number, durationMicros = totalSeconds * 1_000_000): Array<[number, number]> {
  return rollingTimelineSamplesWithDenominator(samples, totalSeconds, windowSeconds, (boundary, duration, window) =>
    timelineWindowDenominatorMicros(durationMicros, boundary, duration, window));
}

export function rollingTimelineRateClockSamples(
  samples: readonly [number, number][],
  totalSeconds: number,
  windowSeconds: number,
  durationMicros: number,
  rateClock: readonly PublicTimelineRateClockPoint[] | null,
): Array<[number, number]> {
  return rollingTimelineSamplesWithDenominator(samples, totalSeconds, windowSeconds, (boundary, duration, window) =>
    timelineRateClockWindowDenominatorMicros(rateClock, boundary, duration, window, durationMicros));
}

function rollingTimelineSamplesWithDenominator(
  samples: readonly [number, number][],
  totalSeconds: number,
  windowSeconds: number,
  denominatorAt: (boundary: number, maximumBoundary: number, window: number) => number | null,
): Array<[number, number]> {
  const duration = Math.max(1, Math.floor(totalSeconds));
  const window = Math.max(1, Math.floor(windowSeconds));
  const totals = new Map<number, number>();
  for (const [sampleBoundary, amount] of samples) {
    if (sampleBoundary <= 0 || sampleBoundary > duration || amount === 0) continue;
    for (let boundary = sampleBoundary; boundary <= Math.min(duration, sampleBoundary + window - 1); boundary += 1) {
      totals.set(boundary, (totals.get(boundary) ?? 0) + amount);
    }
  }
  const values = [...totals].flatMap(([boundary, total]) => {
    const denominatorMicros = denominatorAt(boundary, duration, window);
    return denominatorMicros == null ? [] : [[boundary, total * 1_000_000 / denominatorMicros] as [number, number]];
  });
  const nonzero = values.sort(([left], [right]) => left - right);
  const outputSamples: Array<[number, number]> = [[0, 0]];
  const terminalAvailable = denominatorAt(duration, duration, window) !== null;
  nonzero.forEach(([boundary, value], index) => {
    const prior = nonzero[index - 1];
    const next = nonzero[index + 1];
    if (boundary > 1 && (!prior || prior[0] + 1 < boundary) && outputSamples.at(-1)?.[0] !== boundary - 1) outputSamples.push([boundary - 1, 0]);
    outputSamples.push([boundary, value]);
    if (boundary < duration && (!next || next[0] > boundary + 1) && (boundary + 1 < duration || terminalAvailable)) outputSamples.push([boundary + 1, 0]);
  });
  if (terminalAvailable && outputSamples.at(-1)?.[0] !== duration) outputSamples.push([duration, 0]);
  return outputSamples;
}

function timelineRateClockWindowDenominatorMicros(
  rateClock: readonly PublicTimelineRateClockPoint[] | null,
  boundary: number,
  maximumBoundary: number,
  window: number,
  durationMicros: number,
): number | null {
  if (!rateClock?.length || boundary <= 0) return null;
  const startBoundary = Math.max(0, boundary - window);
  const ended = timelineRateClockElapsedMicros(rateClock, boundary);
  const started = timelineRateClockElapsedMicros(rateClock, startBoundary);
  if (ended == null || started == null || ended <= started) return null;
  return ended - started;
}

function timelineRateClockElapsedMicros(
  rateClock: readonly PublicTimelineRateClockPoint[] | null,
  boundary: number,
): number | null {
  if (boundary === 0) return 0;
  const point = rateClock?.[boundary - 1];
  return point?.second === boundary - 1 ? point.edps_elapsed_micros : null;
}

function timelineWindowDenominatorMicros(durationMicros: number, boundary: number, maximumBoundary: number, window: number): number | null {
  const elapsedMicros = boundary === maximumBoundary ? durationMicros : boundary * 1_000_000;
  const fractionalTerminal = boundary === maximumBoundary && durationMicros % 1_000_000 !== 0;
  if (!fractionalTerminal) return Math.min(window, boundary) * 1_000_000;
  if (window === 1) return durationMicros - (maximumBoundary - 1) * 1_000_000;
  if (elapsedMicros <= window * 1_000_000) return elapsedMicros;
  // A fractional trailing-window start cuts an earlier aggregate bucket. The
  // public schema has no sub-second numerator, so do not invent that rate.
  return null;
}

export function hasCompleteRdpsBuckets(points: readonly ParticipantSeriesPoint[]): boolean {
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
  elapsedMicros = Math.max(0, Math.round(second)) * 1_000_000,
): { one: number | null; five: number | null; ten: number | null; cumulative: number | null } {
  // `one` carries authoritative bucket totals; the rolling inputs carry rates
  // derived from those totals. This keeps the cumulative numerator exact while
  // allowing a partial terminal bucket to be normalized by its real duration.
  const bounded = Math.max(0, Math.round(second));
  const cumulativeTotal = samples.one.reduce(
    (total, [sampleSecond, value]) => sampleSecond <= bounded ? total + value : total,
    0,
  );
  return {
    one: bounded === 0 ? 0 : timelineValueAtSecond(samples.one, bounded) * 1_000_000 /
      Math.max(1, elapsedMicros - (bounded - 1) * 1_000_000),
    five: timelineExactWindowValue(samples.five, bounded, elapsedMicros, 5),
    ten: timelineExactWindowValue(samples.ten, bounded, elapsedMicros, 10),
    cumulative: elapsedMicros > 0 ? cumulativeTotal * 1_000_000 / elapsedMicros : 0,
  };
}

function timelineExactWindowValue(samples: readonly [number, number][], boundary: number, elapsedMicros: number, window: number): number | null {
  if (boundary === 0) return 0;
  const fractionalTerminal = elapsedMicros !== boundary * 1_000_000;
  if (fractionalTerminal && elapsedMicros > window * 1_000_000) return null;
  return timelineValueAtSecond(samples, boundary);
}

export function timelineDamageRatesAtSecond(
  oneSecondDamage: readonly [number, number][],
  rateClock: readonly PublicTimelineRateClockPoint[] | null,
  second: number,
): { edps: number; adps: number } | null {
  if (!rateClock?.length) return null;
  const bounded = Math.max(0, Math.round(second));
  if (bounded === 0) return null;
  const clock = rateClock[Math.min(bounded - 1, rateClock.length - 1)];
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
  if (bounded === 0) return null;
  const clock = rateClock[bounded - 1];
  if (!clock || clock.second !== bounded - 1 || clock.edps_elapsed_micros <= 0) return null;
  const adjustedDamage = oneSecondAdjustedDamage.reduce(
    (total, [sampleSecond, value]) => sampleSecond <= bounded ? total + value : total,
    0,
  );
  return adjustedDamage * 1_000_000 / clock.edps_elapsed_micros;
}

export function timelineRdpsRateVariantsAtSecond(
  oneSecondAdjustedDamage: readonly [number, number][],
  rateClock: readonly PublicTimelineRateClockPoint[] | null,
  second: number,
  durationMicros: number,
): { one: number | null; five: number | null; ten: number | null; cumulative: number | null } {
  const maximumBoundary = Math.max(1, Math.ceil(durationMicros / 1_000_000));
  const boundary = Math.max(0, Math.min(maximumBoundary, Math.round(second)));
  if (boundary === 0) return { one: 0, five: 0, ten: 0, cumulative: 0 };
  const rate = (window: number): number | null => {
    const denominator = timelineRateClockWindowDenominatorMicros(
      rateClock, boundary, maximumBoundary, window, durationMicros,
    );
    if (denominator == null) return null;
    const startBoundary = Math.max(0, boundary - window);
    const adjustedDamage = oneSecondAdjustedDamage.reduce(
      (total, [sampleBoundary, value]) => sampleBoundary > startBoundary && sampleBoundary <= boundary ? total + value : total,
      0,
    );
    return adjustedDamage * 1_000_000 / denominator;
  };
  return {
    one: rate(1),
    five: rate(5),
    ten: rate(10),
    cumulative: timelineRdpsAtSecond(oneSecondAdjustedDamage, rateClock, boundary),
  };
}

export function timelineCursorFrame(durationMicros: number, second: number): {
  boundary: number;
  elapsedMicros: number;
  clockIndex: number | null;
} {
  // The last integer boundary represents the exact published endpoint, which
  // can be a fractional second. Its reducer clock entry is still N - 1.
  const maximumBoundary = Math.max(1, Math.ceil(durationMicros / 1_000_000));
  const boundary = Math.max(0, Math.min(maximumBoundary, Math.round(second)));
  return {
    boundary,
    elapsedMicros: boundary === maximumBoundary
      ? Math.max(0, durationMicros)
      : Math.min(Math.max(0, durationMicros), boundary * 1_000_000),
    clockIndex: boundary === 0 ? null : boundary - 1,
  };
}

export interface TimelineCursorRateRow {
  variants: { one: number | null; five: number | null; ten: number | null; cumulative: number | null };
  damageRates: { edps: number; adps: number } | null;
  rdps: number | null;
}

export function timelineVisibleTotalAtSecond(
  rows: readonly TimelineCursorRateRow[],
  rdpsCoverageComplete = false,
): TimelineCursorRateRow | null {
  if (!rows.length) return null;
  const sum = (select: (row: TimelineCursorRateRow) => number) => rows.reduce((total, row) => total + select(row), 0);
  const sumVariant = (select: (row: TimelineCursorRateRow) => number | null) => rows.every((row) => select(row) !== null)
    ? rows.reduce((total, row) => total + select(row)!, 0) : null;
  const damageRates = rows.every((row) => row.damageRates !== null)
    ? { edps: sum((row) => row.damageRates!.edps), adps: sum((row) => row.damageRates!.adps) }
    : null;
  const rdps = !rdpsCoverageComplete || rows.some((row) => row.rdps === null)
    ? null
    : sum((row) => row.rdps!);
  return {
    variants: {
      one: sumVariant((row) => row.variants.one),
      five: sumVariant((row) => row.variants.five),
      ten: sumVariant((row) => row.variants.ten),
      cumulative: sumVariant((row) => row.variants.cumulative),
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
    showTimelineInspection(timeline, 0);
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
  const frame = timelineCursorFrame(Number(svg.dataset.durationMicros), second);
  const bounded = frame.boundary;
  const x = left + (bounded / Math.max(1, duration)) * width;
  crosshair.removeAttribute("hidden");
  crosshair.querySelector("line")?.setAttribute("x1", x.toFixed(1));
  crosshair.querySelector("line")?.setAttribute("x2", x.toFixed(1));
  inspector.setAttribute("aria-valuenow", String(bounded));
  const scrubber = timeline.querySelector<HTMLInputElement>("[data-timeline-scrubber]");
  if (scrubber) scrubber.value = String(bounded);
  const rateClock = timelineRateClockFor(svg);
  const active = [...svg.querySelectorAll<SVGPolylineElement>(`[data-series="${timeline.dataset.timelineMetric}"][data-series-window="${timeline.dataset.timelineWindow}"]:not([hidden]) polyline:not([hidden])`)].map((line) => {
    const participant = line.dataset.participant ?? "";
    const metricKey = timeline.dataset.timelineMetric ?? "damage";
    const oneSecond = timelineSamplesFor(svg, metricKey, "1", participant);
    const variants = metricKey === "rdps_damage"
      ? timelineRdpsRateVariantsAtSecond(oneSecond, rateClock, bounded, Number(svg.dataset.durationMicros))
      : timelineRateVariantsAtSecond({
        one: oneSecond,
        five: timelineSamplesFor(svg, metricKey, "5", participant),
        ten: timelineSamplesFor(svg, metricKey, "10", participant),
      }, bounded, frame.elapsedMicros);
    return {
      participant,
      label: line.dataset.label ?? "Player",
      color: line.getAttribute("stroke") ?? "currentColor",
      variants,
      damageRates: metricKey === "damage" && svg.dataset.seriesComplete === "true"
        ? timelineDamageRatesAtSecond(oneSecond, rateClock, bounded) : null,
      rdps: metricKey === "rdps_damage" && svg.dataset.seriesComplete === "true" && line.dataset.cumulativeComplete === "true"
        ? timelineRdpsAtSecond(oneSecond, rateClock, bounded) : null,
    };
  });
  const metric = timeline.dataset.timelineMetric === "effective_healing" ? messages.message("parse.timeline.metric.healing")
    : timeline.dataset.timelineMetric === "damage_taken" ? messages.message("parse.timeline.metric.taken")
    : timeline.dataset.timelineMetric === "rdps_damage" ? timeline.dataset.timelineRdpsLabel ?? messages.message("parse.timeline.rdps.exact") : messages.message("parse.timeline.metric.damage");
  const time = formatDuration(frame.elapsedMicros);
  const cumulative = (row: TimelineCursorRateRow): string => row.damageRates
    ? messages.message("parse.timeline.inspection.edps_adps", { edps: messages.number(row.damageRates.edps, { maximumFractionDigits: 1 }), adps: messages.number(row.damageRates.adps, { maximumFractionDigits: 1 }) })
    : timeline.dataset.timelineMetric === "damage" ? messages.message("parse.timeline.inspection.rate_unavailable")
    : timeline.dataset.timelineMetric === "rdps_damage"
      ? row.rdps == null ? messages.message("parse.timeline.inspection.rdps_unavailable") : messages.message("parse.timeline.inspection.rdps", { rdps: messages.number(row.rdps, { maximumFractionDigits: 1 }) })
      : row.variants.cumulative == null ? messages.message("parse.timeline.inspection.rate_unavailable")
        : messages.message("parse.timeline.inspection.run_rate", { metric, value: messages.number(row.variants.cumulative as number, { maximumFractionDigits: 1 }) });
  const variant = (value: number | null): string => value == null ? "—" : messages.number(value, { maximumFractionDigits: 1 });
  const rateLine = (row: TimelineCursorRateRow): string => messages.message("parse.timeline.inspection.rates", {
    one: variant(row.variants.one),
    five: variant(row.variants.five),
    ten: variant(row.variants.ten),
    cumulative: cumulative(row),
  });
  const allRdpsTracksExact = Number(timeline.dataset.timelineExactRdpsTrackCount) === Number(timeline.dataset.timelineParticipantCount);
  const visibleTotal = timelineVisibleTotalAtSecond(active, timeline.dataset.timelineMetric === "rdps_damage" && allRdpsTracksExact);
  const total = visibleTotal && active.length > 1
    ? `<span class="timeline-inspection-total">${escapeHtml(messages.message("parse.timeline.inspection.visible_total"))} <strong>${escapeHtml(rateLine(visibleTotal))}</strong></span>`
    : "";
  const details = active.length > 1
    ? total
    : active.length === 1
      ? `<span><i style="--track:${active[0]!.color}"></i>${escapeHtml(metric)} <strong>${escapeHtml(rateLine(active[0]!))}</strong></span>`
      : `<span>${escapeHtml(messages.message("parse.timeline.inspection.none"))}</span>`;
  output.innerHTML = `<strong>${time}</strong>${details}`;
  const snapshot = timeline.querySelector<HTMLElement>("[data-timeline-snapshot]");
  if (snapshot) snapshot.innerHTML = renderTimelineSnapshotTable(
    timeline.dataset.timelineMetric as TimelineMetric,
    metric,
    time,
    active,
    visibleTotal,
    messages,
  );
  const totalAria = visibleTotal && active.length > 1 ? `${messages.message("parse.timeline.inspection.visible_total")}: ${rateLine(visibleTotal)}; ` : "";
  inspector.setAttribute("aria-valuetext", `${time}; ${totalAria}${active.map((row) => `${row.label}: ${rateLine(row)}`).join("; ") || messages.message("parse.timeline.inspection.none")}`);
}

interface TimelineSnapshotRow extends TimelineCursorRateRow {
  label: string;
  color: string;
}

export function renderTimelineSnapshotTable(
  metric: TimelineMetric,
  metricLabel: string,
  time: string,
  rows: readonly TimelineSnapshotRow[],
  visibleTotal: TimelineCursorRateRow | null,
  messages = createMessageResolver(),
): string {
  if (!rows.length || !visibleTotal) return `<p class="timeline-snapshot-empty">${escapeHtml(messages.message("parse.timeline.inspection.none"))}</p>`;
  const contextualColumns = metric === "damage"
    ? [
      { label: messages.message("parse.timeline.snapshot.edps"), value: (row: TimelineCursorRateRow) => row.damageRates?.edps ?? null },
      { label: messages.message("parse.timeline.snapshot.adps"), value: (row: TimelineCursorRateRow) => row.damageRates?.adps ?? null },
    ]
    : metric === "rdps_damage"
      ? [{ label: messages.message("parse.timeline.snapshot.rdps"), value: (row: TimelineCursorRateRow) => row.rdps }]
      : [];
  const columns = [
    { label: messages.message("parse.timeline.snapshot.one"), value: (row: TimelineCursorRateRow) => row.variants.one },
    { label: messages.message("parse.timeline.snapshot.five"), value: (row: TimelineCursorRateRow) => row.variants.five },
    { label: messages.message("parse.timeline.snapshot.ten"), value: (row: TimelineCursorRateRow) => row.variants.ten },
    { label: messages.message("parse.timeline.snapshot.run"), value: (row: TimelineCursorRateRow) => row.variants.cumulative },
    ...contextualColumns,
  ];
  const format = (value: number | null): string => value == null ? "—" : messages.number(value, { maximumFractionDigits: 1 });
  const cells = (row: TimelineCursorRateRow) => columns.map((column) => `<td>${escapeHtml(format(column.value(row)))}</td>`).join("");
  const playerRows = rows.map((row) => `<tr><th scope="row"><i aria-hidden="true" style="--track:${row.color}"></i>${escapeHtml(row.label)}</th>${cells(row)}</tr>`).join("");
  return `<table class="timeline-snapshot-table">
    <caption>${escapeHtml(messages.message("parse.timeline.snapshot.caption", { metric: metricLabel, time }))}</caption>
    <thead><tr><th scope="col">${escapeHtml(messages.message("parse.timeline.snapshot.player"))}</th>${columns.map((column) => `<th scope="col">${escapeHtml(column.label)}</th>`).join("")}</tr></thead>
    <tbody><tr class="timeline-snapshot-total"><th scope="row">${escapeHtml(messages.message("parse.timeline.inspection.visible_total"))}</th>${cells(visibleTotal)}</tr>${playerRows}</tbody>
  </table>`;
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
    Number(svg.dataset.durationMicros),
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


function renderRunTimeline(run: PublicRun, participants: AnalysisParticipant[]): string {
  const actors = participants.filter((actor) => (actor.series?.length ?? 0) > 0);
  if (!actors.length) {
    return analysisPanel(
      "Run timeline",
      "A synchronized one-second timeline will appear for newly projected reports. This legacy report has aggregate totals only.",
    );
  }

  const durationSeconds = Math.max(
    1,
    Math.ceil((run.total_run_time_micros ?? run.active_combat_micros) / 1_000_000),
    ...actors.flatMap((actor) => actor.series?.map((point) => point.second) ?? []),
  );
  const maximumDamage = Math.max(
    1,
    ...actors.flatMap((actor) => actor.series?.map((point) => point.damage) ?? []),
  );
  const width = 1_000;
  const height = 280;
  const left = 58;
  const right = 18;
  const top = 18;
  const bottom = 42;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const x = (second: number): number => left + (Math.min(durationSeconds, second) / durationSeconds) * plotWidth;
  const y = (damage: number): number => top + plotHeight - (Math.max(0, damage) / maximumDamage) * plotHeight;
  const grid = Array.from({ length: 5 }, (_, index) => {
    const fraction = index / 4;
    const gridY = top + plotHeight * fraction;
    const value = maximumDamage * (1 - fraction);
    return `<line x1="${left}" y1="${gridY.toFixed(2)}" x2="${width - right}" y2="${gridY.toFixed(2)}" class="parse-chart-grid"/><text x="${left - 8}" y="${(gridY + 4).toFixed(2)}" text-anchor="end">${escapeHtml(formatCompact(value))}</text>`;
  }).join("");
  const timeTicks = Array.from({ length: 5 }, (_, index) => {
    const second = (durationSeconds * index) / 4;
    return `<text x="${x(second).toFixed(2)}" y="${height - 12}" text-anchor="middle">${escapeHtml(formatSeconds(second))}</text>`;
  }).join("");
  let segmentElapsed = 0;
  const segmentMarkers = run.segments
    .map((segment) => {
      segmentElapsed += segment.wall_time_micros / 1_000_000;
      if (segmentElapsed >= durationSeconds) return "";
      const markerX = x(segmentElapsed);
      return `<line x1="${markerX.toFixed(2)}" y1="${top}" x2="${markerX.toFixed(2)}" y2="${top + plotHeight}" class="parse-segment-line"><title>${escapeHtml(`${title(segment.kind)} ends at ${formatSeconds(segmentElapsed)}`)}</title></line>`;
    })
    .join("");
  const paths = actors
    .map((actor, index) => {
      const color = chartColors[index % chartColors.length];
      const path = damageSeriesPath(actor.series ?? [], durationSeconds, x, y);
      const deaths = (actor.death_seconds ?? [])
        .map((second) => {
          const centerX = x(second);
          const centerY = y(timelineDamageAtSecond(actor.series ?? [], second));
          const size = 5;
          const diamond = `M ${centerX.toFixed(2)} ${(centerY - size).toFixed(2)} L ${(centerX + size).toFixed(2)} ${centerY.toFixed(2)} L ${centerX.toFixed(2)} ${(centerY + size).toFixed(2)} L ${(centerX - size).toFixed(2)} ${centerY.toFixed(2)} Z`;
          return `<path d="${diamond}" fill="${color}" class="parse-death-marker"><title>${escapeHtml(`${participantName(actor)} died at ${formatSeconds(second)}`)}</title></path>`;
        })
        .join("");
      return `<g data-timeline-actor="${escapeHtml(actor.actor_id)}"><path d="${path}" fill="none" stroke="${color}" class="parse-timeline-path"><title>${escapeHtml(participantName(actor))} damage per second</title></path>${deaths}</g>`;
    })
    .join("");
  const legend = actors
    .map((actor, index) => `<button type="button" data-timeline-toggle="${escapeHtml(actor.actor_id)}" aria-pressed="true"><i style="--series-color:${chartColors[index % chartColors.length]}"></i>${escapeHtml(participantName(actor))}</button>`)
    .join("");

  return `<section class="parse-analysis-panel parse-timeline-panel">
    <div class="parse-analysis-heading"><div><p class="eyebrow">Synchronized evidence</p><h4>Run timeline</h4></div><small>One-second damage · diamond markers are deaths</small></div>
    <div class="parse-chart-scroll"><svg class="parse-timeline-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Per-player damage timeline for ${escapeHtml(formatSeconds(durationSeconds))}">
      ${grid}${timeTicks}${segmentMarkers}${paths}
    </svg></div>
    <div class="parse-chart-legend">${legend}</div>
  </section>`;
}

export function timelineDamageAtSecond(
  points: NonNullable<PublicParticipant["series"]>,
  second: number,
): number {
  const targetSecond = Math.floor(second);
  return points.reduce(
    (sum, point) => Math.floor(point.second) === targetSecond ? sum + point.damage : sum,
    0,
  );
}

function damageSeriesPath(
  points: NonNullable<PublicParticipant["series"]>,
  durationSeconds: number,
  x: (second: number) => number,
  y: (damage: number) => number,
): string {
  const bySecond = new Map<number, number>();
  for (const point of points) bySecond.set(point.second, (bySecond.get(point.second) ?? 0) + point.damage);
  const observed = [...bySecond.entries()].sort(([left], [right]) => left - right);
  const vertices: Array<[number, number]> = [[0, 0]];
  let previous = 0;
  for (const [second, damage] of observed) {
    if (second > previous + 1) {
      vertices.push([previous + 1, 0], [second - 1, 0]);
    }
    vertices.push([second, damage]);
    previous = second;
  }
  if (previous < durationSeconds) vertices.push([Math.min(durationSeconds, previous + 1), 0], [durationSeconds, 0]);
  return vertices
    .map(([second, damage], index) => `${index === 0 ? "M" : "L"}${x(second).toFixed(2)},${y(damage).toFixed(2)}`)
    .join(" ");
}

function renderSkillContributions(
  participants: AnalysisParticipant[],
  influences: PublicRdpsInfluence[],
  effects: PublicRdpsEffectPresentation[],
  presentation?: ParsePresentationCatalog,
): string {
  const actors = ownedSkillParticipants(participants, influences, effects)
    .filter((actor) => (actor.abilities?.some((ability) => ability.damage > 0) ?? false));
  if (!actors.length) {
    return analysisPanel(
      "Skill contribution",
      "Skill-level totals will appear for newly projected reports. No skill rows were published with this legacy report.",
    );
  }
  const cards = actors
    .map((actor, actorIndex) => renderSkillCard(actor, actorIndex, presentation))
    .join("");
  return `<section class="parse-analysis-panel"><div class="parse-analysis-heading"><div><p class="eyebrow">Packet-proven ownership</p><h4>Skill contribution</h4></div><small>Generated support damage follows its proven provider; raw party totals remain unchanged</small></div><div class="parse-skill-grid">${cards}</div></section>`;
}

const encoreEffectId = "55333";
const encoreDamageActionIds = new Set(["230401", "230501"]);

/**
 * Encore damage is emitted on the recipient's wire actor, while the exact
 * status-source lifecycle proves which external healer generated it. Keep the
 * immutable raw participant totals intact everywhere else, but present a
 * semantic skill-ownership view here. The overall effect can remain partial
 * while its standalone generated-damage component is exact. A move is allowed
 * only for the damage covered by exact component rows. Any uncovered remainder
 * stays on the wire recipient rather than making a provider guess.
 */
export function ownedSkillParticipants(
  participants: AnalysisParticipant[],
  influences: PublicRdpsInfluence[],
  effects: PublicRdpsEffectPresentation[],
): AnalysisParticipant[] {
  const byActor = new Map(participants.map((actor) => [actor.actor_id, {
    ...actor,
    abilities: actor.abilities?.map((ability) => ({ ...ability })),
  }]));
  const movements = new Map<string, Map<string, {
    damage: bigint;
    events: number;
    criticalHits: number | null;
  }>>();
  for (const influence of influences) {
    if (
      influence.effect_id !== encoreEffectId ||
      !influence.damage_context_complete ||
      influence.provider_actor_id === influence.recipient_actor_id ||
      !influence.affected_ability_id ||
      !encoreDamageActionIds.has(influence.affected_ability_id) ||
      !influence.attribution_component ||
      humanizeAttributionComponent(influence.attribution_component).toLowerCase() !==
        "encore standalone generated damage"
    ) continue;
    const amount = influence.attributed_rdps == null
      ? null
      : parseInteger(influence.attributed_rdps);
    const observed = parseInteger(influence.observed_damage);
    const exactDelta = influence.exact_integer_delta == null
      ? null
      : parseInteger(influence.exact_integer_delta);
    if (
      amount == null ||
      amount <= 0n ||
      observed !== amount ||
      exactDelta !== amount ||
      influence.exact_rational_deltas.length > 0
    ) continue;
    const key = `${influence.recipient_actor_id}\0${influence.affected_ability_id}`;
    const providers = movements.get(key) ?? new Map();
    const previous = providers.get(influence.provider_actor_id) ?? {
      damage: 0n,
      events: 0,
      criticalHits: 0,
    };
    providers.set(influence.provider_actor_id, {
      damage: previous.damage + amount,
      events: previous.events + influence.damage_event_count,
      criticalHits: previous.criticalHits === null || influence.critical_hit_count == null
        ? null
        : previous.criticalHits + influence.critical_hit_count,
    });
    movements.set(key, providers);
  }

  const providerTotals = new Map<string, {
    damage: bigint;
    events: number;
    criticalHits: number | null;
  }>();
  for (const [key, providers] of movements) {
    const separator = key.indexOf("\0");
    const recipientId = key.slice(0, separator);
    const actionId = key.slice(separator + 1);
    const recipient = byActor.get(recipientId);
    const ability = recipient?.abilities?.find((candidate) => candidate.ability_id === actionId);
    if (!ability) continue;
    const moved = [...providers.values()].reduce((sum, value) => sum + value.damage, 0n);
    if (
      !Number.isSafeInteger(ability.damage) ||
      moved > BigInt(ability.damage) ||
      [...providers.keys()].some((providerId) => !byActor.has(providerId))
    ) continue;
    const movedEvents = [...providers.values()].reduce((sum, value) => sum + value.events, 0);
    if (movedEvents > ability.hits) continue;
    const remainderEvents = ability.hits - movedEvents;
    const criticalAllocations = proportionalEventAllocation(
      ability.critical_hits,
      [
        ...[...providers.entries()].map(([providerId, value]) => ({ key: providerId, events: value.events })),
        { key: "recipient", events: remainderEvents },
      ],
      ability.hits,
    );
    const movedDamage = Number(moved);
    if (!Number.isSafeInteger(movedDamage)) continue;
    if (movedDamage === ability.damage) {
      recipient!.abilities = recipient!.abilities!.filter((candidate) => candidate !== ability);
    } else {
      ability.damage -= movedDamage;
      ability.effective_damage = Math.max(0, ability.effective_damage - movedDamage);
      ability.hits = remainderEvents;
      ability.critical_hits = criticalAllocations.get("recipient") ?? 0;
    }
    for (const [providerId, value] of providers) {
      if (!byActor.has(providerId)) continue;
      const previous = providerTotals.get(providerId) ?? {
        damage: 0n,
        events: 0,
        criticalHits: 0,
      };
      providerTotals.set(providerId, {
        damage: previous.damage + value.damage,
        events: previous.events + value.events,
        criticalHits: (previous.criticalHits ?? 0) + (criticalAllocations.get(providerId) ?? 0),
      });
    }
  }

  const encoreName = effects.find((effect) => effect.effect_id === encoreEffectId)
    ?.presentation_name ?? "Encore";
  for (const [providerId, value] of providerTotals) {
    const provider = byActor.get(providerId);
    if (!provider) continue;
    provider.abilities ??= [];
    const existingEncore = provider.abilities.filter((ability) =>
      encoreDamageActionIds.has(ability.ability_id) &&
      ability.presentation_kind === "support-generated-damage"
    );
    const existingDamage = existingEncore.reduce((sum, ability) => sum + ability.damage, 0);
    const damage = Number(value.damage) + existingDamage;
    if (!Number.isSafeInteger(damage)) continue;
    provider.abilities = provider.abilities.filter((ability) => !existingEncore.includes(ability));
    provider.abilities.push({
      ability_id: `support-effect:${encoreEffectId}`,
      presentation_name: encoreName,
      presentation_kind: "support-generated-damage",
      icon_asset_path: null,
      presentation_recount_group_id: null,
      presentation_recount_group_name: null,
      casts: 0,
      hits: value.events + existingEncore.reduce((sum, ability) => sum + ability.hits, 0),
      critical_hits: (value.criticalHits ?? 0) + existingEncore.reduce((sum, ability) => sum + ability.critical_hits, 0),
      damage,
      effective_damage: Number(value.damage) + existingEncore.reduce((sum, ability) => sum + ability.effective_damage, 0),
      healing: 0,
      effective_healing: 0,
      shielding: 0,
    });
  }
  return participants.map((actor) => byActor.get(actor.actor_id) ?? actor);
}

function proportionalEventAllocation(
  total: number,
  buckets: Array<{ key: string; events: number }>,
  totalEvents: number,
): Map<string, number> {
  const allocations = new Map<string, number>();
  if (totalEvents <= 0 || total <= 0) return allocations;
  const ranked = buckets.map((bucket) => {
    const exact = total * bucket.events / totalEvents;
    const base = Math.min(bucket.events, Math.floor(exact));
    allocations.set(bucket.key, base);
    return { ...bucket, fraction: exact - base };
  }).sort((left, right) => right.fraction - left.fraction || right.events - left.events);
  let remaining = total - [...allocations.values()].reduce((sum, value) => sum + value, 0);
  for (const bucket of ranked) {
    if (remaining <= 0) break;
    const allocated = allocations.get(bucket.key) ?? 0;
    if (allocated >= bucket.events) continue;
    allocations.set(bucket.key, allocated + 1);
    remaining -= 1;
  }
  return allocations;
}

function renderSkillCard(
  actor: AnalysisParticipant,
  actorIndex: number,
  presentation?: ParsePresentationCatalog,
): string {
  const allAbilities = [...(actor.abilities ?? [])];
  const castContext = skillCastContext(allAbilities);
  const abilities = allAbilities.filter((ability) => ability.damage > 0).sort((left, right) => right.damage - left.damage);
  const total = abilities.reduce((sum, ability) => sum + ability.damage, 0);
  const visible = abilities.slice(0, 7).map((ability) => ({
    name: localizedActionName(presentation, ability.ability_id, ability.presentation_name),
    damage: ability.damage,
    castLabel: skillCastLabel(ability, castContext),
    hits: ability.hits,
    criticalHits: ability.critical_hits,
    supportGenerated: ability.presentation_kind === "support-generated-damage",
    isOther: false,
  }));
  const other = abilities.slice(7);
  if (other.length) {
    visible.push({
      name: `Other (${other.length})`,
      damage: other.reduce((sum, ability) => sum + ability.damage, 0),
      castLabel: groupedSkillCastLabel(other, castContext),
      hits: other.reduce((sum, ability) => sum + ability.hits, 0),
      criticalHits: other.reduce((sum, ability) => sum + ability.critical_hits, 0),
      supportGenerated: false,
      isOther: true,
    });
  }
  let cursor = 0;
  const slices = visible.map((ability, index) => {
    const start = cursor;
    cursor += total > 0 ? (ability.damage / total) * 100 : 0;
    return `${chartColors[(actorIndex + index) % chartColors.length]} ${start.toFixed(3)}% ${cursor.toFixed(3)}%`;
  });
  const rows = visible
    .map((ability, index) => {
      const percent = total > 0 ? (ability.damage / total) * 100 : 0;
      const criticalRate = ability.hits > 0 ? (ability.criticalHits / ability.hits) * 100 : 0;
      const observation = ability.supportGenerated
        ? `${ability.hits.toLocaleString()} generated hits · provider proven`
        : `${ability.castLabel} · ${ability.hits.toLocaleString()} hits · ${criticalRate.toFixed(1)}% crit`;
      if (ability.isOther) {
        const actorName = participantName(actor);
        const details = renderOtherSkillDetails(actor, other, total, castContext, presentation);
        return `<li class="parse-skill-other-row"><button class="parse-skill-other-trigger" type="button" data-skill-other-trigger aria-haspopup="dialog" aria-label="View ${other.length} other skill details for ${escapeHtml(actorName)}"><i style="--series-color:${chartColors[(actorIndex + index) % chartColors.length]}"></i><span><strong>${escapeHtml(ability.name)}</strong><small>${ability.castLabel} · ${ability.hits.toLocaleString()} hits · ${criticalRate.toFixed(1)}% crit</small></span><span><strong>${formatNumber(ability.damage)}</strong><small>${percent.toFixed(1)}%</small></span><b aria-hidden="true">›</b></button><template data-skill-other-content>${details}</template></li>`;
      }
      return `<li><i style="--series-color:${chartColors[(actorIndex + index) % chartColors.length]}"></i><span><strong>${escapeHtml(ability.name)}</strong><small>${escapeHtml(observation)}</small></span><span><strong>${formatNumber(ability.damage)}</strong><small>${percent.toFixed(1)}%</small></span></li>`;
    })
    .join("");
  return `<details class="parse-skill-card"${actorIndex === 0 ? " open" : ""}><summary><span><strong>${escapeHtml(participantName(actor))}</strong><small>${escapeHtml([actor.class_name, actor.specialization_name].filter(Boolean).join(" / "))}</small></span><span>${formatNumber(total)} owned damage</span></summary><div class="parse-skill-content"><div class="parse-skill-pie" style="--skill-pie:conic-gradient(${slices.join(",")})" role="img" aria-label="Skill damage shares for ${escapeHtml(participantName(actor))}"><span>${abilities.length}<small>skills</small></span></div><ol>${rows}</ol></div></details>`;
}

function renderOtherSkillDetails(
  actor: AnalysisParticipant,
  abilities: NonNullable<AnalysisParticipant["abilities"]>,
  totalDamage: number,
  castContext: SkillCastContext,
  presentation?: ParsePresentationCatalog,
): string {
  const groupedDamage = abilities.reduce((sum, ability) => sum + ability.damage, 0);
  const groupedPercent = totalDamage > 0 ? (groupedDamage / totalDamage) * 100 : 0;
  const rows = abilities.map((ability, index) => {
    const percent = totalDamage > 0 ? (ability.damage / totalDamage) * 100 : 0;
    const criticalRate = ability.hits > 0 ? (ability.critical_hits / ability.hits) * 100 : 0;
    const name = localizedActionName(presentation, ability.ability_id, ability.presentation_name);
    const observation = ability.presentation_kind === "support-generated-damage"
      ? `${ability.hits.toLocaleString()} generated hits · provider proven`
      : `${skillCastLabel(ability, castContext)} · ${ability.hits.toLocaleString()} hits · ${criticalRate.toFixed(1)}% crit`;
    return `<li><span class="parse-skill-drilldown-rank">${index + 8}</span><span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(observation)}</small></span><span><strong>${formatNumber(ability.damage)}</strong><small>${percent.toFixed(1)}%</small></span></li>`;
  }).join("");
  return `<article class="parse-skill-drilldown"><header><p class="eyebrow">Complete skill contribution</p><h3>Other skills · ${escapeHtml(participantName(actor))}</h3><p>${abilities.length.toLocaleString()} skills grouped in the compact chart</p></header><div class="parse-skill-drilldown-summary"><span><small>Grouped damage</small><strong>${formatNumber(groupedDamage)}</strong></span><span><small>Player share</small><strong>${groupedPercent.toFixed(1)}%</strong></span></div><ol class="parse-skill-drilldown-list">${rows}</ol></article>`;
}

interface SkillCastContext {
  observed: boolean;
  groupTotals: Map<string, number>;
}

function skillCastContext(
  abilities: NonNullable<AnalysisParticipant["abilities"]>,
): SkillCastContext {
  const groupTotals = new Map<string, number>();
  for (const ability of abilities) {
    const groupId = ability.presentation_recount_group_id;
    if (!groupId || ability.casts <= 0) continue;
    groupTotals.set(groupId, (groupTotals.get(groupId) ?? 0) + ability.casts);
  }
  return {
    observed: abilities.some((ability) => ability.casts > 0),
    groupTotals,
  };
}

function skillCastCount(
  ability: NonNullable<AnalysisParticipant["abilities"]>[number],
  context: SkillCastContext,
): number {
  const groupId = ability.presentation_recount_group_id;
  return groupId ? (context.groupTotals.get(groupId) ?? 0) : ability.casts;
}

function skillCastLabel(
  ability: NonNullable<AnalysisParticipant["abilities"]>[number],
  context: SkillCastContext,
): string {
  return context.observed
    ? `${skillCastCount(ability, context).toLocaleString()} casts`
    : "Casts not observed";
}

function groupedSkillCastLabel(
  abilities: NonNullable<AnalysisParticipant["abilities"]>,
  context: SkillCastContext,
): string {
  if (!context.observed) return "Casts not observed";
  const seen = new Set<string>();
  let casts = 0;
  for (const ability of abilities) {
    const key = ability.presentation_recount_group_id
      ? `group:${ability.presentation_recount_group_id}`
      : `ability:${ability.ability_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    casts += skillCastCount(ability, context);
  }
  return `${casts.toLocaleString()} casts`;
}

function renderRdpsCalculations(
  run: PublicRun,
  reconciliation: PublicRunReconciliation | null,
  participants: AnalysisParticipant[],
  reconciled: boolean,
  presentation?: ParsePresentationCatalog,
): string {
  const influences = reconciled
    ? (reconciliation?.rdps_influences ?? [])
    : (run.rdps_influences ?? []);
  const effects = reconciled ? (reconciliation?.rdps_effects ?? []) : (run.rdps_effects ?? []);
  const formulas = participants
    .filter((participant): participant is PublicReconciledParticipant => "rdps_damage" in participant)
    .map((participant) => `<div class="rdps-formula-row"><span><strong>${escapeHtml(participantName(participant))}</strong><small>${participant.rdps_incomplete ? "Known subtotal; unresolved evidence remains" : "Conserved exact total"}</small></span><code>${formatNumber(participant.damage)} + ${formatOptionalNumber(participant.contribution_given)} given - ${formatOptionalNumber(participant.contribution_received)} received = ${formatOptionalNumber(participant.rdps_damage)} rDMG</code></div>`)
    .join("");
  if (!influences.length && !formulas) {
    return analysisPanel(
      "rDPS calculations",
      "No exact influence ledger was published for this report. rDPS remains explicitly unresolved rather than being copied from DPS.",
    );
  }
  const grouped = groupInfluences(influences, effects, participants, presentation);
  const rows = grouped
    .map((group) => `<div class="rdps-ledger-row"><span><strong>${escapeHtml(group.provider)}</strong><small>granted through ${escapeHtml(group.effect)}${group.components.size ? ` · ${escapeHtml([...group.components].map(title).join(", "))}` : ""}</small></span><span><small>Recipients</small><strong>${group.recipients.size.toLocaleString()}</strong></span><span><small>Damage events</small><strong>${group.events.toLocaleString()}</strong></span><span><small>Observed damage</small><strong>${formatBigInt(group.observedDamage)}</strong></span><span><small>Attributed rDMG</small><strong>${group.allocated ? formatBigInt(group.attributed) : "Unresolved"}${group.incomplete ? "*" : ""}</strong></span></div>`)
    .join("");
  const evidenceLabel = reconciled ? "Cross-vantage server replay" : "Single-vantage server replay";
  return `<section class="parse-analysis-panel"><div class="parse-analysis-heading"><div><p class="eyebrow">${evidenceLabel}</p><h4>rDPS calculations</h4></div><small>Raw + granted - received = rDMG; party totals must conserve</small></div>${formulas ? `<div class="rdps-formulas">${formulas}</div>` : ""}${rows ? `<div class="rdps-ledger"><div class="rdps-ledger-head"><strong>Provider and effect ledger</strong><small>${influences.length.toLocaleString()} exact relationship rows</small></div>${rows}</div>` : ""}<p class="parse-analysis-note">* A marked value is a packet-proven known subtotal with at least one unresolved external input. It is never silently promoted to an exact result.</p></section>`;
}

interface GroupedInfluence {
  provider: string;
  effect: string;
  recipients: Set<string>;
  components: Set<string>;
  events: number;
  observedDamage: bigint;
  attributed: bigint;
  allocated: boolean;
  incomplete: boolean;
}

function groupInfluences(
  influences: PublicRdpsInfluence[],
  effects: PublicRdpsEffectPresentation[],
  participants: AnalysisParticipant[],
  presentation?: ParsePresentationCatalog,
): GroupedInfluence[] {
  const actorNames = new Map(participants.map((actor) => [actor.actor_id, participantName(actor)]));
  const effectNames = new Map(effects.map((effect) => [effect.effect_id, effect.presentation_name]));
  const groups = new Map<string, GroupedInfluence>();
  for (const influence of influences) {
    const key = `${influence.provider_actor_id}\0${influence.effect_id}`;
    const group = groups.get(key) ?? {
      provider: actorNames.get(influence.provider_actor_id) ?? `Player ${influence.provider_actor_id}`,
      effect: localizedEffectName(
        presentation,
        influence.effect_id,
        effectNames.get(influence.effect_id) ?? null,
      ),
      recipients: new Set<string>(),
      components: new Set<string>(),
      events: 0,
      observedDamage: 0n,
      attributed: 0n,
      allocated: true,
      incomplete: false,
    };
    group.recipients.add(actorNames.get(influence.recipient_actor_id) ?? influence.recipient_actor_id);
    if (influence.attribution_component) {
      group.components.add(humanizeAttributionComponent(influence.attribution_component));
    }
    group.events += influence.damage_event_count;
    group.observedDamage += parseInteger(influence.observed_damage) ?? 0n;
    const attributed = influence.attributed_rdps == null ? null : parseInteger(influence.attributed_rdps);
    if (attributed == null) group.allocated = false;
    else group.attributed += attributed;
    group.incomplete ||= !influence.complete_effect || !influence.damage_context_complete || attributed == null;
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) => compareBigInt(right.attributed, left.attributed));
}

export function humanizeAttributionComponent(component: string): string {
  const cleaned = component
    .replace(/\s*\((?:actions?\s*)?\d+(?:[\s/,]+\d+)*\)/giu, "")
    .replace(/\b(?:effect|action)\s+\d+(?:[\s/,]+\d+)*\b/giu, "")
    .replace(/[-_]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return cleaned || "complete effect";
}

function renderEvidenceCoverage(
  report: PublicParseReport,
  run: PublicRun,
  reconciliation: PublicRunReconciliation | null,
  participants: AnalysisParticipant[],
  reconciled: boolean,
): string {
  if (!reconciliation) {
    return `<section class="parse-analysis-panel"><div class="parse-analysis-heading"><div><p class="eyebrow">Proof boundary</p><h4>Evidence coverage</h4></div><span class="status-chip neutral">Single vantage</span></div><div class="evidence-metrics">${metric("Reports", "1")}${metric("Canonical events", report.verification.event_count.toLocaleString())}${metric("Data gaps", run.data_gap_count.toLocaleString())}${metric("Attribution", run.rdps_status === "complete" ? "Locally complete" : "Awaiting more vantage points")}</div><p class="parse-analysis-note">This is a server replay of one sealed observer. Additional uploads from the exact same game instance can supply remote state without duplicating combat damage.</p></section>`;
  }
  const namesByCharacter = new Map(participants.flatMap((actor) => actor.character_id ? [[actor.character_id, participantName(actor)] as const] : []));
  const characters = reconciliation.characters
    .map((character) => `<li><span><strong>${escapeHtml(namesByCharacter.get(character.character_id) ?? `UID ${character.character_id}`)}</strong><small>${escapeHtml(title(character.disposition))}</small></span><span><strong>${character.state_witness_count.toLocaleString()}</strong><small>state witnesses · ${character.game_time_aligned_state_witness_count.toLocaleString()} aligned</small></span></li>`)
    .join("");
  const blockers = reconciliation.state_replay_blockers.length
    ? `<div class="evidence-blockers"><strong>Still unresolved</strong><ul>${reconciliation.state_replay_blockers.map((blocker) => `<li>${escapeHtml(title(blocker))}</li>`).join("")}</ul></div>`
    : "";
  const reports = reconciliation.reports
    .map((source) => `<li><span>${source.canonical_spine ? '<span class="status-chip success">Canonical spine</span>' : '<span class="status-chip neutral">Evidence witness</span>'}</span><code>${escapeHtml(source.report_id)}</code><small>${source.local_profile_witnesses.length} local profile / ${source.local_state_witnesses.length} state witnesses</small></li>`)
    .join("");
  return `<section class="parse-analysis-panel"><div class="parse-analysis-heading"><div><p class="eyebrow">Proof boundary</p><h4>Evidence coverage</h4></div><span class="status-chip ${reconciled ? "success" : "neutral"}">${reconciled ? "Reconciled" : "More evidence needed"}</span></div><div class="evidence-metrics">${metric("Reports", reconciliation.reports.length.toLocaleString())}${metric("Local vantage", `${reconciliation.local_vantage_character_count}/${reconciliation.participant_character_count}`)}${metric("Replay readiness", title(reconciliation.state_replay_readiness))}${metric("Conservation", reconciliation.conservation?.conserved ? "Passed" : "Pending")}</div>${blockers}<div class="evidence-grid"><div><h5>Character coverage</h5><ul class="evidence-character-list">${characters}</ul></div><details><summary>Source reports and provenance</summary><ul class="evidence-report-list">${reports}</ul>${reconciliation.verified_state_input_sha256 ? `<p><small>Verified state input</small><code>${escapeHtml(reconciliation.verified_state_input_sha256)}</code></p>` : ""}</details></div></section>`;
}

function analysisPanel(titleText: string, body: string): string {
  return `<section class="parse-analysis-panel"><div class="parse-analysis-heading"><h4>${escapeHtml(titleText)}</h4></div><p class="empty-state">${escapeHtml(body)}</p></section>`;
}

function participantName(actor: PublicParticipant): string {
  return actor.display_name ?? (actor.character_id ? `UID ${actor.character_id}` : `Player ${actor.actor_id}`);
}

function formatOptionalNumber(value: number | null): string {
  return value == null ? "?" : formatNumber(value);
}

function parseInteger(value: string): bigint | null {
  return /^-?\d+$/u.test(value) ? BigInt(value) : null;
}

function compareBigInt(left: bigint, right: bigint): number {
  return left === right ? 0 : left > right ? 1 : -1;
}

function formatBigInt(value: bigint): string {
  return new Intl.NumberFormat().format(value);
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatSeconds(value: number): string {
  const seconds = Math.max(0, Math.round(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function damageRate(damage: number, activeCombatMicros: number): number {
  return activeCombatMicros > 0 ? damage / (activeCombatMicros / 1_000_000) : 0;
}

function metric(name: string, value: string): string {
  return `<span><small>${name}</small><strong>${escapeHtml(value)}</strong></span>`;
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
  if (controls.terminal.value) params.set("terminal", controls.terminal.value);
  if (offset) params.set("offset", String(offset));
  const value = params.toString();
  return value ? `&${value}` : "";
}

function filterDemoCatalog(catalog: PublicParseCatalog, controls: ParseControls): PublicParseCatalog {
  const entries = catalog.entries.filter(
    (entry) =>
      (!controls.region.value || controls.region.value === entry.region_id) &&
      (!controls.activity.value ||
        controls.activity.value === activityCategoryId(entry)) &&
      (!controls.scene.value || Number(controls.scene.value) === entry.scene_id) &&
      (!controls.difficulty.value || controls.difficulty.value === entry.difficulty_family) &&
      (!controls.terminal.value || controls.terminal.value === entry.terminal_state),
  );
  return { ...catalog, entries, total_entries: entries.length, next_offset: undefined };
}

export function filterSearch(
  entries: PublicParseCatalogEntry[],
  search: string,
): PublicParseCatalogEntry[] {
  const terms = search.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  if (!terms.length) return entries;
  return entries.filter((entry) => {
    const searchable = [
      entry.scene_name,
      entry.activity_id,
      entry.activity_family_id,
      entry.activity_category_id,
      entry.region_id,
      entry.deployment_id,
      entry.difficulty_family,
      entry.terminal_state,
      entry.report_id,
      entry.run_group_id,
      entry.scene_id == null ? undefined : String(entry.scene_id),
    ]
      .filter((value): value is string => Boolean(value))
      .join(" ")
      .toLocaleLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
}

function formatDifficulty(run: PublicRun): string {
  return (
    [title(run.difficulty_family), run.difficulty_tier ? ` ${run.difficulty_tier}` : ""].join("").trim() ||
    "Difficulty unresolved"
  );
}

function formatDuration(micros: number | null | undefined): string {
  if (micros == null) return "-";
  const seconds = micros / 1_000_000;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(3).padStart(6, "0")}`;
}

function formatNumber(value: number, messages?: MessageResolver): string {
  return messages
    ? messages.number(value, { maximumFractionDigits: 1 })
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
}

function title(value: string | null | undefined): string {
  return value
    ? value.replace(/[_-]+/gu, " ").replace(/\b\w/gu, (letter) => letter.toUpperCase())
    : "";
}

export function activityLabel(value: string): string {
  return activityCategories.find(([id]) => id === value)?.[1] ?? title(value);
}

export function activityCategoryId(entry: PublicParseCatalogEntry): string | undefined {
  if (entry.activity_category_id) return entry.activity_category_id;
  const family = entry.activity_family_id?.toLowerCase();
  if (
    family?.includes("stimen") ||
    (entry.scene_id != null &&
      ((entry.scene_id >= 30_101 && entry.scene_id <= 30_175) ||
        (entry.scene_id >= 31_101 && entry.scene_id <= 31_175) ||
        (entry.scene_id >= 32_101 && entry.scene_id <= 32_160)))
  ) {
    return "stimens";
  }
  return family ? "dungeons" : undefined;
}

function label(value: string, count: number): string {
  return `${title(value)} (${count})`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "The parse catalog could not be loaded.";
}

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing parse browser element ${selector}`);
  return element;
}
