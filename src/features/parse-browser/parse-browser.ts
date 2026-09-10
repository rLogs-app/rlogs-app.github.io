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
  type PublicTimelineDeathHit,
  type PublicTimelineRateClockPoint,
  validateReportId,
  validateRunGroupId,
} from "../../contracts/public-parse";
import { createParseDetailModal } from "./parse-detail-modal";
import {
  loadParsePresentation,
  localizedActionName,
  localizedEffectName,
  localizedImagineName,
  localizedModuleEffectName,
  localizedModuleName,
  presentationForCatalogEntry,
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
  const catalogPresentation = await presentationRequest;
  const semanticFacetsAuthorized = catalogSemanticFacetsAuthorized(
    catalog.entries,
    catalog.total_entries,
    catalogPresentation,
    catalog.schema_version,
  );

  populateSelect(controls.region, catalog.facets.regions.map((item) => [item.id, label(item.id, item.count)]));
  populateSelect(
    controls.activity,
    semanticFacetsAuthorized ? activityCategories.map(([id, name]) => [
      id,
      label(name, catalog.facets.activities.find((item) => item.id === id)?.count ?? 0),
    ]) : [],
  );
  populateSelect(
    controls.scene,
    catalog.facets.scenes.map((item) => [String(item.id), label(semanticFacetsAuthorized ? item.label ?? `Scene #${item.id}` : `Scene #${item.id}`, item.count)]),
  );
  populateSelect(
    controls.difficulty,
    semanticFacetsAuthorized ? catalog.facets.difficulties.map((item) => [item.id, label(item.id, item.count)]) : [],
  );
  populateSelect(
    controls.terminal,
    catalog.facets.terminal_states.map((item) => [item.id, label(item.id, item.count)]),
  );

  const renderList = (): void => {
    const visibleEntries = filterSearch(catalog.entries, controls.search.value, catalogPresentation, catalog.schema_version);
    list.innerHTML = visibleEntries.length
      ? `${visibleEntries.map((entry) => renderCatalogEntry(entry, catalogPresentation, catalog.schema_version)).join("")}${renderLoadMore(catalog)}`
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
        : filterDemoCatalog(demoSource ?? catalog, controls, semanticFacetsAuthorized);
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

export function renderCatalogEntry(
  entry: PublicParseCatalogEntry,
  presentation?: ParsePresentationCatalog,
  schemaVersion: 6 | 7 = 6,
): string {
  const authorized = Boolean(presentationForCatalogEntry(presentation, schemaVersion, entry));
  const difficulty = authorized
    ? [title(entry.difficulty_family), entry.difficulty_tier ? ` ${entry.difficulty_tier}` : ""].join("").trim()
    : entry.difficulty_tier == null ? "Difficulty unresolved" : `Tier ${entry.difficulty_tier}`;
  return `<button class="parse-row" type="button" data-report-id="${escapeHtml(entry.report_id)}" data-run-index="${entry.run_index}">
    <span><strong>${escapeHtml(authorized ? entry.scene_name ?? entry.activity_id ?? rawCatalogSceneLabel(entry.scene_id) : rawCatalogSceneLabel(entry.scene_id))}</strong>
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
  const associatedReconciliation = reconciliation?.run_group_id === run.run_group_id ? reconciliation : null;
  const graph = selectCanonicalGraph(run, associatedReconciliation ?? undefined);
  const reconciled = graph.reconciled;
  const selectedReconciliation = reconciled ? associatedReconciliation! : null;
  const viewedPresentation = presentationForReport(
    presentation,
    report.deployment_id,
    report.client_build,
    report.protocol_pack_digest,
  );
  const graphPresentationIdentity = selectedReconciliation
    ? coherentReconciliationPresentationIdentity(selectedReconciliation)
    : null;
  const graphPresentation = graphPresentationIdentity
    ? presentationForReport(
      presentation,
      graphPresentationIdentity.deploymentId,
      graphPresentationIdentity.clientBuild,
      graphPresentationIdentity.protocolPackDigest,
    )
    : selectedReconciliation ? undefined : viewedPresentation;
  const associatedPresentationIdentity = associatedReconciliation
    ? coherentReconciliationPresentationIdentity(associatedReconciliation)
    : null;
  const associatedPresentation = associatedPresentationIdentity
    ? presentationForReport(
      presentation,
      associatedPresentationIdentity.deploymentId,
      associatedPresentationIdentity.clientBuild,
      associatedPresentationIdentity.protocolPackDigest,
    )
    : undefined;
  const participants = graph.participants;
  const teamDps = participants.reduce((sum, actor) => sum + actor.dps, 0);
  const teamEdps = participants.reduce((sum, actor) => sum + actor.encounter_dps, 0);
  const skillInfluences = reconciled
    ? (selectedReconciliation?.rdps_influences ?? [])
    : (run.rdps_influences ?? []);
  const skillEffects = reconciled
    ? (selectedReconciliation?.rdps_effects ?? [])
    : (run.rdps_effects ?? []);
  const teamRdps = reconciled
    ? (graph.rdpsGameTimeMicros == null ? null : damageRate(selectedReconciliation!.conservation!.rdps_damage, graph.rdpsGameTimeMicros))
    : null;
  const eventCount = messages.number(report.verification.event_count, { maximumFractionDigits: 0 });
  const gapCount = messages.number(run.data_gap_count, { maximumFractionDigits: 0 });
  const proof = messages.message("parse.report.proof", {
    build: report.client_build,
    events: messages.message(report.verification.event_count === 1 ? "parse.report.proof.events.one" : "parse.report.proof.events.other", { count: eventCount }),
    gaps: messages.message(run.data_gap_count === 1 ? "parse.report.proof.gaps.one" : "parse.report.proof.gaps.other", { count: gapCount }),
    report: report.report_id,
  });
  const sceneHeading = viewedPresentation
    ? run.scene_name ?? run.activity_id ?? rawSceneLabel(run.scene_id)
    : rawSceneLabel(run.scene_id);
  return `<article class="parse-report">
    <div class="parse-report-heading"><div><p class="eyebrow">${escapeHtml(report.region_id)} / ${escapeHtml(report.verification.tier)}</p>
      <h3>${escapeHtml(sceneHeading)}</h3>
      <p>${escapeHtml(formatDifficulty(run, Boolean(viewedPresentation)))} / ${escapeHtml(title(run.terminal_state))}</p></div>
      ${renderReplayStatus(associatedReconciliation, reconciled, messages)}</div>
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
    ${renderReconciliationProof(associatedReconciliation, reconciliationError, reconciled)}
    ${renderSwiftVortexCandidateAudit(associatedReconciliation)}
    ${renderPartyTable(participants, reconciled ? graph.rdpsGameTimeMicros : run.game_time_micros, reconciled, graph.rdpsStatus ?? messages.message("parse.timeline.rdps.partial"), messages, Boolean(graphPresentation))}
    ${renderPartyLoadouts(run, graph.participants, associatedReconciliation ?? undefined, messages, associatedReconciliation ? associatedPresentation : viewedPresentation)}
    ${graph.timeline ? renderTimeline(graph, messages) : renderRunTimeline(run, participants)}
    ${renderSkillContributions(participants, skillInfluences, skillEffects, graphPresentation)}
    ${renderRdpsCalculations(run, selectedReconciliation, participants, reconciled, graphPresentation)}
    ${renderEvidenceCoverage(report, run, associatedReconciliation, participants, reconciled)}
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

function coherentReconciliationPresentationIdentity(reconciliation: PublicRunReconciliation): {
  deploymentId: string;
  clientBuild: string;
  protocolPackDigest: string;
} | null {
  const canonical = reconciliation.reports.find((source) => source.canonical_spine);
  if (!canonical?.deployment_id || !canonical.client_build || !canonical.protocol_pack_digest) return null;
  const coherent = reconciliation.reports.every((source) =>
    source.deployment_id === canonical.deployment_id &&
    source.client_build === canonical.client_build &&
    source.protocol_pack_digest === canonical.protocol_pack_digest);
  return coherent ? {
    deploymentId: canonical.deployment_id,
    clientBuild: canonical.client_build,
    protocolPackDigest: canonical.protocol_pack_digest,
  } : null;
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
  presentationAuthorized = true,
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
    return `<div class="parse-party-row" data-party-row ${data} style="--series-color:${color};--row-fill:${initialWidth.toFixed(2)}%"><span class="parse-party-player"><i></i><span><strong>${escapeHtml(participantName(actor))}</strong><small>${escapeHtml(combatIdentityLabel(actor, presentationAuthorized, ""))}</small></span></span>${cells}</div>`;
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
  if (reconciliation?.state_replay_readiness === "blocked") {
    return '<span class="status-chip warning">Cross-vantage blocked</span>';
  }
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
    ? reconciliation.state_replay_blockers.map(reconciliationBlockerMessage).join(" ")
    : title(reconciliation.state_replay_readiness);
  if (reconciliation.state_replay_readiness === "blocked") {
    return `<div class="reconciliation-proof pending"><strong>Synced POVs cannot be merged</strong><span>${escapeHtml(blockers)} The representative server replay remains shown, and damage from the POV logs was not combined.</span></div>`;
  }
  return `<div class="reconciliation-proof pending"><strong>Cross-vantage replay pending</strong><span>${reconciliation.reports.length} reports / ${reconciliation.local_vantage_character_count} local character witnesses. ${escapeHtml(blockers)}. The representative replay is shown without combining damage.</span></div>`;
}

function reconciliationBlockerMessage(value: string): string {
  const identityMismatch = /^(deployment_id|client_build|protocol_pack_digest)_mismatch:(\d+)$/u.exec(value);
  if (identityMismatch) {
    const [, identity, count] = identityMismatch;
    if (identity === "deployment_id") {
      return `The synced POVs report ${count} different game deployments. Only POVs from one exact deployment can be merged.`;
    }
    if (identity === "client_build") {
      return `The synced POVs report ${count} different game builds. Only POVs from one exact client build can be merged.`;
    }
    return `The synced POVs report ${count} different protocol packs. State evidence decoded with different protocol identities cannot be merged.`;
  }
  if (value === "no_additional_local_vantage") {
    return "The synced reports do not add another player's local POV.";
  }
  return title(value);
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
  presentation?: ParsePresentationCatalog,
): string {
  const summaries = partyLoadoutSummaries(run, participants, reconciliation, messages);
  const exact = summaries.filter((summary) => summary.disposition === "exact").length;
  const summary = messages.message(summaries.length === 1 ? "parse.loadout.summary.one" : "parse.loadout.summary.other", {
    exact: messages.number(exact, { maximumFractionDigits: 0 }), count: messages.number(summaries.length, { maximumFractionDigits: 0 }),
  });
  return `<section class="party-loadouts" aria-label="${escapeHtml(messages.message("parse.loadout.aria"))}">
    <div class="parse-party-head"><strong>${escapeHtml(messages.message("parse.loadout.title"))}</strong><small>${escapeHtml(summary)}</small></div>
    <div class="party-loadout-grid">${summaries.map((loadout) => renderPartyLoadout(loadout, messages, presentation)).join("")}</div>
    <p class="timeline-note">${escapeHtml(messages.message("parse.loadout.selection_note"))}</p>
  </section>`;
}

function renderPartyLoadout(summary: PartyLoadoutSummary, messages: MessageResolver, presentation?: ParsePresentationCatalog): string {
  const name = summary.participant.display_name ?? messages.message("parse.timeline.player", { id: summary.participant.actor_id });
  const className = combatIdentityLabel(summary.participant, Boolean(presentation), messages.message("parse.report.class_unresolved"));
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
    <div class="party-loadout-phases">${phases.map((phase, index) => renderLoadoutPhase(phase, index, phases.length, messages, presentation)).join("")}</div></details>`;
}

function renderLoadoutPhase(phase: PublicCombatLoadoutPhase, index: number, count: number, messages: MessageResolver, presentation?: ParsePresentationCatalog): string {
  const integer = (value: number) => messages.number(value, { maximumFractionDigits: 0 });
  const context = messages.message(phase.in_active_combat ? "parse.loadout.context.active" : index === 0 ? "parse.loadout.context.baseline" : "parse.loadout.context.between");
  const modules = phase.module_snapshot_disposition === "complete"
    ? phase.equipped_modules.length
      ? `<div class="loadout-modules">${phase.equipped_modules.map((module) => {
        const moduleLabel = messages.message("parse.loadout.module", { slot: integer(module.equipped_slot), name: localizedModuleName(presentation, String(module.config_id)) });
        const level = module.level == null ? "" : ` · ${messages.message("parse.loadout.level", { level: integer(module.level) })}`;
        const effects = module.effects.length ? module.effects.map((effect) => {
          const rune = messages.message("parse.loadout.rune", { name: localizedModuleEffectName(presentation, String(effect.effect_id)) });
          return effect.initial_link_points == null ? rune : `${rune} · ${messages.message("parse.loadout.link_points", { points: integer(effect.initial_link_points) })}`;
        }).join(" / ") : messages.message("parse.loadout.no_rune_effects");
        return `<span><strong>${escapeHtml(`${moduleLabel}${level}`)}</strong><small>${escapeHtml(effects)}</small></span>`;
      }).join("")}</div>`
      : `<p class="party-loadout-empty">${escapeHtml(messages.message("parse.loadout.complete_empty"))}</p>`
    : `<p class="party-loadout-empty">${escapeHtml(messages.message(phase.module_snapshot_disposition === "invalid" ? "parse.loadout.invalid" : "parse.loadout.missing"))}</p>`;
  const skills = phase.equipped_skill_ids.length
    ? phase.equipped_skill_ids.map((skillId) => localizedActionName(presentation, skillId, null)).join(", ")
    : messages.message("parse.loadout.none_observed");
  const imagines = phase.equipped_imagines.length ? phase.equipped_imagines.map((imagine) => {
    const item = messages.message("parse.loadout.imagine", { slot: integer(imagine.equipped_slot), id: localizedImagineName(presentation, imagine.skill_id) });
    return imagine.tier == null ? item : `${item} (${messages.message("parse.loadout.tier", { tier: integer(imagine.tier) })})`;
  }).join(", ") : messages.message("parse.loadout.none_observed");
  const phaseLabel = count > 1 ? messages.message("parse.loadout.phase", { number: integer(index + 1) }) : messages.message("parse.loadout.selected_phase");
  const equipment = phase.equipment_count == null ? messages.message("parse.loadout.equipment.unknown")
    : messages.message(phase.equipment_count === 1 ? "parse.loadout.equipment.one" : "parse.loadout.equipment.other", { count: integer(phase.equipment_count) });
  const talents = phase.talent_count == null ? messages.message("parse.loadout.talents.unknown")
    : messages.message(phase.talent_count === 1 ? "parse.loadout.talents.one" : "parse.loadout.talents.other", { count: integer(phase.talent_count) });
  const className = combatIdentityLabel(phase, Boolean(presentation), messages.message("parse.report.class_unresolved"));
  return `<section class="loadout-phase" data-loadout-at-micros="${phase.run_elapsed_micros}"><div class="loadout-phase-heading"><strong>${escapeHtml(phaseLabel)}</strong><small>${escapeHtml(`${context} · ${formatDuration(phase.run_elapsed_micros)}`)}</small></div>
    <p><strong>${escapeHtml(className)}</strong> · ${escapeHtml(equipment)} · ${escapeHtml(talents)}</p>
    ${modules}<p><small>${escapeHtml(messages.message("parse.loadout.skills"))}</small> ${escapeHtml(skills)}</p><p><small>${escapeHtml(messages.message("parse.loadout.imagines"))}</small> ${escapeHtml(imagines)}</p></section>`;
}

function combatIdentityLabel(
  value: Pick<PublicParticipant, "class_id" | "class_name" | "specialization_id" | "specialization_name">,
  presentationAuthorized: boolean,
  fallback: string,
): string {
  if (presentationAuthorized) {
    return [value.class_name, value.specialization_name].filter(Boolean).join(" / ") || fallback;
  }
  const raw = [
    value.class_id == null ? null : `Class #${value.class_id}`,
    value.specialization_id == null ? null : `Specialization #${value.specialization_id}`,
  ].filter(Boolean).join(" / ");
  return raw || fallback;
}

export interface CanonicalGraphSelection {
  participants: PublicParticipant[];
  timeline: PublicRun["timeline"];
  loadoutPhaseSources: TimelineLoadoutPhaseSource[];
  reconciled: boolean;
  trustKind: "reconciled" | "pending" | "single";
  contributingReportCount: number;
  /// Null for legacy reconciliation keeps its rDPS label conservatively
  /// partial instead of borrowing status from whichever POV is open.
  rdpsStatus: string | null;
  rdpsGameTimeMicros: number | null;
  /// The clock authorized for rDPS graph rates and cursor playback. Legacy
  /// reconciliations may contain a canonical-POV clock, so they expose none.
  rdpsRateClock: PublicTimelineRateClockPoint[] | null;
}

interface TimelineLoadoutPhaseSource {
  sourceReportId: string;
  phaseIndex: number;
  phase: PublicCombatLoadoutPhase;
}

function timelineLoadoutPhaseSources(sourceReportId: string, phases: PublicCombatLoadoutPhase[]): TimelineLoadoutPhaseSource[] {
  const nextIndexByCharacter = new Map<string, number>();
  return phases.map((phase) => {
    const phaseIndex = nextIndexByCharacter.get(phase.character_id) ?? 0;
    nextIndexByCharacter.set(phase.character_id, phaseIndex + 1);
    return { sourceReportId, phaseIndex, phase };
  });
}

export function selectCanonicalGraph(run: PublicRun, reconciliation?: PublicRunReconciliation): CanonicalGraphSelection {
  const reconciliationTimeline = reconciliation?.timeline;
  const usable = Boolean(reconciliation && reconciliation.run_group_id === run.run_group_id && reconciliationTimeline && reconciliation.status === "reconciled" && reconciliation.attribution_replay_completed &&
    reconciliation.conservation?.conserved === true && reconciliation.canonical_spine.report_id === reconciliationTimeline.canonical_report_id &&
    reconciliationTimeline.source === "reconciled_canonical_spine" && reconciliationTimeline.time_basis === "run_elapsed" &&
    reconciliation.reconciled_participants.length > 0 && reconciliationTimeline.participant_tracks.every((track) =>
      reconciliation.reconciled_participants[track.canonical_participant_index]?.actor_id === track.actor_id &&
      track.series_point_count <= (reconciliation.reconciled_participants[track.canonical_participant_index]!.series?.length ?? 0)));
  if (usable && reconciliation && reconciliationTimeline) {
    const replayAuthority = reconciliation.schema_version === 18 &&
      typeof reconciliation.rdps_status === "string" && reconciliation.rdps_status.length > 0;
    const replayGameTimeMicros = replayAuthority ? completeTimelineGameTimeMicros(reconciliationTimeline) : null;
    return { participants: reconciliation.reconciled_participants, timeline: reconciliationTimeline, reconciled: true,
      loadoutPhaseSources: reconciliation.characters.flatMap((character) => character.selected_report_id == null ? []
        : (character.selected_combat_loadout_phases ?? []).map((phase, phaseIndex) => ({
          sourceReportId: character.selected_report_id!, phaseIndex, phase,
        }))),
      trustKind: "reconciled", contributingReportCount: reconciliation.reports.length,
      rdpsStatus: replayAuthority ? reconciliation.rdps_status! : null,
      rdpsGameTimeMicros: replayGameTimeMicros,
      rdpsRateClock: replayGameTimeMicros != null
        ? reconciliationTimeline.rate_clock ?? null : null };
  }
  return { participants: run.participants, timeline: run.timeline, reconciled: false,
    loadoutPhaseSources: run.timeline
      ? timelineLoadoutPhaseSources(run.timeline.canonical_report_id, run.combat_loadout_phases ?? []) : [],
    trustKind: reconciliation ? "pending" : "single", contributingReportCount: reconciliation?.reports.length ?? 1,
    rdpsStatus: run.rdps_status, rdpsGameTimeMicros: run.game_time_micros,
    rdpsRateClock: run.timeline?.rate_clock_complete ? run.timeline.rate_clock ?? null : null };
}

function completeTimelineGameTimeMicros(timeline: NonNullable<PublicRun["timeline"]>): number | null {
  const terminalPoints = Math.ceil(timeline.duration_micros / timeline.series_bucket_micros);
  const rateClock = timeline.rate_clock ?? [];
  if (!timeline.rate_clock_complete || timeline.omitted.rate_clock_points !== 0 || terminalPoints <= 0 ||
      rateClock.length !== terminalPoints) return null;
  const final = rateClock.at(-1);
  return final?.second === terminalPoints - 1 && final.edps_elapsed_micros > 0
    ? final.edps_elapsed_micros : null;
}

type TimelineMetric = "damage" | "effective_healing" | "damage_taken" | "rdps_damage" |
  "rdps_contribution_given" | "rdps_contribution_received";
type RdpsTimelineMetric = Extract<TimelineMetric, `rdps_${string}`>;

function isRdpsTimelineMetric(metric: string): metric is RdpsTimelineMetric {
  return metric === "rdps_damage" || metric === "rdps_contribution_given" || metric === "rdps_contribution_received";
}

function timelineMetricLabel(metric: TimelineMetric, rdpsLabel: string, partialRdps: boolean, messages: MessageResolver): string {
  if (metric === "damage") return messages.message("parse.timeline.metric.damage");
  if (metric === "effective_healing") return messages.message("parse.timeline.metric.healing");
  if (metric === "damage_taken") return messages.message("parse.timeline.metric.taken");
  if (metric === "rdps_damage") return rdpsLabel;
  if (metric === "rdps_contribution_given") return messages.message(partialRdps ? "parse.timeline.metric.given_partial" : "parse.timeline.metric.given");
  return messages.message(partialRdps ? "parse.timeline.metric.received_partial" : "parse.timeline.metric.received");
}
// Twenty distinct hues prevent the color cycle from silently aliasing raid
// members. Four line patterns repeat independently, so color is never the only
// way to distinguish nearby traces.
const palette = [
  "#52cfff", "#ffcc66", "#91e6a5", "#ff7aa8", "#b8a1ff",
  "#ff9166", "#7ce3dc", "#d9f06f", "#6ea8ff", "#f28bc8",
  "#42e3a5", "#ffb86b", "#8dd6ff", "#d5a6ff", "#f4e36f",
  "#67d7c4", "#ff8290", "#9abf72", "#87a0ff", "#e9a0c9",
] as const;
const timelineLinePatterns = ["solid", "long", "dot", "dash-dot"] as const;

export function renderTimeline(graph: CanonicalGraphSelection, messages = createMessageResolver()): string {
  const { timeline, participants } = graph;
  if (!timeline) return "";
  const durationSeconds = timelineMaximumBoundary(timeline.duration_micros);
  const rangeStart = formatDuration(0);
  const rangeEnd = formatDuration(timeline.duration_micros);
  const plotted = timeline.participant_tracks.flatMap((track, trackIndex) => {
    const actor = participants[track.canonical_participant_index];
    if (!actor || actor.actor_id !== track.actor_id) return [];
    return [{ actor, track, color: palette[trackIndex % palette.length], pattern: timelineLinePatterns[trackIndex % timelineLinePatterns.length] }];
  });
  const authorizedRateClock = timeline.rate_clock_complete === true ? graph.rdpsRateClock : null;
  const hasGameTimeClock = Boolean(authorizedRateClock?.length);
  const rdpsTracks = hasGameTimeClock
    ? plotted.filter(({ actor, track }) => hasCompleteRdpsBuckets((actor.series ?? []).slice(0, track.series_point_count)))
    : [];
  const exactCumulativeRdpsTracks = rdpsTracks.filter(({ actor }) => actor.rdps_incomplete === false);
  const partialRdps = graph.rdpsStatus !== "complete" || plotted.some(({ actor, track }) =>
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
  const rateClock = messages.message(hasGameTimeClock
    ? "parse.timeline.clock.exact" : "parse.timeline.clock.unavailable");
  const notes = [
    rdpsTracks.length ? messages.message("parse.timeline.note.rdps_buckets", { label: rdpsLabel }) : "",
    runAlignedSpans ? messages.message(runAlignedSpans === 1 ? "parse.timeline.note.run_span.one" : "parse.timeline.note.run_span.other", { count: count(runAlignedSpans) }) : "",
    captureSpans ? messages.message(captureSpans === 1 ? "parse.timeline.note.capture_span.one" : "parse.timeline.note.capture_span.other", { count: count(captureSpans) }) : "",
    !hasGameTimeClock ? messages.message("parse.timeline.note.clock_unavailable") : "",
    timeline.omitted.series_points ? messages.message("parse.timeline.note.series_truncated") : "",
    omissions ? messages.message(omissions === 1 ? "parse.timeline.note.omissions.one" : "parse.timeline.note.omissions.other", { count: count(omissions) }) : "",
  ].filter(Boolean).join(" ");
  return `<section class="combat-timeline" data-timeline-metric="damage" data-timeline-window="5" data-timeline-viewport-start="0" data-timeline-viewport-end="${durationSeconds}" data-timeline-rdps-label="${escapeHtml(rdpsLabel)}" data-timeline-participant-count="${plotted.length}" data-timeline-exact-rdps-track-count="${exactCumulativeRdpsTracks.length}" data-locale="${escapeHtml(messages.locale)}" aria-label="${escapeHtml(messages.message("parse.timeline.aria"))}">
    <div class="timeline-heading"><div><strong>${escapeHtml(messages.message("parse.timeline.title"))}</strong><small>${escapeHtml(trustLabel)}</small></div>
      <div class="timeline-controls" role="group" aria-label="${escapeHtml(messages.message("parse.timeline.metric_group"))}">
        <button type="button" data-metric="damage" aria-pressed="true">${escapeHtml(messages.message("parse.timeline.metric.damage"))}</button>
        <button type="button" data-metric="effective_healing" aria-pressed="false">${escapeHtml(messages.message("parse.timeline.metric.healing"))}</button>
        <button type="button" data-metric="damage_taken" aria-pressed="false" title="${escapeHtml(messages.message("parse.timeline.metric.taken_title"))}">${escapeHtml(messages.message("parse.timeline.metric.taken"))}</button>
        ${rdpsTracks.length ? `<button type="button" data-metric="rdps_damage" aria-pressed="false" title="${escapeHtml(messages.message("parse.timeline.metric.rdps_title"))}">${escapeHtml(rdpsLabel)}</button>` : ""}
        ${rdpsTracks.length ? `<button type="button" data-metric="rdps_contribution_given" aria-pressed="false" title="${escapeHtml(messages.message("parse.timeline.metric.given_title"))}">${escapeHtml(timelineMetricLabel("rdps_contribution_given", rdpsLabel, partialRdps, messages))}</button>` : ""}
        ${rdpsTracks.length ? `<button type="button" data-metric="rdps_contribution_received" aria-pressed="false" title="${escapeHtml(messages.message("parse.timeline.metric.received_title"))}">${escapeHtml(timelineMetricLabel("rdps_contribution_received", rdpsLabel, partialRdps, messages))}</button>` : ""}
      </div></div>
    <div class="timeline-window-controls" role="group" aria-label="${escapeHtml(messages.message("parse.timeline.window_group"))}">
      <span>${escapeHtml(messages.message("parse.timeline.trailing_average"))}</span>
      <button type="button" data-window="1" aria-pressed="false">${escapeHtml(messages.message("parse.timeline.window.one"))}</button>
      <button type="button" data-window="5" aria-pressed="true">${escapeHtml(messages.message("parse.timeline.window.five"))}</button>
      <button type="button" data-window="10" aria-pressed="false">${escapeHtml(messages.message("parse.timeline.window.ten"))}</button>
    </div>
    <div class="timeline-trust"><span class="status-chip ${graph.reconciled ? "success" : "neutral"}">${escapeHtml(trustChip)}</span><span>${escapeHtml(coverage)}</span><span>${escapeHtml(gaps)}</span><span>${escapeHtml(rateClock)}</span></div>
    <fieldset class="timeline-viewport-controls"><legend>${escapeHtml(messages.message("parse.timeline.viewport_group"))}</legend>
      <label><span>${escapeHtml(messages.message("parse.timeline.viewport_start"))}</span><input type="range" data-timeline-viewport-start min="0" max="${Math.max(0, durationSeconds - 1)}" step="1" value="0" aria-valuetext="${escapeHtml(rangeStart)}" /></label>
      <label><span>${escapeHtml(messages.message("parse.timeline.viewport_end"))}</span><input type="range" data-timeline-viewport-end min="1" max="${durationSeconds}" step="1" value="${durationSeconds}" aria-valuetext="${escapeHtml(rangeEnd)}" /></label>
      <button type="button" data-timeline-viewport-reset disabled>${escapeHtml(messages.message("parse.timeline.viewport_reset"))}</button>
      <output data-timeline-viewport-status aria-live="polite" aria-atomic="true">${escapeHtml(messages.message("parse.timeline.viewport_full", { start: rangeStart, end: rangeEnd }))}</output>
    </fieldset>
    <div class="timeline-playback" role="group" aria-label="${escapeHtml(messages.message("parse.timeline.playback_group"))}">
      <button type="button" data-timeline-play aria-pressed="false">${escapeHtml(messages.message("parse.timeline.play"))}</button>
      <input type="range" data-timeline-scrubber min="0" max="${durationSeconds}" step="1" value="0" aria-label="${escapeHtml(messages.message("parse.timeline.position"))}" />
    </div>
    <div class="timeline-chart-scroll">${renderTimelineSvg(timeline, plotted, graph.loadoutPhaseSources, authorizedRateClock, rdpsLabel, partialRdps, messages)}</div>
    <div class="timeline-death-tooltips">${renderTimelineDeathSummaries(timeline, plotted, messages)}</div>
    <div class="timeline-range-scroll" data-timeline-range></div>
    <div class="timeline-inspection" data-timeline-inspection><strong>${escapeHtml(messages.message("parse.timeline.inspection.title"))}</strong><span>${escapeHtml(messages.message("parse.timeline.inspection.hint"))}</span></div>
    <div class="timeline-events" data-timeline-events></div>
    <output class="timeline-live" data-timeline-live aria-live="polite" aria-atomic="true"></output>
    <div class="timeline-snapshot-scroll" data-timeline-snapshot></div>
    <div class="timeline-participant-toolbar" role="group" aria-label="${escapeHtml(messages.message("parse.timeline.participants"))}">
      <span>${escapeHtml(messages.message("parse.timeline.participants"))}</span>
      <button type="button" data-participant-show-all>${escapeHtml(messages.message("parse.timeline.participants_show_all"))}</button>
      <button type="button" data-participant-clear>${escapeHtml(messages.message("parse.timeline.participants_clear"))}</button>
    </div>
    <div class="timeline-legend" role="group" aria-label="${escapeHtml(messages.message("parse.timeline.participants"))}">${plotted.map(({ actor, color, pattern }, participantIndex) => `<button type="button" data-participant-toggle="${participantIndex}" aria-pressed="true" style="--track:${color}"><i class="line-pattern-${pattern}"></i><span>${escapeHtml(actor.display_name ?? messages.message("parse.timeline.player", { id: actor.actor_id }))}</span></button>`).join("")}</div>
    ${notes ? `<p class="timeline-note">${escapeHtml(notes)}</p>` : ""}
  </section>`;
}

type CombatTimeline = NonNullable<PublicRun["timeline"]>;
type CombatTimelineTrack = CombatTimeline["participant_tracks"][number];
type ParticipantSeriesPoint = NonNullable<PublicParticipant["series"]>[number];

function renderTimelineSvg(timeline: CombatTimeline, plotted: Array<{ actor: PublicParticipant; track: CombatTimelineTrack; color: string; pattern: typeof timelineLinePatterns[number] }>, loadoutPhaseSources: TimelineLoadoutPhaseSource[], rdpsRateClock: PublicTimelineRateClockPoint[] | null, rdpsLabel: string, partialRdps: boolean, messages: MessageResolver): string {
  const width = 1040, height = 320, left = 68, right = 18, top = 22, bottom = 42;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const seconds = Math.max(1, Math.ceil(timeline.duration_micros / 1_000_000));
  const hasRdps = Boolean(rdpsRateClock?.length) && plotted.some(({ actor, track }) => hasCompleteRdpsBuckets((actor.series ?? []).slice(0, track.series_point_count)));
  const metrics: TimelineMetric[] = ["damage", "effective_healing", "damage_taken", ...(hasRdps
    ? ["rdps_damage" as const, "rdps_contribution_given" as const, "rdps_contribution_received" as const] : [])];
  const windows = [1, 5, 10] as const;
  const groups = metrics.flatMap((metric) => windows.map((windowSeconds) => {
    const metricLabel = timelineMetricLabel(metric, rdpsLabel, partialRdps, messages);
    const curves = plotted.flatMap(({ actor, track, color, pattern }, participantIndex) => {
      const points = (actor.series ?? []).slice(0, track.series_point_count);
      if (isRdpsTimelineMetric(metric) && !hasCompleteRdpsBuckets(points)) return [];
      const buckets = points.flatMap((point) => point[metric] == null ? [] : [[point.second + 1, point[metric]!] as [number, number]]);
      const samples = isRdpsTimelineMetric(metric)
        ? rollingTimelineRateClockSamples(buckets, seconds, windowSeconds, timeline.duration_micros,
          rdpsRateClock)
        : rollingTimelineSamples(buckets, seconds, windowSeconds, timeline.duration_micros);
      return [{ actor, track, color, pattern, participantIndex, buckets, points: samples }];
    });
    const max = niceTimelineScaleMaximum(Math.max(1, ...curves.flatMap(({ points }) => points.map(([, value]) => value))));
    const grid = Array.from({ length: 5 }, (_, index) => {
      const fraction = index / 4;
      const value = max * (1 - fraction);
      const gridY = top + plotHeight * fraction;
      return `<line x1="${left}" y1="${gridY.toFixed(1)}" x2="${left + plotWidth}" y2="${gridY.toFixed(1)}" class="timeline-grid"/><text data-timeline-scale-tick="${index}" x="${left - 10}" y="${(gridY + 4).toFixed(1)}" text-anchor="end" class="timeline-scale-tick">${escapeHtml(formatCompact(value))}</text>`;
    }).join("");
    const lines = curves.map(({ actor, color, pattern, participantIndex, buckets, points: samples }) => {
      const actorLabel = actor.display_name ?? messages.message("parse.timeline.player", { id: actor.actor_id });
      const coords = samples.map(([second, value]) => {
        const x = left + (timelineBoundaryElapsedMicros(timeline.duration_micros, second) / Math.max(1, timeline.duration_micros)) * plotWidth;
        const y = top + plotHeight - (value / max) * plotHeight;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      });
      // The one-second curve is the authoritative inspection source. Rolling curves
      // keep only their SVG coordinates; their samples are derived and cached in the
      // browser instead of duplicating a potentially raid-sized payload three times.
      const values = windowSeconds === 1
        ? ` data-values="${buckets.map(([second, value]) => `${second}:${value}`).join(",")}"`
        : "";
      const cumulativeComplete = !isRdpsTimelineMetric(metric) || actor.rdps_incomplete === false;
      return `<polyline class="timeline-trace line-pattern-${pattern}" data-participant="${participantIndex}" data-label="${escapeHtml(actorLabel)}" data-cumulative-complete="${cumulativeComplete}"${values} points="${coords.join(" ")}" fill="none" stroke="${color}" stroke-width="2.2" vector-effect="non-scaling-stroke"><title>${escapeHtml(actorLabel)} ${escapeHtml(metricLabel)}</title></polyline>`;
    }).join("");
    const visible = metric === "damage" && windowSeconds === 5;
    return `<g data-series="${metric}" data-series-window="${windowSeconds}" data-series-scale-maximum="${max}"${visible ? "" : " hidden"}>${grid}<g data-timeline-viewport-elapsed-geometry clip-path="url(#timeline-plot-clip)"><g data-timeline-scale-geometry>${lines}</g></g><text x="${left}" y="14" class="timeline-axis-label">${escapeHtml(metricLabel)}</text></g>`;
  })).join("");
  const deaths = timeline.death_markers.map((marker, markerIndex) => {
    const matchingActors = plotted.flatMap(({ actor, color }, participantIndex) =>
      actor.actor_id === marker.actor_id ? [{ actor, color, participantIndex }] : []);
    const match = matchingActors.length === 1 ? matchingActors[0] : undefined;
    const player = match?.actor.display_name ?? messages.message("parse.timeline.player", { id: marker.actor_id });
    const boundary = timelineMarkerBoundary(marker.at_micros, timeline.duration_micros, marker.precision);
    const label = marker.precision === "one_second_bucket"
      ? messages.message("parse.timeline.event.death_bucket", {
        player,
        start: formatDuration(marker.at_micros),
        end: formatDuration(Math.min(timeline.duration_micros, marker.at_micros + timeline.series_bucket_micros)),
      })
      : messages.message("parse.timeline.event.death_exact", { player, time: formatDuration(marker.at_micros) });
    const triggerLabel = messages.message("parse.timeline.death.trigger", { death: label });
    return deathMarker(marker.at_micros, timeline.duration_micros, left, plotWidth, top, plotHeight,
      boundary, label, triggerLabel, match?.color ?? "#ff5e82", timelineDeathSummaryId(timeline, markerIndex), match?.participantIndex);
  }).join("");
  const loadouts = timeline.loadout_markers.map((marker) => {
    const matchingActors = plotted.flatMap(({ actor }, participantIndex) =>
      actor.character_id === marker.character_id ? [{ actor, participantIndex }] : []);
    const match = matchingActors.length === 1 ? matchingActors[0] : undefined;
    const player = match
      ? match.actor.display_name ?? messages.message("parse.timeline.character", { id: marker.character_id })
      : messages.message("parse.timeline.character", { id: marker.character_id });
    const sources = loadoutPhaseSources.filter(({ sourceReportId, phaseIndex, phase }) =>
      sourceReportId === marker.source_report_id && phaseIndex === marker.phase_index &&
      phase.character_id === marker.character_id && phase.run_elapsed_micros === marker.at_micros);
    const label = sources.length === 1
      ? messages.message("parse.timeline.event.loadout_phase", {
        player, phase: messages.number(marker.phase_index + 1, { maximumFractionDigits: 0 }), time: formatDuration(marker.at_micros),
      })
      : messages.message("parse.timeline.event.loadout_generic", { player, time: formatDuration(marker.at_micros) });
    return markerLine(marker.at_micros, timeline.duration_micros, left, plotWidth, top, plotHeight, "loadout", timelineMarkerBoundary(marker.at_micros, timeline.duration_micros, "exact_microsecond"), label, match?.participantIndex);
  }).join("");
  const rdpsEvidence = renderRdpsEvidenceLane(timeline, left, plotWidth, top + plotHeight, messages);
  const rateClock = rdpsRateClock?.length
    ? rdpsRateClock.map((point) => `${point.second}:${point.edps_elapsed_micros}:${point.adps_elapsed_micros}`).join(",") : "";
  const timeTicks = Array.from({ length: 5 }, (_, index) => {
    const fraction = index / 4;
    const x = left + plotWidth * fraction;
    const anchor = index === 0 ? "start" : index === 4 ? "end" : "middle";
    return `<line x1="${x.toFixed(1)}" y1="${top}" x2="${x.toFixed(1)}" y2="${top + plotHeight}" class="timeline-time-grid"/><text data-timeline-time-tick="${index}" x="${x.toFixed(1)}" y="${height - 10}" text-anchor="${anchor}" class="timeline-tick">${escapeHtml(formatDuration(timeline.duration_micros * fraction))}</text>`;
  }).join("");
  return `<svg class="timeline-svg" viewBox="0 0 ${width} ${height}" role="group" aria-label="${escapeHtml(messages.message("parse.timeline.graph_aria", { duration: formatDuration(timeline.duration_micros) }))}" data-duration-seconds="${seconds}" data-duration-micros="${timeline.duration_micros}" data-plot-left="${left}" data-plot-width="${plotWidth}" data-plot-top="${top}" data-plot-height="${plotHeight}" data-series-complete="${timeline.omitted.series_points === 0}" data-rate-clock-complete="${rateClock ? "true" : "false"}"${rateClock ? ` data-rate-clock="${rateClock}"` : ""}>
    <defs><clipPath id="timeline-plot-clip"><rect x="${left}" y="${top}" width="${plotWidth}" height="${plotHeight}" /></clipPath></defs>
    ${timeTicks}${groups}<rect class="timeline-inspector-hitbox" data-timeline-inspector x="${left}" y="${top}" width="${plotWidth}" height="${plotHeight}" tabindex="0" role="slider" aria-label="${escapeHtml(messages.message("parse.timeline.inspector_aria"))}" aria-valuemin="0" aria-valuemax="${seconds}" aria-valuenow="0" aria-valuetext="0:00" />
    <g data-timeline-viewport-elapsed-geometry clip-path="url(#timeline-plot-clip)">${rdpsEvidence}${loadouts}${deaths}</g>
    <g class="timeline-crosshair" data-timeline-crosshair hidden aria-hidden="true"><line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotHeight}" /></g>
  </svg>`;
}

export function niceTimelineScaleMaximum(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

export function timelineViewportScaleMaximum(
  series: ReadonlyArray<{ hidden: boolean; points: readonly [number, number][] }>,
  startBoundary: number,
  endBoundary: number,
): number {
  let visibleMaximum = 1;
  for (const track of series) {
    if (track.hidden) continue;
    for (const [boundary, value] of track.points) {
      if (boundary >= startBoundary && boundary <= endBoundary && Number.isFinite(value)) {
        visibleMaximum = Math.max(visibleMaximum, value);
      }
    }
  }
  return niceTimelineScaleMaximum(visibleMaximum);
}

function renderRdpsEvidenceLane(
  timeline: CombatTimeline,
  left: number,
  plotWidth: number,
  plotBottom: number,
  messages: MessageResolver,
): string {
  let spanCount = 0;
  let completeCount = 0;
  let partialCount = 0;
  let earliest = Number.POSITIVE_INFINITY;
  let latest = Number.NEGATIVE_INFINITY;
  const completeGeometry: string[] = [];
  const partialGeometry: string[] = [];
  const duration = Math.max(1, timeline.duration_micros);
  for (const span of timeline.rdps_influence_spans) {
    if (span.time_basis !== "run_elapsed") continue;
    spanCount += 1;
    if (span.complete_lifecycle) completeCount += 1;
    else partialCount += 1;
    if (span.start_micros < earliest) earliest = span.start_micros;
    if (span.end_micros > latest) latest = span.end_micros;
    const startFraction = Math.max(0, Math.min(1, span.start_micros / duration));
    const endFraction = Math.max(startFraction, Math.min(1, span.end_micros / duration));
    const x = left + startFraction * plotWidth;
    const width = Math.max(1.5, (endFraction - startFraction) * plotWidth);
    const y = span.complete_lifecycle ? plotBottom - 11 : plotBottom - 5;
    const geometry = `M${x.toFixed(1)} ${y}h${width.toFixed(1)}v5h-${width.toFixed(1)}Z`;
    (span.complete_lifecycle ? completeGeometry : partialGeometry).push(geometry);
  }
  if (!spanCount) return "";
  const number = (value: number) => messages.number(value, { maximumFractionDigits: 0 });
  const summary = messages.message(spanCount === 1 ? "parse.timeline.evidence_batch.one" : "parse.timeline.evidence_batch.other", {
    count: number(spanCount),
    start: formatDuration(earliest),
    end: formatDuration(latest),
    complete: number(completeCount),
    partial: number(partialCount),
  });
  const path = (lifecycle: "complete" | "partial", geometry: string[], count: number) => {
    if (!count) return "";
    return `<path class="timeline-rdps-evidence ${lifecycle}" data-evidence-lifecycle="${lifecycle}" data-evidence-span-count="${count}" d="${geometry.join("")}" aria-hidden="true"/>`;
  };
  return `<g class="timeline-rdps-evidence-lane" role="img" aria-label="${escapeHtml(summary)}" data-evidence-span-count="${spanCount}" data-evidence-complete-count="${completeCount}" data-evidence-partial-count="${partialCount}"><title>${escapeHtml(summary)}</title>${path("complete", completeGeometry, completeCount)}${path("partial", partialGeometry, partialCount)}</g>`;
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

export interface TimelineViewport {
  startBoundary: number;
  endBoundary: number;
}

export function timelineMaximumBoundary(durationMicros: number): number {
  return Math.max(1, Math.ceil(Math.max(0, durationMicros) / 1_000_000));
}

export function timelineBoundaryElapsedMicros(durationMicros: number, boundary: number): number {
  const maximumBoundary = timelineMaximumBoundary(durationMicros);
  const bounded = Math.max(0, Math.min(maximumBoundary, Math.round(boundary)));
  return bounded === maximumBoundary
    ? Math.max(0, durationMicros)
    : Math.min(Math.max(0, durationMicros), bounded * 1_000_000);
}

export function timelineClosestBoundary(durationMicros: number, elapsedMicros: number): number {
  const maximumBoundary = timelineMaximumBoundary(durationMicros);
  const boundedElapsed = Math.max(0, Math.min(Math.max(0, durationMicros), elapsedMicros));
  const lower = Math.max(0, Math.min(maximumBoundary, Math.floor(boundedElapsed / 1_000_000)));
  const upper = Math.min(maximumBoundary, lower + 1);
  const lowerDistance = Math.abs(boundedElapsed - timelineBoundaryElapsedMicros(durationMicros, lower));
  const upperDistance = Math.abs(timelineBoundaryElapsedMicros(durationMicros, upper) - boundedElapsed);
  return upperDistance <= lowerDistance ? upper : lower;
}

export function clampTimelineViewport(
  durationMicros: number,
  startBoundary: number,
  endBoundary: number,
  changed: "start" | "end" = "end",
): TimelineViewport {
  const maximumBoundary = timelineMaximumBoundary(durationMicros);
  let start = Math.max(0, Math.min(maximumBoundary - 1, Math.round(Number.isFinite(startBoundary) ? startBoundary : 0)));
  let end = Math.max(1, Math.min(maximumBoundary, Math.round(Number.isFinite(endBoundary) ? endBoundary : maximumBoundary)));
  if (start >= end) {
    if (changed === "start") start = Math.max(0, end - 1);
    else end = Math.min(maximumBoundary, start + 1);
  }
  return { startBoundary: start, endBoundary: end };
}

export function timelineCursorFrame(durationMicros: number, second: number): {
  boundary: number;
  elapsedMicros: number;
  clockIndex: number | null;
} {
  // The last integer boundary represents the exact published endpoint, which
  // can be a fractional second. Its reducer clock entry is still N - 1.
  const maximumBoundary = timelineMaximumBoundary(durationMicros);
  const boundary = Math.max(0, Math.min(maximumBoundary, Math.round(second)));
  return {
    boundary,
    elapsedMicros: timelineBoundaryElapsedMicros(durationMicros, boundary),
    clockIndex: boundary === 0 ? null : boundary - 1,
  };
}

export interface TimelineCursorRateRow {
  variants: { one: number | null; five: number | null; ten: number | null; cumulative: number | null };
  damageRates: { edps: number; adps: number } | null;
  rdps: number | null;
}

export interface TimelineRangeRateRow {
  amount: number | null;
  rate: number | null;
  damageRates: { edps: number | null; adps: number | null } | null;
}

const timelineRangePrefixCache = new WeakMap<readonly [number, number][], Array<[number, number]>>();

function timelineRangeAmount(
  samples: readonly [number, number][],
  startBoundary: number,
  endBoundary: number,
): number {
  let prefix = timelineRangePrefixCache.get(samples);
  if (!prefix) {
    let total = 0;
    prefix = [...samples]
      .sort(([left], [right]) => left - right)
      .map(([boundary, value]) => [boundary, total += value]);
    timelineRangePrefixCache.set(samples, prefix);
  }
  const through = (boundary: number): number => {
    let low = 0, high = prefix!.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (prefix![middle]![0] <= boundary) low = middle + 1;
      else high = middle;
    }
    return low > 0 ? prefix![low - 1]![1] : 0;
  };
  return through(endBoundary) - through(startBoundary);
}

function timelineRateClockFieldAtBoundary(
  rateClock: readonly PublicTimelineRateClockPoint[] | null,
  boundary: number,
  field: "edps_elapsed_micros" | "adps_elapsed_micros",
): number | null {
  if (boundary === 0) return 0;
  const point = rateClock?.[boundary - 1];
  return point?.second === boundary - 1 ? point[field] : null;
}

export function timelineRangeRates(
  metric: TimelineMetric,
  oneSecond: readonly [number, number][],
  rateClock: readonly PublicTimelineRateClockPoint[] | null,
  startBoundary: number,
  endBoundary: number,
  durationMicros: number,
  exactNumerator = true,
): TimelineRangeRateRow {
  const viewport = clampTimelineViewport(durationMicros, startBoundary, endBoundary);
  if (!exactNumerator) return { amount: null, rate: null, damageRates: null };
  const amount = timelineRangeAmount(oneSecond, viewport.startBoundary, viewport.endBoundary);
  const startElapsed = timelineBoundaryElapsedMicros(durationMicros, viewport.startBoundary);
  const endElapsed = timelineBoundaryElapsedMicros(durationMicros, viewport.endBoundary);
  const runElapsed = endElapsed - startElapsed;
  if (metric === "effective_healing" || metric === "damage_taken") {
    return { amount, rate: runElapsed > 0 ? amount * 1_000_000 / runElapsed : null, damageRates: null };
  }
  const edpsStart = timelineRateClockFieldAtBoundary(rateClock, viewport.startBoundary, "edps_elapsed_micros");
  const edpsEnd = timelineRateClockFieldAtBoundary(rateClock, viewport.endBoundary, "edps_elapsed_micros");
  const edpsElapsed = edpsStart == null || edpsEnd == null ? null : edpsEnd - edpsStart;
  if (isRdpsTimelineMetric(metric)) {
    return { amount, rate: edpsElapsed != null && edpsElapsed > 0 ? amount * 1_000_000 / edpsElapsed : null, damageRates: null };
  }
  const adpsStart = timelineRateClockFieldAtBoundary(rateClock, viewport.startBoundary, "adps_elapsed_micros");
  const adpsEnd = timelineRateClockFieldAtBoundary(rateClock, viewport.endBoundary, "adps_elapsed_micros");
  const adpsElapsed = adpsStart == null || adpsEnd == null ? null : adpsEnd - adpsStart;
  return {
    amount,
    rate: null,
    damageRates: {
      edps: edpsElapsed != null && edpsElapsed > 0 ? amount * 1_000_000 / edpsElapsed : null,
      adps: adpsElapsed != null && adpsElapsed > 0 ? amount * 1_000_000 / adpsElapsed : null,
    },
  };
}

export function timelineVisibleRangeTotal(rows: readonly TimelineRangeRateRow[]): TimelineRangeRateRow | null {
  if (!rows.length) return null;
  const sumExact = (select: (row: TimelineRangeRateRow) => number | null): number | null =>
    rows.every((row) => select(row) !== null) ? rows.reduce((sum, row) => sum + select(row)!, 0) : null;
  const damageRates = rows.every((row) => row.damageRates !== null)
    ? {
      edps: rows.every((row) => row.damageRates!.edps !== null)
        ? rows.reduce((sum, row) => sum + row.damageRates!.edps!, 0) : null,
      adps: rows.every((row) => row.damageRates!.adps !== null)
        ? rows.reduce((sum, row) => sum + row.damageRates!.adps!, 0) : null,
    }
    : null;
  return { amount: sumExact((row) => row.amount), rate: sumExact((row) => row.rate), damageRates };
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

export function timelineMarkerBoundary(atMicros: number, durationMicros: number, precision: "exact_microsecond" | "one_second_bucket"): number {
  const boundary = precision === "one_second_bucket"
    ? Math.floor(Math.max(0, atMicros) / 1_000_000) + 1
    : Math.ceil(Math.max(0, atMicros) / 1_000_000);
  return Math.min(timelineMaximumBoundary(durationMicros), boundary);
}

function markerLine(atMicros: number, durationMicros: number, left: number, width: number, top: number, height: number, kind: string, boundary: number, title: string, participant?: number): string {
  const x = left + Math.min(1, atMicros / Math.max(1, durationMicros)) * width;
  const scope = participant === undefined ? "" : ` data-timeline-marker-participant="${participant}"`;
  return `<line x1="${x.toFixed(1)}" y1="${top}" x2="${x.toFixed(1)}" y2="${top + height}" class="timeline-marker ${kind}" data-timeline-marker-boundary="${boundary}" data-timeline-marker-label="${escapeHtml(title)}"${scope}><title>${escapeHtml(title)}</title></line>`;
}

function timelineDeathSummaryId(timeline: CombatTimeline, markerIndex: number): string {
  const report = timeline.canonical_report_id.replace(/[^a-zA-Z0-9_-]/g, "-");
  return `timeline-death-${report}-${timeline.canonical_run_index}-${markerIndex}`;
}

function renderTimelineDeathSummaries(
  timeline: CombatTimeline,
  plotted: Array<{ actor: PublicParticipant; track: CombatTimelineTrack; color: string; pattern: typeof timelineLinePatterns[number] }>,
  messages: MessageResolver,
): string {
  return timeline.death_markers.map((marker, markerIndex) => {
    const matchingActors = plotted.flatMap(({ actor, color }, participantIndex) =>
      actor.actor_id === marker.actor_id ? [{ actor, color, participantIndex }] : []);
    const match = matchingActors.length === 1 ? matchingActors[0] : undefined;
    const player = match?.actor.display_name ?? messages.message("parse.timeline.player", { id: marker.actor_id });
    const title = marker.precision === "one_second_bucket"
      ? messages.message("parse.timeline.event.death_bucket", {
        player,
        start: formatDuration(marker.at_micros),
        end: formatDuration(Math.min(timeline.duration_micros, marker.at_micros + timeline.series_bucket_micros)),
      })
      : messages.message("parse.timeline.event.death_exact", { player, time: formatDuration(marker.at_micros) });
    const scope = match ? ` data-timeline-death-participant="${match.participantIndex}"` : "";
    const body = marker.cause
      ? `<div class="timeline-death-section"><strong>${escapeHtml(messages.message("parse.timeline.death.terminal_hit"))}</strong><ul>${renderTimelineDeathHit(marker.cause.final_hit, messages)}</ul></div>
        <div class="timeline-death-section"><strong>${escapeHtml(messages.message("parse.timeline.death.recent_hits"))}</strong>${marker.cause.prior_hits.length
          ? `<ul>${[...marker.cause.prior_hits].reverse().map((hit) => renderTimelineDeathHit(hit, messages)).join("")}</ul>`
          : `<p>${escapeHtml(messages.message("parse.timeline.death.no_recent_hits"))}</p>`}</div>
        ${marker.cause.prior_hits_truncated ? `<p class="timeline-death-truncated">${escapeHtml(messages.message("parse.timeline.death.truncated"))}</p>` : ""}`
      : `<p>${escapeHtml(messages.message(timeline.schema_version < 4
        ? "parse.timeline.death.legacy_unavailable" : "parse.timeline.death.cause_unavailable"))}</p>`;
    return `<aside class="timeline-death-tooltip" id="${escapeHtml(timelineDeathSummaryId(timeline, markerIndex))}" data-timeline-death-summary${scope} role="tooltip" style="--death-marker:${escapeHtml(match?.color ?? "#ff5e82")}" hidden><strong class="timeline-death-tooltip-title">${escapeHtml(title)}</strong>${body}<small>${escapeHtml(messages.message("parse.timeline.death.dismiss_hint"))}</small></aside>`;
  }).join("");
}

function renderTimelineDeathHit(hit: PublicTimelineDeathHit, messages: MessageResolver): string {
  const details = [
    messages.message("parse.timeline.death.hit_time", { time: formatDuration(hit.at_micros) }),
    messages.message("parse.timeline.death.hit_source", { id: hit.source_actor_id }),
    hit.direct_source_actor_id ? messages.message("parse.timeline.death.hit_direct_source", { id: hit.direct_source_actor_id }) : "",
    hit.ability_id ? messages.message("parse.timeline.death.hit_ability", { id: hit.ability_id })
      : messages.message("parse.timeline.death.hit_ability_unavailable"),
    hit.breakdown_ability_id ? messages.message("parse.timeline.death.hit_breakdown", { id: hit.breakdown_ability_id }) : "",
    hit.critical ? messages.message("parse.timeline.death.hit_critical") : "",
  ].filter(Boolean).map(escapeHtml).join(" · ");
  const damage = messages.message("parse.timeline.death.hit_damage", {
    damage: messages.number(hit.effective_damage, { maximumFractionDigits: 0 }),
    reported: messages.number(hit.reported_damage, { maximumFractionDigits: 0 }),
  });
  return `<li><strong>${escapeHtml(damage)}</strong><span>${details}</span></li>`;
}

function deathMarker(atMicros: number, durationMicros: number, left: number, width: number, top: number, height: number, boundary: number, title: string, triggerTitle: string, color: string, summaryId: string, participant?: number): string {
  const x = left + Math.min(1, atMicros / Math.max(1, durationMicros)) * width;
  const scope = participant === undefined ? "" : ` data-timeline-marker-participant="${participant}"`;
  const label = escapeHtml(title);
  const description = escapeHtml(summaryId);
  return `<g class="timeline-marker death" transform="translate(${x.toFixed(1)} 0)" style="color:${escapeHtml(color)}" data-timeline-marker-boundary="${boundary}" data-timeline-marker-label="${label}" data-timeline-death-trigger aria-label="${escapeHtml(triggerTitle)}" aria-describedby="${description}" aria-controls="${description}" aria-expanded="false" role="button" tabindex="0"${scope}><line class="timeline-marker-line" x1="0" y1="${top}" x2="0" y2="${top + height}" vector-effect="non-scaling-stroke"/><g class="timeline-death-icon" data-timeline-marker-symbol transform="translate(0 ${top + 12})"><rect class="timeline-death-hitbox" x="-12" y="-12" width="24" height="24"/><path class="timeline-death-bones" d="M-7-6L7 7M7-6L-7 7"/><circle cx="-7" cy="-6" r="1.5"/><circle cx="7" cy="7" r="1.5"/><circle cx="7" cy="-6" r="1.5"/><circle cx="-7" cy="7" r="1.5"/><path class="timeline-death-skull" d="M-6-3A6 6 0 1 1 6-3C6 1 4 3 3 3V7H-3V3C-4 3-6 1-6-3Z"/><circle class="timeline-death-eye" cx="-2.3" cy="-2" r="1.25"/><circle class="timeline-death-eye" cx="2.3" cy="-2" r="1.25"/><path class="timeline-death-eye" d="M0 0.5L-1.2 2.5H1.2Z"/></g><title>${label}</title></g>`;
}

function timelineViewportFor(timeline: HTMLElement, durationMicros: number): TimelineViewport {
  return clampTimelineViewport(
    durationMicros,
    Number(timeline.dataset.timelineViewportStart ?? "0"),
    Number(timeline.dataset.timelineViewportEnd ?? timelineMaximumBoundary(durationMicros)),
  );
}

function refreshTimelineScale(timeline: HTMLElement, viewport: TimelineViewport): void {
  const svg = timeline.querySelector<SVGSVGElement>(".timeline-svg");
  if (!svg) return;
  const top = Number(svg.dataset.plotTop);
  const height = Number(svg.dataset.plotHeight);
  const bottom = top + height;
  if (![top, height].every(Number.isFinite) || height <= 0) return;
  const metric = timeline.dataset.timelineMetric ?? "damage";
  const window = timeline.dataset.timelineWindow ?? "5";
  const series = svg.querySelector<SVGGElement>(`[data-series="${metric}"][data-series-window="${window}"]`);
  if (!series) return;
  const originalMaximum = Number(series.dataset.seriesScaleMaximum);
  if (!Number.isFinite(originalMaximum) || originalMaximum <= 0) return;
  const tracks = [...series.querySelectorAll<SVGPolylineElement>(".timeline-trace")].map((track) => ({
    hidden: track.hasAttribute("hidden"),
    points: timelineGraphSamplesFor(svg, metric, window, track.dataset.participant ?? ""),
  }));
  const maximum = Math.min(originalMaximum, timelineViewportScaleMaximum(
    tracks,
    viewport.startBoundary,
    viewport.endBoundary,
  ));
  const scale = originalMaximum / Math.max(1, maximum);
  series.dataset.timelineScaleMaximum = String(maximum);
  series.querySelector<SVGGElement>("[data-timeline-scale-geometry]")
    ?.setAttribute("transform", `matrix(1 0 0 ${scale} 0 ${bottom * (1 - scale)})`);
  series.querySelectorAll<SVGTextElement>("[data-timeline-scale-tick]").forEach((tick) => {
    const index = Number(tick.dataset.timelineScaleTick ?? "0");
    tick.textContent = formatCompact(maximum * (1 - index / 4));
  });
}

function applyTimelineViewport(timeline: HTMLElement, changed: "start" | "end" = "end"): TimelineViewport | null {
  const svg = timeline.querySelector<SVGSVGElement>(".timeline-svg");
  if (!svg) return null;
  const durationMicros = Number(svg.dataset.durationMicros);
  const maximumBoundary = timelineMaximumBoundary(durationMicros);
  const viewport = clampTimelineViewport(
    durationMicros,
    Number(timeline.dataset.timelineViewportStart ?? "0"),
    Number(timeline.dataset.timelineViewportEnd ?? maximumBoundary),
    changed,
  );
  timeline.dataset.timelineViewportStart = String(viewport.startBoundary);
  timeline.dataset.timelineViewportEnd = String(viewport.endBoundary);

  const left = Number(svg.dataset.plotLeft), width = Number(svg.dataset.plotWidth);
  const top = Number(svg.dataset.plotTop);
  const duration = Math.max(1, durationMicros);
  const startElapsed = timelineBoundaryElapsedMicros(durationMicros, viewport.startBoundary);
  const endElapsed = timelineBoundaryElapsedMicros(durationMicros, viewport.endBoundary);
  const elapsedScale = duration / Math.max(1, endElapsed - startElapsed);
  const elapsedOffset = left - elapsedScale * (left + (startElapsed / duration) * width);
  svg.querySelectorAll<SVGGElement>("[data-timeline-viewport-elapsed-geometry]").forEach((geometry) => {
    geometry.setAttribute("transform", `matrix(${elapsedScale} 0 0 1 ${elapsedOffset} 0)`);
  });
  svg.querySelectorAll<SVGGElement>("[data-timeline-marker-symbol]").forEach((symbol) => {
    symbol.setAttribute("transform", `translate(0 ${top + 12}) scale(${(1 / elapsedScale).toFixed(9)} 1)`);
  });
  svg.querySelectorAll<SVGTextElement>("[data-timeline-time-tick]").forEach((tick) => {
    const index = Number(tick.dataset.timelineTimeTick ?? "0");
    const startElapsed = timelineBoundaryElapsedMicros(durationMicros, viewport.startBoundary);
    const endElapsed = timelineBoundaryElapsedMicros(durationMicros, viewport.endBoundary);
    const elapsed = Math.round(startElapsed + (endElapsed - startElapsed) * (index / 4));
    tick.textContent = formatDuration(elapsed);
  });

  const start = timeline.querySelector<HTMLInputElement>("[data-timeline-viewport-start]");
  const end = timeline.querySelector<HTMLInputElement>("[data-timeline-viewport-end]");
  const scrubber = timeline.querySelector<HTMLInputElement>("[data-timeline-scrubber]");
  const inspector = timeline.querySelector<SVGRectElement>("[data-timeline-inspector]");
  if (start) {
    start.value = String(viewport.startBoundary);
    start.max = String(Math.max(0, viewport.endBoundary - 1));
    start.setAttribute("aria-valuetext", formatDuration(timelineBoundaryElapsedMicros(durationMicros, viewport.startBoundary)));
  }
  if (end) {
    end.value = String(viewport.endBoundary);
    end.min = String(Math.min(maximumBoundary, viewport.startBoundary + 1));
    end.setAttribute("aria-valuetext", formatDuration(timelineBoundaryElapsedMicros(durationMicros, viewport.endBoundary)));
  }
  if (scrubber) {
    scrubber.min = String(viewport.startBoundary);
    scrubber.max = String(viewport.endBoundary);
  }
  inspector?.setAttribute("aria-valuemin", String(viewport.startBoundary));
  inspector?.setAttribute("aria-valuemax", String(viewport.endBoundary));

  const messages = createMessageResolver(timeline.dataset.locale);
  const startText = formatDuration(timelineBoundaryElapsedMicros(durationMicros, viewport.startBoundary));
  const endText = formatDuration(timelineBoundaryElapsedMicros(durationMicros, viewport.endBoundary));
  const full = viewport.startBoundary === 0 && viewport.endBoundary === maximumBoundary;
  const status = timeline.querySelector<HTMLOutputElement>("[data-timeline-viewport-status]");
  if (status) status.textContent = messages.message(full ? "parse.timeline.viewport_full" : "parse.timeline.viewport_selected", { start: startText, end: endText });
  const reset = timeline.querySelector<HTMLButtonElement>("[data-timeline-viewport-reset]");
  if (reset) reset.disabled = full;
  refreshTimelineScale(timeline, viewport);
  refreshTimelineRange(timeline);
  return viewport;
}

function closeTimelineDeathSummary(timeline: HTMLElement, trigger?: SVGGraphicsElement): void {
  const triggers = trigger ? [trigger] : [...timeline.querySelectorAll<SVGGraphicsElement>("[data-timeline-death-trigger]")];
  for (const candidate of triggers) {
    candidate.setAttribute("aria-expanded", "false");
    candidate.dataset.timelineDeathPinned = "false";
    const summaryId = candidate.getAttribute("aria-controls");
    const summary = summaryId ? candidate.ownerDocument.getElementById(summaryId) : null;
    if (summary && timeline.contains(summary)) summary.hidden = true;
  }
}

function showTimelineDeathSummary(timeline: HTMLElement, trigger: SVGGraphicsElement): void {
  closeTimelineDeathSummary(timeline);
  const summaryId = trigger.getAttribute("aria-controls");
  const summary = summaryId ? trigger.ownerDocument.getElementById(summaryId) : null;
  if (!summary || !timeline.contains(summary) || trigger.hasAttribute("hidden")) return;
  summary.hidden = false;
  trigger.setAttribute("aria-expanded", "true");
}

function setTimelineParticipantVisibility(timeline: HTMLElement, participant: string, visible: boolean): void {
  timeline.querySelector<HTMLButtonElement>(`[data-participant-toggle="${participant}"]`)
    ?.setAttribute("aria-pressed", String(visible));
  timeline.querySelectorAll<SVGPolylineElement>(`[data-participant="${participant}"]`).forEach((track) => {
    if (visible) track.removeAttribute("hidden");
    else track.setAttribute("hidden", "");
  });
  timeline.querySelectorAll<SVGGraphicsElement>(`.timeline-marker[data-timeline-marker-participant="${participant}"]`).forEach((marker) => {
    if (visible) marker.removeAttribute("hidden");
    else {
      marker.setAttribute("hidden", "");
      marker.classList.remove("is-current");
      const trigger = marker.matches("[data-timeline-death-trigger]") ? marker : marker.querySelector<SVGGraphicsElement>("[data-timeline-death-trigger]");
      if (trigger) closeTimelineDeathSummary(timeline, trigger);
    }
  });
}

function refreshTimelineVisibility(timeline: HTMLElement): void {
  const durationMicros = Number(timeline.querySelector<SVGSVGElement>(".timeline-svg")?.dataset.durationMicros);
  refreshTimelineScale(timeline, timelineViewportFor(timeline, durationMicros));
  refreshTimelineRange(timeline);
  refreshTimelineInspection(timeline);
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
    refreshTimelineScale(timeline, timelineViewportFor(timeline, Number(timeline.querySelector<SVGSVGElement>(".timeline-svg")?.dataset.durationMicros)));
    refreshTimelineRange(timeline);
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
    refreshTimelineScale(timeline, timelineViewportFor(timeline, Number(timeline.querySelector<SVGSVGElement>(".timeline-svg")?.dataset.durationMicros)));
    refreshTimelineInspection(timeline);
  }));
  root.querySelectorAll<SVGGraphicsElement>("[data-timeline-death-trigger]").forEach((trigger) => {
    const timeline = trigger.closest<HTMLElement>("[data-timeline-metric]");
    if (!timeline) return;
    const summaryId = trigger.getAttribute("aria-controls");
    const summary = summaryId ? trigger.ownerDocument.getElementById(summaryId) : null;
    if (!summary || !timeline.contains(summary)) return;
    let pointerInside = false;
    let summaryPointerInside = false;
    let focusInside = false;
    let forcedClosed = false;
    let activationWasExpanded: boolean | null = null;
    let closeTimer: ReturnType<typeof setTimeout> | null = null;
    const cancelClose = () => {
      if (closeTimer !== null) clearTimeout(closeTimer);
      closeTimer = null;
    };
    const scheduleClose = () => {
      cancelClose();
      if (pointerInside || summaryPointerInside || focusInside || trigger.dataset.timelineDeathPinned === "true") return;
      closeTimer = setTimeout(() => {
        closeTimer = null;
        if (!pointerInside && !summaryPointerInside && !focusInside && trigger.dataset.timelineDeathPinned !== "true") {
          closeTimelineDeathSummary(timeline, trigger);
        }
      }, 1_200);
    };
    const open = (pinned = false) => {
      forcedClosed = false;
      cancelClose();
      showTimelineDeathSummary(timeline, trigger);
      if (pinned) trigger.dataset.timelineDeathPinned = "true";
    };
    const toggle = (wasExpanded: boolean) => {
      if (wasExpanded) {
        forcedClosed = true;
        cancelClose();
        closeTimelineDeathSummary(timeline, trigger);
      } else {
        open(true);
      }
    };
    trigger.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "touch") return;
      pointerInside = true;
      if (!forcedClosed) open();
    });
    trigger.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "touch") return;
      pointerInside = false;
      if (event.relatedTarget && summary.contains(event.relatedTarget as Node)) summaryPointerInside = true;
      forcedClosed = false;
      scheduleClose();
    });
    summary.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "touch") return;
      summaryPointerInside = true;
      cancelClose();
    });
    summary.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "touch") return;
      summaryPointerInside = false;
      if (event.relatedTarget && trigger.contains(event.relatedTarget as Node)) pointerInside = true;
      scheduleClose();
    });
    trigger.addEventListener("focus", () => {
      focusInside = true;
      if (!forcedClosed) open();
    });
    trigger.addEventListener("blur", () => {
      focusInside = false;
      forcedClosed = false;
      trigger.dataset.timelineDeathPinned = "false";
      scheduleClose();
    });
    trigger.addEventListener("pointerdown", () => {
      activationWasExpanded = trigger.getAttribute("aria-expanded") === "true";
    });
    trigger.addEventListener("click", () => {
      toggle(activationWasExpanded ?? trigger.getAttribute("aria-expanded") === "true");
      activationWasExpanded = null;
    });
    trigger.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (trigger.getAttribute("aria-expanded") !== "true") return;
        event.preventDefault();
        event.stopPropagation();
        forcedClosed = true;
        cancelClose();
        closeTimelineDeathSummary(timeline, trigger);
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggle(trigger.getAttribute("aria-expanded") === "true");
      }
    });
  });
  root.querySelectorAll<HTMLButtonElement>("[data-participant-toggle]").forEach((button) => {
    const setFocus = (focused: boolean) => {
      const timeline = button.closest<HTMLElement>("[data-timeline-metric]");
      const participant = button.dataset.participantToggle;
      if (!timeline || participant == null) return;
      timeline.querySelectorAll<SVGPolylineElement>(".timeline-trace").forEach((track) => {
        track.classList.toggle("is-focused", focused && track.dataset.participant === participant);
        track.classList.toggle("is-dimmed", focused && track.dataset.participant !== participant);
      });
    };
    button.addEventListener("pointerenter", () => setFocus(true));
    button.addEventListener("pointerleave", () => setFocus(false));
    button.addEventListener("focus", () => setFocus(true));
    button.addEventListener("blur", () => setFocus(false));
    button.addEventListener("click", () => {
      const timeline = button.closest<HTMLElement>("[data-timeline-metric]");
      const participant = button.dataset.participantToggle;
      if (!timeline || participant == null) return;
      const visible = button.getAttribute("aria-pressed") !== "true";
      setTimelineParticipantVisibility(timeline, participant, visible);
      refreshTimelineVisibility(timeline);
    });
  });
  root.querySelectorAll<HTMLButtonElement>("[data-participant-show-all], [data-participant-clear]").forEach((button) => {
    button.addEventListener("click", () => {
      const timeline = button.closest<HTMLElement>("[data-timeline-metric]");
      if (!timeline) return;
      const visible = button.hasAttribute("data-participant-show-all");
      timeline.querySelectorAll<HTMLButtonElement>("[data-participant-toggle]").forEach((participantButton) => {
        const participant = participantButton.dataset.participantToggle;
        if (participant != null) setTimelineParticipantVisibility(timeline, participant, visible);
      });
      refreshTimelineVisibility(timeline);
    });
  });
  root.querySelectorAll<SVGRectElement>("[data-timeline-inspector]").forEach((inspector) => {
    const timeline = inspector.closest<HTMLElement>("[data-timeline-metric]");
    if (!timeline) return;
    const messages = createMessageResolver(timeline.dataset.locale);
    const play = timeline.querySelector<HTMLButtonElement>("[data-timeline-play]");
    const scrubber = timeline.querySelector<HTMLInputElement>("[data-timeline-scrubber]");
    let playing = false;
    let playbackFrame: number | null = null;
    let playbackOriginMillis = 0;
    let playbackOriginElapsedSeconds = 0;
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
      const svg = inspector.ownerSVGElement;
      if (!svg) return stopPlayback();
      const durationMicros = Number(svg.dataset.durationMicros);
      const viewport = timelineViewportFor(timeline, durationMicros);
      if (!Number.isFinite(playbackOriginMillis)) playbackOriginMillis = now;
      const elapsedSeconds = playbackOriginElapsedSeconds + (now - playbackOriginMillis) / 1_000;
      const endElapsedSeconds = timelineBoundaryElapsedMicros(durationMicros, viewport.endBoundary) / 1_000_000;
      const boundedSecond = Math.max(viewport.startBoundary, Math.min(viewport.endBoundary - 1, Math.floor(elapsedSeconds)));
      if (Number(inspector.getAttribute("aria-valuenow") ?? "-1") !== boundedSecond) {
        showTimelineInspection(timeline, boundedSecond);
      }
      if (elapsedSeconds >= endElapsedSeconds) {
        showTimelineInspection(timeline, viewport.endBoundary);
        stopPlayback();
        return;
      }
      playbackFrame = requestAnimationFrame(tickPlayback);
    };
    const startPlayback = () => {
      if (playing || !play) return;
      const svg = inspector.ownerSVGElement;
      if (!svg) return;
      const durationMicros = Number(svg.dataset.durationMicros);
      const viewport = timelineViewportFor(timeline, durationMicros);
      const current = Number(inspector.getAttribute("aria-valuenow") ?? "0");
      const playbackOriginBoundary = current < viewport.startBoundary || current >= viewport.endBoundary
        ? viewport.startBoundary : current;
      playbackOriginElapsedSeconds = timelineBoundaryElapsedMicros(durationMicros, playbackOriginBoundary) / 1_000_000;
      playbackOriginMillis = Number.NaN;
      playing = true;
      play.textContent = messages.message("parse.timeline.pause");
      play.setAttribute("aria-pressed", "true");
      showTimelineInspection(timeline, playbackOriginBoundary);
      playbackFrame = requestAnimationFrame(tickPlayback);
    };
    play?.addEventListener("click", () => playing ? stopPlayback() : startPlayback());
    scrubber?.addEventListener("input", () => {
      stopPlayback();
      showTimelineInspection(timeline, Number(scrubber.value));
    });
    const inspectorSvg = inspector.ownerSVGElement;
    inspectorSvg?.addEventListener("pointermove", (event) => {
      const svg = inspectorSvg;
      const bounds = svg.getBoundingClientRect();
      const left = Number(svg.dataset.plotLeft), plotWidth = Number(svg.dataset.plotWidth);
      const top = Number(svg.dataset.plotTop), plotHeight = Number(svg.dataset.plotHeight);
      const viewBoxWidth = svg.viewBox.baseVal.width || bounds.width;
      const viewBoxHeight = svg.viewBox.baseVal.height || bounds.height;
      const viewX = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * viewBoxWidth;
      const viewY = ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * viewBoxHeight;
      if (viewX < left || viewX > left + plotWidth || viewY < top || viewY > top + plotHeight) return;
      stopPlayback();
      const viewport = timelineViewportFor(timeline, Number(svg.dataset.durationMicros));
      const fraction = Math.max(0, Math.min(1, (viewX - left) / Math.max(1, plotWidth)));
      const startElapsed = timelineBoundaryElapsedMicros(Number(svg.dataset.durationMicros), viewport.startBoundary);
      const endElapsed = timelineBoundaryElapsedMicros(Number(svg.dataset.durationMicros), viewport.endBoundary);
      const second = timelineClosestBoundary(Number(svg.dataset.durationMicros), startElapsed + fraction * (endElapsed - startElapsed));
      showTimelineInspection(timeline, second);
    });
    inspector.addEventListener("focus", () => showTimelineInspection(timeline, Number(inspector.getAttribute("aria-valuenow") ?? "0")));
    inspector.addEventListener("keydown", (event) => {
      const svg = inspector.ownerSVGElement;
      if (!svg) return;
      const viewport = timelineViewportFor(timeline, Number(svg.dataset.durationMicros));
      const current = Number(inspector.getAttribute("aria-valuenow") ?? "0");
      const next = event.key === "ArrowLeft" || event.key === "ArrowDown" ? current - 1
        : event.key === "ArrowRight" || event.key === "ArrowUp" ? current + 1
        : event.key === "Home" ? viewport.startBoundary : event.key === "End" ? viewport.endBoundary : undefined;
      if (next == null) return;
      event.preventDefault();
      stopPlayback();
      showTimelineInspection(timeline, Math.max(viewport.startBoundary, Math.min(viewport.endBoundary, next)), true);
    });
    const start = timeline.querySelector<HTMLInputElement>("[data-timeline-viewport-start]");
    const end = timeline.querySelector<HTMLInputElement>("[data-timeline-viewport-end]");
    const reset = timeline.querySelector<HTMLButtonElement>("[data-timeline-viewport-reset]");
    const updateViewport = (changed: "start" | "end") => {
      stopPlayback();
      if (start) timeline.dataset.timelineViewportStart = start.value;
      if (end) timeline.dataset.timelineViewportEnd = end.value;
      const viewport = applyTimelineViewport(timeline, changed);
      if (!viewport) return;
      const current = Number(inspector.getAttribute("aria-valuenow") ?? "0");
      showTimelineInspection(timeline, Math.max(viewport.startBoundary, Math.min(viewport.endBoundary, current)));
    };
    start?.addEventListener("input", () => updateViewport("start"));
    end?.addEventListener("input", () => updateViewport("end"));
    reset?.addEventListener("click", () => {
      const svg = inspector.ownerSVGElement;
      if (!svg) return;
      stopPlayback();
      timeline.dataset.timelineViewportStart = "0";
      timeline.dataset.timelineViewportEnd = String(timelineMaximumBoundary(Number(svg.dataset.durationMicros)));
      const viewport = applyTimelineViewport(timeline);
      if (viewport) showTimelineInspection(timeline, Math.max(viewport.startBoundary, Math.min(viewport.endBoundary, Number(inspector.getAttribute("aria-valuenow") ?? "0"))));
    });
    applyTimelineViewport(timeline);
    showTimelineInspection(timeline, 0);
  });
}

