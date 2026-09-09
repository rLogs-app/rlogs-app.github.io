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

export function renderReport(report: PublicParseReport, runIndex: number, reconciliation?: PublicRunReconciliation): string {
  const run = report.runs.find((candidate) => candidate.run_index === runIndex) ?? report.runs[0];
  if (!run) return '<p class="empty-state">This report contains no public run.</p>';
  const graph = selectCanonicalGraph(run, reconciliation);
  const teamEdps = graph.participants.reduce((sum, actor) => sum + actor.dps, 0);
  const teamAdps = graph.participants.reduce((sum, actor) => sum + actor.encounter_dps, 0);
  return `<article class="parse-report">
    <div class="parse-report-heading"><div><p class="eyebrow">${escapeHtml(report.region_id)} / ${escapeHtml(report.verification.tier)}</p>
      <h3>${escapeHtml(run.scene_name ?? run.activity_id ?? `Scene ${run.scene_id ?? "?"}`)}</h3>
      <p>${escapeHtml(formatDifficulty(run))} / ${escapeHtml(title(run.terminal_state))}</p></div>
      <span class="status-chip success">Server replayed</span></div>
    <div class="parse-metrics">
      ${metric("Run", formatDuration(run.total_run_time_micros))}
      ${metric("Game", formatDuration(run.game_time_micros))}
      ${metric("Active", formatDuration(run.active_combat_micros))}
      ${metric("Team eDPS", formatNumber(teamEdps))}
      ${metric("Team aDPS", formatNumber(teamAdps))}
      ${metric("Retries", `${run.retry_count} / ${run.boss_retry_count} boss`)}
    </div>
    ${renderTimeline(graph)}
    <div class="parse-party"><div class="parse-party-head"><strong>Party</strong><small>${graph.participants.length} combatants / rDPS ${escapeHtml(run.rdps_status)}</small></div>
      ${graph.participants.map((participant) => renderParticipant(participant, run.rdps_status)).join("")}
    </div>
    <p class="parse-proof">Build ${escapeHtml(report.client_build)} / ${report.verification.event_count.toLocaleString()} canonical events / ${run.data_gap_count} data gaps / report ${escapeHtml(report.report_id)}${run.run_group_id ? ` / group ${escapeHtml(run.run_group_id)}` : ""}</p>
  </article>`;
}

export interface CanonicalGraphSelection {
  participants: PublicParticipant[];
  timeline: PublicRun["timeline"];
  reconciled: boolean;
  trustLabel: string;
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
      trustLabel: `${reconciliation.reports.length} POVs / conserved replay`, rdpsStatus: run.rdps_status };
  }
  return { participants: run.participants, timeline: run.timeline, reconciled: false,
    trustLabel: reconciliation ? "Canonical POV / reconciliation pending" : "Canonical POV / no merged replay", rdpsStatus: run.rdps_status };
}

type TimelineMetric = "damage" | "effective_healing" | "damage_taken" | "rdps_damage";
const palette = ["#52cfff", "#ffcc66", "#91e6a5", "#ff7aa8", "#b8a1ff", "#ff9166", "#7ce3dc", "#d9f06f"];

