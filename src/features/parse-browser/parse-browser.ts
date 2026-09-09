import {
  isPublicParseCatalog,
  isPublicParseReport,
  isPublicRunReconciliation,
  type PublicParseCatalog,
  type PublicParseCatalogEntry,
  type PublicParseReport,
  type PublicParticipant,
  type PublicRun,
  type PublicRunReconciliation,
  validateReportId,
} from "../../contracts/public-parse";

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

function renderReport(report: PublicParseReport, runIndex: number, reconciliation?: PublicRunReconciliation): string {
  const run = report.runs.find((candidate) => candidate.run_index === runIndex) ?? report.runs[0];
  if (!run) return '<p class="empty-state">This report contains no public run.</p>';
  const graph = selectCanonicalGraph(run, reconciliation);
  const teamDps = graph.participants.reduce((sum, actor) => sum + actor.dps, 0);
  const teamEdps = graph.participants.reduce((sum, actor) => sum + actor.encounter_dps, 0);
  return `<article class="parse-report">
    <div class="parse-report-heading"><div><p class="eyebrow">${escapeHtml(report.region_id)} / ${escapeHtml(report.verification.tier)}</p>
      <h3>${escapeHtml(run.scene_name ?? run.activity_id ?? `Scene ${run.scene_id ?? "?"}`)}</h3>
      <p>${escapeHtml(formatDifficulty(run))} / ${escapeHtml(title(run.terminal_state))}</p></div>
      <span class="status-chip success">Server replayed</span></div>
    <div class="parse-metrics">
      ${metric("Run", formatDuration(run.total_run_time_micros))}
      ${metric("Game", formatDuration(run.game_time_micros))}
      ${metric("Active", formatDuration(run.active_combat_micros))}
      ${metric("Team DPS", formatNumber(teamDps))}
      ${metric("Team eDPS", formatNumber(teamEdps))}
      ${metric("Retries", `${run.retry_count} / ${run.boss_retry_count} boss`)}
    </div>
    ${renderTimeline(graph)}
    <div class="parse-party"><div class="parse-party-head"><strong>Party</strong><small>${graph.participants.length} combatants / rDPS ${escapeHtml(run.rdps_status)}</small></div>
      ${graph.participants.map(renderParticipant).join("")}
    </div>
    <p class="parse-proof">Build ${escapeHtml(report.client_build)} / ${report.verification.event_count.toLocaleString()} canonical events / ${run.data_gap_count} data gaps / report ${escapeHtml(report.report_id)}${run.run_group_id ? ` / group ${escapeHtml(run.run_group_id)}` : ""}</p>
  </article>`;
}

export interface CanonicalGraphSelection {
  participants: PublicParticipant[];
  timeline: PublicRun["timeline"];
  reconciled: boolean;
  trustLabel: string;
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
      trustLabel: `${reconciliation.reports.length} POVs / conserved replay` };
  }
  return { participants: run.participants, timeline: run.timeline, reconciled: false,
    trustLabel: reconciliation ? "Canonical POV / reconciliation pending" : "Canonical POV / no merged replay" };
}

type TimelineMetric = "damage" | "effective_healing" | "damage_taken";
const palette = ["#52cfff", "#ffcc66", "#91e6a5", "#ff7aa8", "#b8a1ff", "#ff9166", "#7ce3dc", "#d9f06f"];

function renderTimeline(graph: CanonicalGraphSelection): string {
  const { timeline, participants } = graph;
  const plotted = timeline.participant_tracks.flatMap((track, trackIndex) => {
    const actor = participants[track.canonical_participant_index];
    if (!actor || actor.actor_id !== track.actor_id) return [];
    return [{ actor, track, color: palette[trackIndex % palette.length] }];
  });
  const captureSpans = timeline.rdps_influence_spans.filter((span) => span.time_basis === "capture_observed").length;
  const omissions = Object.values(timeline.omitted).reduce((sum, value) => sum + value, 0);
  const coverage = timeline.coverage.authoritative_start && timeline.coverage.authoritative_completion ? "Complete run bounds" : "Partial run bounds";
  const gaps = timeline.coverage.data_gap_count ? `${timeline.coverage.data_gap_count} unpositioned gap${timeline.coverage.data_gap_count === 1 ? "" : "s"}` : "No known gaps";
  return `<section class="combat-timeline" data-timeline-metric="damage" aria-label="Combat timeline">
    <div class="timeline-heading"><div><strong>Combat timeline</strong><small>${escapeHtml(graph.trustLabel)}</small></div>
      <div class="timeline-controls" role="group" aria-label="Timeline metric">
        <button type="button" data-metric="damage" aria-pressed="true">DPS</button>
        <button type="button" data-metric="effective_healing" aria-pressed="false">HPS</button>
        <button type="button" data-metric="damage_taken" aria-pressed="false" title="Damage taken per second">TPS</button>
      </div></div>
    <div class="timeline-trust"><span class="status-chip ${graph.reconciled ? "success" : "neutral"}">${graph.reconciled ? "Reconciled canonical spine" : "Single canonical report"}</span><span>${coverage}</span><span>${gaps}</span></div>
    <div class="timeline-chart-scroll">${renderTimelineSvg(timeline, plotted)}</div>
    <div class="timeline-legend">${plotted.map(({ actor, color }) => `<span><i style="--track:${color}"></i>${escapeHtml(actor.display_name ?? `Player ${actor.actor_id}`)}</span>`).join("")}</div>
    ${(captureSpans || omissions) ? `<p class="timeline-note">${captureSpans ? `${captureSpans} rDPS influence span${captureSpans === 1 ? " is" : "s are"} capture-clock evidence and ${captureSpans === 1 ? "is" : "are"} intentionally not positioned on this run-elapsed graph. ` : ""}${omissions ? `${omissions} bounded item${omissions === 1 ? " was" : "s were"} omitted by the public projection.` : ""}</p>` : ""}
  </section>`;
}