function refreshTimelineInspection(timeline: HTMLElement): void {
  const inspector = timeline.querySelector<SVGRectElement>("[data-timeline-inspector]");
  if (inspector && !timeline.querySelector<SVGGElement>("[data-timeline-crosshair]")?.hasAttribute("hidden")) {
    showTimelineInspection(timeline, Number(inspector.getAttribute("aria-valuenow") ?? "0"));
  }
}

interface TimelineRangeDisplayRow extends TimelineRangeRateRow {
  label: string;
  color: string;
}

function refreshTimelineRange(timeline: HTMLElement): void {
  const svg = timeline.querySelector<SVGSVGElement>(".timeline-svg");
  const output = timeline.querySelector<HTMLElement>("[data-timeline-range]");
  if (!svg || !output) return;
  const metric = (timeline.dataset.timelineMetric ?? "damage") as TimelineMetric;
  const viewport = timelineViewportFor(timeline, Number(svg.dataset.durationMicros));
  const rateClock = timelineRateClockFor(svg);
  const rows = [...svg.querySelectorAll<SVGPolylineElement>(`[data-series="${metric}"][data-series-window="1"] polyline:not([hidden])`)].map((line) => {
    const participant = line.dataset.participant ?? "";
    const exactNumerator = svg.dataset.seriesComplete === "true" &&
      (!isRdpsTimelineMetric(metric) || line.dataset.cumulativeComplete === "true");
    return {
      label: line.dataset.label ?? "Player",
      color: line.getAttribute("stroke") ?? "currentColor",
      ...timelineRangeRates(
        metric,
        timelineSamplesFor(svg, metric, "1", participant),
        rateClock,
        viewport.startBoundary,
        viewport.endBoundary,
        Number(svg.dataset.durationMicros),
        exactNumerator,
      ),
    };
  });
  const messages = createMessageResolver(timeline.dataset.locale);
  const start = formatDuration(timelineBoundaryElapsedMicros(Number(svg.dataset.durationMicros), viewport.startBoundary));
  const end = formatDuration(timelineBoundaryElapsedMicros(Number(svg.dataset.durationMicros), viewport.endBoundary));
  output.innerHTML = renderTimelineRangeTable(metric, start, end, rows, timelineVisibleRangeTotal(rows), messages);
}