export function renderTimeline(graph: CanonicalGraphSelection): string {
  const { timeline, participants } = graph;
  const durationSeconds = Math.max(1, Math.ceil(timeline.duration_micros / 1_000_000));
  const plotted = timeline.participant_tracks.flatMap((track, trackIndex) => {
    const actor = participants[track.canonical_participant_index];
    if (!actor || actor.actor_id !== track.actor_id) return [];
    return [{ actor, track, color: palette[trackIndex % palette.length] }];
  });
  const rdpsTracks = plotted.filter(({ actor, track }) => hasCompleteRdpsBuckets(actor.series.slice(0, track.series_point_count)));
  const partialRdps = graph.rdpsStatus.startsWith("partial_") || plotted.some(({ actor, track }) =>
    actor.rdps_incomplete === true || !hasCompleteRdpsBuckets(actor.series.slice(0, track.series_point_count)));
  const rdpsLabel = partialRdps ? "Partial rDPS" : "rDPS";
  const captureSpans = timeline.rdps_influence_spans.filter((span) => span.time_basis === "capture_observed").length;
  const runAlignedSpans = timeline.rdps_influence_spans.filter((span) => span.time_basis === "run_elapsed").length;
  const omissions = Object.values(timeline.omitted).reduce((sum, value) => sum + value, 0);
  const coverage = timeline.coverage.authoritative_start && timeline.coverage.authoritative_completion ? "Complete run bounds" : "Partial run bounds";
  const gaps = timeline.coverage.data_gap_count ? `${timeline.coverage.data_gap_count} unpositioned gap${timeline.coverage.data_gap_count === 1 ? "" : "s"}` : "No known gaps";
  return `<section class="combat-timeline" data-timeline-metric="damage" data-timeline-window="5" data-timeline-rdps-label="${rdpsLabel}" aria-label="Combat timeline">
    <div class="timeline-heading"><div><strong>Combat timeline</strong><small>${escapeHtml(graph.trustLabel)}</small></div>
      <div class="timeline-controls" role="group" aria-label="Timeline metric">
        <button type="button" data-metric="damage" aria-pressed="true">DPS</button>
        <button type="button" data-metric="effective_healing" aria-pressed="false">HPS</button>
        <button type="button" data-metric="damage_taken" aria-pressed="false" title="Damage taken per second">TPS</button>
        ${rdpsTracks.length ? `<button type="button" data-metric="rdps_damage" aria-pressed="false" title="Exact server-published rDPS-adjusted damage per run-elapsed second">${rdpsLabel}</button>` : ""}
      </div></div>
    <div class="timeline-window-controls" role="group" aria-label="Trailing average window">
      <span>Trailing average</span>
      <button type="button" data-window="1" aria-pressed="false">1s</button>
      <button type="button" data-window="5" aria-pressed="true">5s</button>
      <button type="button" data-window="10" aria-pressed="false">10s</button>
    </div>
    <div class="timeline-trust"><span class="status-chip ${graph.reconciled ? "success" : "neutral"}">${graph.reconciled ? "Reconciled canonical spine" : "Single canonical report"}</span><span>${coverage}</span><span>${gaps}</span></div>
    <div class="timeline-playback" role="group" aria-label="Timeline playback">
      <button type="button" data-timeline-play aria-pressed="false">Play</button>
      <input type="range" data-timeline-scrubber min="0" max="${durationSeconds}" step="1" value="0" aria-label="Timeline position" />
    </div>
    <div class="timeline-chart-scroll">${renderTimelineSvg(timeline, plotted, rdpsLabel)}</div>
    <div class="timeline-inspection" data-timeline-inspection aria-live="polite"><strong>Point inspection</strong><span>Hover the graph or focus it and use the arrow keys.</span></div>
    <div class="timeline-legend" role="group" aria-label="Visible participants">${plotted.map(({ actor, color }, participantIndex) => `<button type="button" data-participant-toggle="${participantIndex}" aria-pressed="true" style="--track:${color}"><i></i><span>${escapeHtml(actor.display_name ?? `Player ${actor.actor_id}`)}</span></button>`).join("")}</div>
    ${(rdpsTracks.length || captureSpans || runAlignedSpans || omissions) ? `<p class="timeline-note">${rdpsTracks.length ? `${rdpsLabel} uses exact server-published adjusted-damage buckets; missing buckets are never replaced with ordinary damage. ` : ""}${runAlignedSpans ? `${runAlignedSpans} verified rDPS affected-damage span${runAlignedSpans === 1 ? " is" : "s are"} shown in the evidence lane. ` : ""}${captureSpans ? `${captureSpans} rDPS influence span${captureSpans === 1 ? " is" : "s are"} capture-clock evidence and ${captureSpans === 1 ? "is" : "are"} intentionally not positioned on this run-elapsed graph. ` : ""}${omissions ? `${omissions} bounded item${omissions === 1 ? " was" : "s were"} omitted by the public projection.` : ""}</p>` : ""}
  </section>`;
}

