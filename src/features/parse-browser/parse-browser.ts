import {
  isPublicParseCatalog,
  isPublicParseReport,
  isPublicRunReconciliation,
  type PublicParseCatalog,
  type PublicParseCatalogEntry,
  type PublicParseReport,
  type PublicReconciledParticipant,
  type PublicRunReconciliation,
  type PublicRun,
  validateReportId,
  validateRunGroupId,
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
      let reconciliation: PublicRunReconciliation | null = null;
      let reconciliationError: string | null = null;
      if (configuredApi && run?.run_group_id && validateRunGroupId(run.run_group_id)) {
        try {
          reconciliation = await fetchReconciliation(run.run_group_id);
        } catch (error) {
          reconciliationError = message(error);
        }
      }
      detail.innerHTML = renderReport(report, runIndex, reconciliation, reconciliationError);
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

async function fetchReconciliation(runGroupId: string): Promise<PublicRunReconciliation> {
  if (!validateRunGroupId(runGroupId)) throw new Error("The run group identifier is invalid.");
  return fetchTyped(
    `${configuredApi}/v1/run-groups/${encodeURIComponent(runGroupId)}/reconciliation`,
    isPublicRunReconciliation,
  );
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

function renderReport(
  report: PublicParseReport,
  runIndex: number,
  reconciliation: PublicRunReconciliation | null,
  reconciliationError: string | null,
): string {
  const run = report.runs.find((candidate) => candidate.run_index === runIndex) ?? report.runs[0];
  if (!run) return '<p class="empty-state">This report contains no public run.</p>';
  const teamDps = run.participants.reduce((sum, actor) => sum + actor.dps, 0);
  const teamEdps = run.participants.reduce((sum, actor) => sum + actor.encounter_dps, 0);
  const reconciled = Boolean(
    reconciliation?.status === "reconciled" &&
      reconciliation.attribution_replay_completed &&
      reconciliation.conservation?.conserved &&
      reconciliation.reconciled_participants.length,
  );
  const participants = reconciled ? reconciliation!.reconciled_participants : run.participants;
  const teamRdps = reconciled
    ? damageRate(reconciliation!.conservation!.rdps_damage, run.active_combat_micros)
    : null;
  return `<article class="parse-report">
    <div class="parse-report-heading"><div><p class="eyebrow">${escapeHtml(report.region_id)} / ${escapeHtml(report.verification.tier)}</p>
      <h3>${escapeHtml(run.scene_name ?? run.activity_id ?? `Scene ${run.scene_id ?? "?"}`)}</h3>
      <p>${escapeHtml(formatDifficulty(run))} / ${escapeHtml(title(run.terminal_state))}</p></div>
      ${renderReplayStatus(reconciliation, reconciled)}</div>
    <div class="parse-metrics">
      ${metric("Run", formatDuration(run.total_run_time_micros))}
      ${metric("Game", formatDuration(run.game_time_micros))}
      ${metric("Active", formatDuration(run.active_combat_micros))}
      ${metric("Team DPS", formatNumber(teamDps))}
      ${metric(reconciled ? "Team rDPS" : "Team eDPS", formatNumber(teamRdps ?? teamEdps))}
      ${metric("Retries", `${run.retry_count} / ${run.boss_retry_count} boss`)}
    </div>
    ${renderReconciliationProof(reconciliation, reconciliationError, reconciled)}
    <div class="parse-party"><div class="parse-party-head"><strong>Party</strong><small>${run.participants.length} combatants / rDPS ${escapeHtml(run.rdps_status)}</small></div>
      ${participants.map((actor) => renderParticipant(actor, run.active_combat_micros, reconciled)).join("")}
    </div>
    <p class="parse-proof">Build ${escapeHtml(report.client_build)} / ${report.verification.event_count.toLocaleString()} canonical events / ${run.data_gap_count} data gaps / report ${escapeHtml(report.report_id)}${run.run_group_id ? ` / group ${escapeHtml(run.run_group_id)}` : ""}</p>
  </article>`;
}

function renderParticipant(
  actor: PublicRun["participants"][number] | PublicReconciledParticipant,
  activeCombatMicros: number,
  reconciled: boolean,
): string {
  if (reconciled && "rdps_damage" in actor) {
    const rdps = actor.rdps_damage == null ? null : damageRate(actor.rdps_damage, activeCombatMicros);
    return `<div class="parse-party-row reconciled"><span><strong>${escapeHtml(actor.display_name ?? `Player ${actor.actor_id}`)}</strong>
      <small>${escapeHtml([actor.class_name, actor.specialization_name].filter(Boolean).join(" / "))}</small></span>
      <span><small>Damage</small><strong>${formatNumber(actor.damage)}</strong></span>
      <span><small>DPS</small><strong>${formatNumber(actor.dps)}</strong></span>
      <span><small>rDMG</small><strong>${actor.rdps_damage == null ? "-" : formatNumber(actor.rdps_damage)}${actor.rdps_incomplete ? "*" : ""}</strong></span>
      <span><small>rDPS</small><strong>${rdps == null ? "-" : formatNumber(rdps)}${actor.rdps_incomplete ? "*" : ""}</strong></span>
      <span><small>Given</small><strong>${actor.contribution_given == null ? "-" : formatNumber(actor.contribution_given)}</strong></span>
      <span><small>Received</small><strong>${actor.contribution_received == null ? "-" : formatNumber(actor.contribution_received)}</strong></span>
      <span><small>Deaths</small><strong>${actor.deaths}</strong></span></div>`;
  }
  return `<div class="parse-party-row"><span><strong>${escapeHtml(actor.display_name ?? `Player ${actor.actor_id}`)}</strong>
    <small>${escapeHtml([actor.class_name, actor.specialization_name].filter(Boolean).join(" / "))}</small></span>
    <span><small>Damage</small><strong>${formatNumber(actor.damage)}</strong></span>
    <span><small>DPS</small><strong>${formatNumber(actor.dps)}</strong></span>
    <span><small>eDPS</small><strong>${formatNumber(actor.encounter_dps)}</strong></span>
    <span><small>rDPS</small><strong>${actor.rdps == null ? "-" : formatNumber(actor.rdps)}</strong></span>
    <span><small>Deaths</small><strong>${actor.deaths}</strong></span></div>`;
}

function renderReplayStatus(
  reconciliation: PublicRunReconciliation | null,
  reconciled: boolean,
): string {
  if (reconciled) return '<span class="status-chip success">Cross-vantage reconciled</span>';
  if (reconciliation && reconciliation.reports.length > 1) {
    return '<span class="status-chip neutral">Cross-vantage pending</span>';
  }
  return '<span class="status-chip success">Server replayed</span>';
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