export function renderTimelineRangeTable(
  metric: TimelineMetric,
  start: string,
  end: string,
  rows: readonly TimelineRangeDisplayRow[],
  visibleTotal: TimelineRangeRateRow | null,
  messages = createMessageResolver(),
): string {
  if (!rows.length || !visibleTotal) return `<p class="timeline-snapshot-empty">${escapeHtml(messages.message("parse.timeline.inspection.none"))}</p>`;
  const columns = metric === "damage"
    ? [
      { label: messages.message("parse.timeline.range.amount.damage"), value: (row: TimelineRangeRateRow) => row.amount },
      { label: messages.message("parse.timeline.snapshot.edps"), value: (row: TimelineRangeRateRow) => row.damageRates?.edps ?? null },
      { label: messages.message("parse.timeline.snapshot.adps"), value: (row: TimelineRangeRateRow) => row.damageRates?.adps ?? null },
    ]
    : [
      { label: messages.message(metric === "effective_healing" ? "parse.timeline.range.amount.healing" : metric === "damage_taken" ? "parse.timeline.range.amount.taken" : metric === "rdps_contribution_given" ? "parse.timeline.range.amount.given" : metric === "rdps_contribution_received" ? "parse.timeline.range.amount.received" : "parse.timeline.range.amount.rdps"), value: (row: TimelineRangeRateRow) => row.amount },
      { label: messages.message(metric === "effective_healing" ? "parse.timeline.metric.healing" : metric === "damage_taken" ? "parse.timeline.metric.taken" : metric === "rdps_contribution_given" ? "parse.timeline.range.rate.given" : metric === "rdps_contribution_received" ? "parse.timeline.range.rate.received" : "parse.timeline.snapshot.rdps"), value: (row: TimelineRangeRateRow) => row.rate },
    ];
  const format = (value: number | null): string => value == null ? "—" : messages.number(value, { maximumFractionDigits: 1 });
  const cells = (row: TimelineRangeRateRow) => columns.map((column) => `<td>${escapeHtml(format(column.value(row)))}</td>`).join("");
  const playerRows = rows.map((row) => `<tr><th scope="row"><i aria-hidden="true" style="--track:${row.color}"></i>${escapeHtml(row.label)}</th>${cells(row)}</tr>`).join("");
  const unavailable = rows.some((row) => row.amount === null || (metric === "damage"
    ? row.damageRates === null || row.damageRates.edps === null || row.damageRates.adps === null
    : row.rate === null));
  return `<table class="timeline-range-table">
    <caption>${escapeHtml(messages.message("parse.timeline.range.caption", { start, end }))}</caption>
    <thead><tr><th scope="col">${escapeHtml(messages.message("parse.timeline.snapshot.player"))}</th>${columns.map((column) => `<th scope="col">${escapeHtml(column.label)}</th>`).join("")}</tr></thead>
    <tbody><tr class="timeline-snapshot-total"><th scope="row">${escapeHtml(messages.message("parse.timeline.inspection.visible_total"))}</th>${cells(visibleTotal)}</tr>${playerRows}</tbody>
  </table>${unavailable ? `<p class="timeline-range-note">${escapeHtml(messages.message("parse.timeline.range.unavailable"))}</p>` : ""}`;
}