function renderTimelineSvg(timeline: PublicRun["timeline"], plotted: Array<{ actor: PublicParticipant; track: PublicRun["timeline"]["participant_tracks"][number]; color: string }>, rdpsLabel: string): string {
  const width = 920, height = 270, left = 48, right = 14, top = 16, bottom = 34;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const seconds = Math.max(1, Math.ceil(timeline.duration_micros / 1_000_000));
  const hasRdps = plotted.some(({ actor, track }) => hasCompleteRdpsBuckets(actor.series.slice(0, track.series_point_count)));
  const metrics: TimelineMetric[] = ["damage", "effective_healing", "damage_taken", ...(hasRdps ? ["rdps_damage" as const] : [])];
  const windows = [1, 5, 10] as const;
  const groups = metrics.flatMap((metric) => windows.map((windowSeconds) => {
    const curves = plotted.flatMap(({ actor, track, color }, participantIndex) => {
      const points = actor.series.slice(0, track.series_point_count);
      if (metric === "rdps_damage" && !hasCompleteRdpsBuckets(points)) return [];
      return [{ actor, track, color, participantIndex, points: rollingBucketSeries(points, metric, seconds, windowSeconds) }];
    });
    const max = Math.max(1, ...curves.flatMap(({ points }) => points.map(([, value]) => value)));
    const lines = curves.map(({ actor, color, participantIndex, points: samples }) => {
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
      return `<polyline data-participant="${participantIndex}" data-label="${escapeHtml(actor.display_name ?? `Player ${actor.actor_id}`)}"${values} points="${coords.join(" ")}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"><title>${escapeHtml(actor.display_name ?? actor.actor_id)} ${metric === "rdps_damage" ? rdpsLabel : metric.replaceAll("_", " ")}</title></polyline>`;
    }).join("");
    const visible = metric === "damage" && windowSeconds === 5;
    const axisLabel = metric === "damage" ? "DPS" : metric === "effective_healing" ? "HPS" : metric === "damage_taken" ? "TPS" : rdpsLabel;
    return `<g data-series="${metric}" data-series-window="${windowSeconds}"${visible ? "" : " hidden"}>${lines}<text x="6" y="22" class="timeline-axis-label">${axisLabel}</text><text x="6" y="${top + plotHeight}" class="timeline-axis-label">0</text></g>`;
  })).join("");
  const deaths = timeline.death_markers.map((marker) => markerLine(marker.at_micros, timeline.duration_micros, left, plotWidth, top, plotHeight, "death", "Death")).join("");
  const loadouts = timeline.loadout_markers.map((marker) => markerLine(marker.at_micros, timeline.duration_micros, left, plotWidth, top, plotHeight, "loadout", "Loadout change")).join("");
  const rdpsEvidence = timeline.rdps_influence_spans.filter((span) => span.time_basis === "run_elapsed").map((span) => {
    const start = left + Math.min(1, span.start_micros / Math.max(1, timeline.duration_micros)) * plotWidth;
    const end = left + Math.min(1, span.end_micros / Math.max(1, timeline.duration_micros)) * plotWidth;
    return `<rect class="timeline-rdps-evidence" x="${start.toFixed(1)}" y="${top + plotHeight - 6}" width="${Math.max(1.5, end - start).toFixed(1)}" height="6"><title>Verified rDPS affected-damage span ${span.influence_index + 1}: ${formatDuration(span.start_micros)}–${formatDuration(span.end_micros)}</title></rect>`;
  }).join("");
  return `<svg class="timeline-svg" viewBox="0 0 ${width} ${height}" role="group" aria-label="Sparse one-second combat rates over ${formatDuration(timeline.duration_micros)}; death and loadout markers use run elapsed time" data-duration-seconds="${seconds}" data-plot-left="${left}" data-plot-width="${plotWidth}">
    <line x1="${left}" y1="${top + plotHeight}" x2="${left + plotWidth}" y2="${top + plotHeight}" class="timeline-axis" />
    <text x="${left}" y="${height - 8}" class="timeline-tick">0:00</text><text x="${left + plotWidth}" y="${height - 8}" text-anchor="end" class="timeline-tick">${formatDuration(timeline.duration_micros)}</text>
    ${groups}${rdpsEvidence}${loadouts}${deaths}
    <g class="timeline-crosshair" data-timeline-crosshair hidden aria-hidden="true"><line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotHeight}" /></g>
    <rect class="timeline-inspector-hitbox" data-timeline-inspector x="${left}" y="${top}" width="${plotWidth}" height="${plotHeight}" tabindex="0" role="slider" aria-label="Timeline point inspector" aria-valuemin="0" aria-valuemax="${seconds}" aria-valuenow="0" aria-valuetext="0:00" />
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
        play.textContent = "Play";
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
      play.textContent = "Pause";
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
  }));
  const metric = timeline.dataset.timelineMetric === "effective_healing" ? "HPS"
    : timeline.dataset.timelineMetric === "damage_taken" ? "TPS"
    : timeline.dataset.timelineMetric === "rdps_damage" ? timeline.dataset.timelineRdpsLabel ?? "rDPS" : "DPS";
  const time = formatDuration(bounded * 1_000_000);
  const cumulativeLabel = timelineCumulativeRateLabel(metric);
  const details = active.length ? active.map((row) => `<span><i style="--track:${row.color}"></i>${escapeHtml(row.label)} <strong>1s ${formatNumber(row.variants.one)} · 5s ${formatNumber(row.variants.five)} · 10s ${formatNumber(row.variants.ten)} · ${cumulativeLabel} ${formatNumber(row.variants.cumulative)}</strong></span>`).join("") : "<span>No participants selected.</span>";
  output.innerHTML = `<strong>${time}</strong>${details}`;
  inspector.setAttribute("aria-valuetext", `${time}; ${active.map((row) => `${row.label}: 1 second ${formatNumber(row.variants.one)}, 5 second ${formatNumber(row.variants.five)}, 10 second ${formatNumber(row.variants.ten)}, ${cumulativeLabel} to now ${formatNumber(row.variants.cumulative)}`).join("; ") || "no participants selected"}`);
}

export function timelineCumulativeRateLabel(metric: string): string {
  return `run ${metric}`;
}

const timelineSampleCache = new WeakMap<SVGSVGElement, Map<string, Array<[number, number]>>>();

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

function renderParticipant(actor: PublicRun["participants"][number], rdpsStatus: string): string {
  const rdpsLabel = rdpsStatus.startsWith("partial_") || actor.rdps_incomplete === true ? "Partial rDPS" : "rDPS";
  return `<div class="parse-party-row"><span><strong>${escapeHtml(actor.display_name ?? `Player ${actor.actor_id}`)}</strong>
    <small>${escapeHtml([actor.class_name, actor.specialization_name].filter(Boolean).join(" / "))}</small></span>
    <span><small>Damage</small><strong>${formatNumber(actor.damage)}</strong></span>
    <span><small>eDPS</small><strong>${formatNumber(actor.dps)}</strong></span>
    <span><small>aDPS</small><strong>${formatNumber(actor.encounter_dps)}</strong></span>
    <span><small>${rdpsLabel}</small><strong>${actor.rdps == null ? "-" : formatNumber(actor.rdps)}</strong></span>
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