function renderTimelineSvg(timeline: PublicRun["timeline"], plotted: Array<{ actor: PublicParticipant; track: PublicRun["timeline"]["participant_tracks"][number]; color: string }>): string {
  const width = 920, height = 270, left = 48, right = 14, top = 16, bottom = 34;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const seconds = Math.max(1, Math.ceil(timeline.duration_micros / 1_000_000));
  const metrics: TimelineMetric[] = ["damage", "effective_healing", "damage_taken"];
  const groups = metrics.map((metric) => {
    const max = Math.max(1, ...plotted.flatMap(({ actor, track }) => actor.series.slice(0, track.series_point_count).map((point) => point[metric])));
    const lines = plotted.map(({ actor, track, color }) => {
      const sparse = actor.series.slice(0, track.series_point_count).filter((point) => point.second <= seconds);
      const samples: Array<[number, number]> = [[0, 0]];
      sparse.forEach((point, index) => {
        const prior = sparse[index - 1];
        const next = sparse[index + 1];
        if (point.second > 0 && (!prior || prior.second + 1 < point.second)) samples.push([point.second - 1, 0]);
        samples.push([point.second, point[metric]]);
        if (point.second < seconds && (!next || next.second > point.second + 1)) samples.push([point.second + 1, 0]);
      });
      samples.push([seconds, 0]);
      const coords = samples.map(([second, value]) => {
        const x = left + (second / seconds) * plotWidth;
        const y = top + plotHeight - (value / max) * plotHeight;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      });
      return `<polyline points="${coords.join(" ")}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"><title>${escapeHtml(actor.display_name ?? actor.actor_id)} ${metric.replaceAll("_", " ")}</title></polyline>`;
    }).join("");
    return `<g data-series="${metric}"${metric === "damage" ? "" : " hidden"}>${lines}<text x="6" y="22" class="timeline-axis-label">${metric === "damage" ? "DPS" : metric === "effective_healing" ? "HPS" : "TPS"}</text><text x="6" y="${top + plotHeight}" class="timeline-axis-label">0</text></g>`;
  }).join("");
  const deaths = timeline.death_markers.map((marker) => markerLine(marker.at_micros, timeline.duration_micros, left, plotWidth, top, plotHeight, "death", "Death")).join("");
  const loadouts = timeline.loadout_markers.map((marker) => markerLine(marker.at_micros, timeline.duration_micros, left, plotWidth, top, plotHeight, "loadout", "Loadout change")).join("");
  return `<svg class="timeline-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Sparse one-second combat rates over ${formatDuration(timeline.duration_micros)}; death and loadout markers use run elapsed time">
    <line x1="${left}" y1="${top + plotHeight}" x2="${left + plotWidth}" y2="${top + plotHeight}" class="timeline-axis" />
    <text x="${left}" y="${height - 8}" class="timeline-tick">0:00</text><text x="${left + plotWidth}" y="${height - 8}" text-anchor="end" class="timeline-tick">${formatDuration(timeline.duration_micros)}</text>
    ${groups}${loadouts}${deaths}</svg>`;
}

function markerLine(atMicros: number, durationMicros: number, left: number, width: number, top: number, height: number, kind: string, label: string): string {
  const x = left + Math.min(1, atMicros / Math.max(1, durationMicros)) * width;
  return `<line x1="${x.toFixed(1)}" y1="${top}" x2="${x.toFixed(1)}" y2="${top + height}" class="timeline-marker ${kind}"><title>${label} at ${formatDuration(atMicros)}</title></line>`;
}

function wireTimelineControls(root: HTMLElement): void {
  root.querySelectorAll<HTMLButtonElement>("[data-metric]").forEach((button) => button.addEventListener("click", () => {
    const metric = button.dataset.metric;
    const timeline = button.closest<HTMLElement>("[data-timeline-metric]");
    if (!timeline || !metric) return;
    timeline.dataset.timelineMetric = metric;
    timeline.querySelectorAll<HTMLButtonElement>("[data-metric]").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    timeline.querySelectorAll<SVGGElement>("[data-series]").forEach((series) => {
      if (series.dataset.series === metric) series.removeAttribute("hidden");
      else series.setAttribute("hidden", "");
    });
  }));
}

function renderParticipant(actor: PublicRun["participants"][number]): string {
  return `<div class="parse-party-row"><span><strong>${escapeHtml(actor.display_name ?? `Player ${actor.actor_id}`)}</strong>
    <small>${escapeHtml([actor.class_name, actor.specialization_name].filter(Boolean).join(" / "))}</small></span>
    <span><small>Damage</small><strong>${formatNumber(actor.damage)}</strong></span>
    <span><small>DPS</small><strong>${formatNumber(actor.dps)}</strong></span>
    <span><small>eDPS</small><strong>${formatNumber(actor.encounter_dps)}</strong></span>
    <span><small>rDPS</small><strong>${actor.rdps == null ? "-" : formatNumber(actor.rdps)}</strong></span>
    <span><small>Deaths</small><strong>${actor.deaths}</strong></span></div>`;
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

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
}

function title(value: string | null | undefined): string {
  return value ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "";
}

function label(value: string, count: number): string {
  return `${title(value)} (${count})`;
}

function escapeHtml(value: string): string {
  const node = document.createElement("span");
  node.textContent = value;
  return node.innerHTML;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "The parse catalog could not be loaded.";
}

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing parse browser element ${selector}`);
  return element;
}