function showTimelineInspection(timeline: HTMLElement, second: number, announce = false): void {
  const messages = createMessageResolver(timeline.dataset.locale);
  const svg = timeline.querySelector<SVGSVGElement>(".timeline-svg");
  const inspector = svg?.querySelector<SVGRectElement>("[data-timeline-inspector]");
  const crosshair = svg?.querySelector<SVGGElement>("[data-timeline-crosshair]");
  const output = timeline.querySelector<HTMLElement>("[data-timeline-inspection]");
  if (!svg || !inspector || !crosshair || !output) return;
  const left = Number(svg.dataset.plotLeft), width = Number(svg.dataset.plotWidth);
  const durationMicros = Number(svg.dataset.durationMicros);
  const viewport = timelineViewportFor(timeline, durationMicros);
  const unclampedFrame = timelineCursorFrame(durationMicros, second);
  const bounded = Math.max(viewport.startBoundary, Math.min(viewport.endBoundary, unclampedFrame.boundary));
  const frame = timelineCursorFrame(durationMicros, bounded);
  const startElapsed = timelineBoundaryElapsedMicros(durationMicros, viewport.startBoundary);
  const endElapsed = timelineBoundaryElapsedMicros(durationMicros, viewport.endBoundary);
  const x = left + ((frame.elapsedMicros - startElapsed) / Math.max(1, endElapsed - startElapsed)) * width;
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
    const variants = isRdpsTimelineMetric(metricKey)
      ? (() => {
        const rates = timelineRdpsRateVariantsAtSecond(oneSecond, rateClock, bounded, Number(svg.dataset.durationMicros));
        return line.dataset.cumulativeComplete === "true" ? rates : { ...rates, cumulative: null };
      })()
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
  const selectedMetric = (timeline.dataset.timelineMetric ?? "damage") as TimelineMetric;
  const partialRdps = (timeline.dataset.timelineRdpsLabel ?? messages.message("parse.timeline.rdps.exact")) === messages.message("parse.timeline.rdps.partial");
  const metric = timelineMetricLabel(selectedMetric, timeline.dataset.timelineRdpsLabel ?? messages.message("parse.timeline.rdps.exact"), partialRdps, messages);
  const time = formatDuration(frame.elapsedMicros);
  const eventLabels = [...svg.querySelectorAll<SVGGraphicsElement>("[data-timeline-marker-boundary]")].flatMap((marker) => {
    const current = !marker.hasAttribute("hidden") && Number(marker.dataset.timelineMarkerBoundary) === bounded;
    marker.classList.toggle("is-current", current);
    return current && marker.dataset.timelineMarkerLabel
      ? [marker.dataset.timelineMarkerLabel] : [];
  });
  const cumulative = (row: TimelineCursorRateRow): string => row.damageRates
    ? messages.message("parse.timeline.inspection.edps_adps", { edps: messages.number(row.damageRates.edps, { maximumFractionDigits: 1 }), adps: messages.number(row.damageRates.adps, { maximumFractionDigits: 1 }) })
    : timeline.dataset.timelineMetric === "damage" ? messages.message("parse.timeline.inspection.rate_unavailable")
    : timeline.dataset.timelineMetric === "rdps_damage"
      ? row.rdps == null ? messages.message("parse.timeline.inspection.rdps_unavailable") : messages.message("parse.timeline.inspection.rdps", { rdps: messages.number(row.rdps, { maximumFractionDigits: 1 }) })
      : isRdpsTimelineMetric(timeline.dataset.timelineMetric ?? "damage")
        ? row.variants.cumulative == null ? messages.message("parse.timeline.inspection.transfer_unavailable")
          : messages.message("parse.timeline.inspection.run_rate", { metric, value: messages.number(row.variants.cumulative, { maximumFractionDigits: 1 }) })
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
  const visibleTotal = timelineVisibleTotalAtSecond(active, selectedMetric === "rdps_damage" && allRdpsTracksExact);
  const total = visibleTotal && active.length > 1
    ? `<span class="timeline-inspection-total">${escapeHtml(messages.message("parse.timeline.inspection.visible_total"))} <strong>${escapeHtml(rateLine(visibleTotal))}</strong></span>`
    : "";
  const details = active.length > 1
    ? total
    : active.length === 1
      ? `<span><i style="--track:${active[0]!.color}"></i>${escapeHtml(metric)} <strong>${escapeHtml(rateLine(active[0]!))}</strong></span>`
      : `<span>${escapeHtml(messages.message("parse.timeline.inspection.none"))}</span>`;
  output.innerHTML = `<strong>${time}</strong>${details}`;
  const events = timeline.querySelector<HTMLElement>("[data-timeline-events]");
  if (events) events.innerHTML = eventLabels.length
    ? `<strong>${escapeHtml(messages.message("parse.timeline.events.title"))}</strong><ul>${eventLabels.map((label) => `<li>${escapeHtml(label)}</li>`).join("")}</ul>`
    : "";
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
  const announcement = messages.message("parse.timeline.cursor_announcement", { metric, time });
  const eventAria = eventLabels.length ? `; ${messages.message("parse.timeline.events.title")}: ${eventLabels.join("; ")}` : "";
  inspector.setAttribute("aria-valuetext", `${time}; ${totalAria}${active.map((row) => `${row.label}: ${rateLine(row)}`).join("; ") || messages.message("parse.timeline.inspection.none")}${eventAria}`);
  scrubber?.setAttribute("aria-valuetext", time);
  const live = timeline.querySelector<HTMLOutputElement>("[data-timeline-live]");
  if (announce && live) live.textContent = announcement;
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
const timelineGraphSampleCache = new WeakMap<SVGSVGElement, Map<string, Array<[number, number]>>>();
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

function timelineGraphSamplesFor(svg: SVGSVGElement, metric: string, window: string, participant: string): Array<[number, number]> {
  let cache = timelineGraphSampleCache.get(svg);
  if (!cache) {
    cache = new Map();
    timelineGraphSampleCache.set(svg, cache);
  }
  const key = `${metric}:${window}:${participant}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const oneSecond = timelineSamplesFor(svg, metric, "1", participant);
  const samples = isRdpsTimelineMetric(metric)
    ? rollingTimelineRateClockSamples(
      oneSecond,
      Number(svg.dataset.durationSeconds),
      Number(window),
      Number(svg.dataset.durationMicros),
      timelineRateClockFor(svg),
    )
    : rollingTimelineSamples(
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
    name: localizedActionName(presentation, ability.ability_id, presentation ? ability.presentation_name : null),
    damage: ability.damage,
    castLabel: skillCastLabel(ability, castContext),
    hits: ability.hits,
    criticalHits: ability.critical_hits,
    supportGenerated: Boolean(presentation && ability.presentation_kind === "support-generated-damage"),
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
  return `<details class="parse-skill-card"${actorIndex === 0 ? " open" : ""}><summary><span><strong>${escapeHtml(participantName(actor))}</strong><small>${escapeHtml(combatIdentityLabel(actor, Boolean(presentation), ""))}</small></span><span>${formatNumber(total)} owned damage</span></summary><div class="parse-skill-content"><div class="parse-skill-pie" style="--skill-pie:conic-gradient(${slices.join(",")})" role="img" aria-label="Skill damage shares for ${escapeHtml(participantName(actor))}"><span>${abilities.length}<small>skills</small></span></div><ol>${rows}</ol></div></details>`;
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
    const name = localizedActionName(presentation, ability.ability_id, presentation ? ability.presentation_name : null);
    const observation = presentation && ability.presentation_kind === "support-generated-damage"
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
  const effectNames = new Map(presentation
    ? effects.map((effect) => [effect.effect_id, effect.presentation_name] as const)
    : []);
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
  const blocked = reconciliation.state_replay_readiness === "blocked";
  const blockers = reconciliation.state_replay_blockers.length
    ? `<div class="evidence-blockers"><strong>${blocked ? "Why these POVs cannot merge" : "Still unresolved"}</strong><ul>${reconciliation.state_replay_blockers.map((blocker) => `<li>${escapeHtml(reconciliationBlockerMessage(blocker))}</li>`).join("")}</ul></div>`
    : "";
  const reports = reconciliation.reports
    .map((source) => `<li><span>${source.canonical_spine ? '<span class="status-chip success">Canonical spine</span>' : '<span class="status-chip neutral">Evidence witness</span>'}</span><span><code>${escapeHtml(source.report_id)}</code><small>${escapeHtml(reconciliationSourceRuntimeIdentity(source))}</small><small>${source.local_profile_witnesses.length} local profile / ${source.local_state_witnesses.length} state witnesses</small></span></li>`)
    .join("");
  const stateClass = reconciled ? "success" : blocked ? "warning" : "neutral";
  const stateLabel = reconciled ? "Reconciled" : blocked ? "POV merge blocked" : "More evidence needed";
  return `<section class="parse-analysis-panel"><div class="parse-analysis-heading"><div><p class="eyebrow">Proof boundary</p><h4>Evidence coverage</h4></div><span class="status-chip ${stateClass}">${stateLabel}</span></div><div class="evidence-metrics">${metric("Reports", reconciliation.reports.length.toLocaleString())}${metric("Local vantage", `${reconciliation.local_vantage_character_count}/${reconciliation.participant_character_count}`)}${metric("Replay readiness", title(reconciliation.state_replay_readiness))}${metric("Conservation", reconciliation.conservation?.conserved ? "Passed" : "Pending")}</div>${blockers}<div class="evidence-grid"><div><h5>Character coverage</h5><ul class="evidence-character-list">${characters}</ul></div><details><summary>Source reports and provenance</summary><ul class="evidence-report-list">${reports}</ul>${reconciliation.verified_state_input_sha256 ? `<p><small>Verified state input</small><code>${escapeHtml(reconciliation.verified_state_input_sha256)}</code></p>` : ""}</details></div></section>`;
}

function reconciliationSourceRuntimeIdentity(source: PublicRunReconciliation["reports"][number]): string {
  const deployment = source.deployment_id?.trim();
  const build = source.client_build?.trim();
  if (!deployment || !build) return "Runtime identity unavailable (legacy reconciliation)";
  const protocol = source.protocol_pack_digest.trim();
  const compactProtocol = protocol.length > 24 ? `${protocol.slice(0, 24)}…` : protocol;
  return `${title(deployment)} deployment · build ${build} · protocol ${compactProtocol || "unavailable"}`;
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

function filterDemoCatalog(
  catalog: PublicParseCatalog,
  controls: ParseControls,
  semanticFacetsAuthorized: boolean,
): PublicParseCatalog {
  const entries = catalog.entries.filter(
    (entry) =>
      (!controls.region.value || controls.region.value === entry.region_id) &&
      (!semanticFacetsAuthorized || !controls.activity.value ||
        controls.activity.value === activityCategoryId(entry)) &&
      (!controls.scene.value || Number(controls.scene.value) === entry.scene_id) &&
      (!semanticFacetsAuthorized || !controls.difficulty.value || controls.difficulty.value === entry.difficulty_family) &&
      (!controls.terminal.value || controls.terminal.value === entry.terminal_state),
  );
  return { ...catalog, entries, total_entries: entries.length, next_offset: undefined };
}

export function filterSearch(
  entries: PublicParseCatalogEntry[],
  search: string,
  presentation?: ParsePresentationCatalog,
  schemaVersion: 6 | 7 = 6,
): PublicParseCatalogEntry[] {
  const terms = search.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  if (!terms.length) return entries;
  return entries.filter((entry) => {
    const authorized = Boolean(presentationForCatalogEntry(presentation, schemaVersion, entry));
    const searchable = [
      authorized ? entry.scene_name : undefined,
      authorized ? entry.activity_id : undefined,
      authorized ? entry.activity_family_id : undefined,
      authorized ? entry.activity_category_id : undefined,
      entry.region_id,
      entry.deployment_id,
      authorized ? entry.difficulty_family : undefined,
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

function rawSceneLabel(sceneId: number | null): string {
  return sceneId == null ? "Scene unresolved" : `Scene #${sceneId}`;
}

export function catalogSemanticFacetsAuthorized(
  entries: PublicParseCatalogEntry[],
  totalEntries: number,
  presentation?: ParsePresentationCatalog,
  schemaVersion: 6 | 7 = 6,
): boolean {
  return entries.length > 0 && entries.length === totalEntries && entries.every((entry) =>
    presentationForCatalogEntry(presentation, schemaVersion, entry) != null);
}

function rawCatalogSceneLabel(sceneId: number | undefined): string {
  return sceneId == null ? "Scene unresolved" : `Scene #${sceneId}`;
}

function formatDifficulty(run: PublicRun, presentationAuthorized = true): string {
  if (!presentationAuthorized) {
    return run.difficulty_tier == null ? "Difficulty unresolved" : `Tier ${run.difficulty_tier}`;
  }
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
