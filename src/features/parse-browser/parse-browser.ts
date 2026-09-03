import {
  isPublicParseCatalog,
  isPublicParseReport,
  isPublicRunReconciliation,
  type PublicParseCatalog,
  type PublicParseCatalogEntry,
  type PublicParseReport,
  type PublicParticipant,
  type PublicRdpsEffectPresentation,
  type PublicRdpsInfluence,
  type PublicReconciledParticipant,
  type PublicRunReconciliation,
  type PublicRun,
  validateReportId,
  validateRunGroupId,
} from "../../contracts/public-parse";
import { createParseDetailModal } from "./parse-detail-modal";
import {
  loadParsePresentation,
  localizedActionName,
  localizedEffectName,
  type ParsePresentationCatalog,
} from "./parse-presentation";

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
      bindOtherSkillDetails(detailHost, skillDetail);
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

function bindOtherSkillDetails(root: ParentNode, modal: ReturnType<typeof createParseDetailModal>): void {
  root.querySelectorAll<HTMLButtonElement>("[data-skill-other-trigger]").forEach((button) => {
    button.addEventListener("click", () => {
      const template = button.parentElement?.querySelector<HTMLTemplateElement>("template[data-skill-other-content]");
      const html = template?.innerHTML.trim();
      if (html) modal.show(html);
    });
  });
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
  reconciliation: PublicRunReconciliation | null,
  reconciliationError: string | null,
  presentation?: ParsePresentationCatalog,
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
  const skillInfluences = reconciled
    ? (reconciliation?.rdps_influences ?? [])
    : (run.rdps_influences ?? []);
  const skillEffects = reconciled
    ? (reconciliation?.rdps_effects ?? [])
    : (run.rdps_effects ?? []);
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
      ${metric("Team eDPS", formatNumber(teamDps))}
      ${metric("Team aDPS", formatNumber(teamEdps))}
      ${reconciled ? metric("Team rDPS", formatNumber(teamRdps ?? 0)) : ""}
      ${metric("Retries", `${run.retry_count} / ${run.boss_retry_count} boss`)}
    </div>
    ${renderReconciliationProof(reconciliation, reconciliationError, reconciled)}
    ${renderSwiftVortexCandidateAudit(reconciliation)}
    <div class="parse-party"><div class="parse-party-head"><strong>Party</strong><small>${run.participants.length} combatants / rDPS ${escapeHtml(run.rdps_status)}</small></div>
      ${participants.map((actor) => renderParticipant(actor, run.active_combat_micros, reconciled)).join("")}
    </div>
    ${renderCombatLoadoutPhases(run, participants, presentation)}
    ${renderRunTimeline(run, participants)}
    ${renderSkillContributions(participants, skillInfluences, skillEffects, presentation)}
    ${renderRdpsCalculations(run, reconciliation, participants, reconciled, presentation)}
    ${renderEvidenceCoverage(report, run, reconciliation, participants, reconciled)}
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
      <span><small>eDPS</small><strong>${formatNumber(actor.dps)}</strong></span>
      <span><small>aDPS</small><strong>${formatNumber(actor.encounter_dps)}</strong></span>
      <span><small>rDMG</small><strong>${actor.rdps_damage == null ? "-" : formatNumber(actor.rdps_damage)}${actor.rdps_incomplete ? "*" : ""}</strong></span>
      <span><small>rDPS</small><strong>${rdps == null ? "-" : formatNumber(rdps)}${actor.rdps_incomplete ? "*" : ""}</strong></span>
      <span><small>Given</small><strong>${actor.contribution_given == null ? "-" : formatNumber(actor.contribution_given)}</strong></span>
      <span><small>Received</small><strong>${actor.contribution_received == null ? "-" : formatNumber(actor.contribution_received)}</strong></span>
      <span><small>Deaths</small><strong>${actor.deaths}</strong></span></div>`;
  }
  return `<div class="parse-party-row"><span><strong>${escapeHtml(actor.display_name ?? `Player ${actor.actor_id}`)}</strong>
    <small>${escapeHtml([actor.class_name, actor.specialization_name].filter(Boolean).join(" / "))}</small></span>
    <span><small>Damage</small><strong>${formatNumber(actor.damage)}</strong></span>
    <span><small>eDPS</small><strong>${formatNumber(actor.dps)}</strong></span>
    <span><small>aDPS</small><strong>${formatNumber(actor.encounter_dps)}</strong></span>
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
        .map((second) => `<circle cx="${x(second).toFixed(2)}" cy="${(top + 10).toFixed(2)}" r="5" fill="${color}" class="parse-death-marker"><title>${escapeHtml(`${participantName(actor)} died at ${formatSeconds(second)}`)}</title></circle>`)
        .join("");
      return `<path d="${path}" fill="none" stroke="${color}" class="parse-timeline-path"><title>${escapeHtml(participantName(actor))} damage per second</title></path>${deaths}`;
    })
    .join("");
  const legend = actors
    .map((actor, index) => `<span><i style="--series-color:${chartColors[index % chartColors.length]}"></i>${escapeHtml(participantName(actor))}</span>`)
    .join("");

  return `<section class="parse-analysis-panel parse-timeline-panel">
    <div class="parse-analysis-heading"><div><p class="eyebrow">Synchronized evidence</p><h4>Run timeline</h4></div><small>One-second damage · diamond markers are deaths</small></div>
    <div class="parse-chart-scroll"><svg class="parse-timeline-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Per-player damage timeline for ${escapeHtml(formatSeconds(durationSeconds))}">
      ${grid}${timeTicks}${segmentMarkers}${paths}
    </svg></div>
    <div class="parse-chart-legend">${legend}</div>
  </section>`;
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
 * semantic skill-ownership view here. A move is allowed only when complete
 * influence rows cover the entire raw Encore action total; missing or
 * overlapping-provider evidence therefore remains on the recipient rather
 * than being guessed.
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
  const movements = new Map<string, Map<string, { damage: bigint; events: number }>>();
  for (const influence of influences) {
    if (
      influence.effect_id !== encoreEffectId ||
      !influence.complete_effect ||
      !influence.damage_context_complete ||
      influence.provider_actor_id === influence.recipient_actor_id ||
      !influence.affected_ability_id ||
      !encoreDamageActionIds.has(influence.affected_ability_id)
    ) continue;
    const amount = influence.attributed_rdps == null
      ? null
      : parseInteger(influence.attributed_rdps);
    if (amount == null || amount <= 0n) continue;
    const key = `${influence.recipient_actor_id}\0${influence.affected_ability_id}`;
    const providers = movements.get(key) ?? new Map();
    const previous = providers.get(influence.provider_actor_id) ?? { damage: 0n, events: 0 };
    providers.set(influence.provider_actor_id, {
      damage: previous.damage + amount,
      events: previous.events + influence.damage_event_count,
    });
    movements.set(key, providers);
  }

  const providerTotals = new Map<string, { damage: bigint; events: number }>();
  for (const [key, providers] of movements) {
    const separator = key.indexOf("\0");
    const recipientId = key.slice(0, separator);
    const actionId = key.slice(separator + 1);
    const recipient = byActor.get(recipientId);
    const ability = recipient?.abilities?.find((candidate) => candidate.ability_id === actionId);
    if (!ability) continue;
    const moved = [...providers.values()].reduce((sum, value) => sum + value.damage, 0n);
    if (!Number.isSafeInteger(ability.damage) || moved !== BigInt(ability.damage)) continue;
    recipient!.abilities = recipient!.abilities!.filter((candidate) => candidate !== ability);
    for (const [providerId, value] of providers) {
      if (!byActor.has(providerId)) continue;
      const previous = providerTotals.get(providerId) ?? { damage: 0n, events: 0 };
      providerTotals.set(providerId, {
        damage: previous.damage + value.damage,
        events: previous.events + value.events,
      });
    }
  }

  const encoreName = effects.find((effect) => effect.effect_id === encoreEffectId)
    ?.presentation_name ?? "Encore";
  for (const [providerId, value] of providerTotals) {
    const provider = byActor.get(providerId);
    const damage = Number(value.damage);
    if (!provider || !Number.isSafeInteger(damage)) continue;
    provider.abilities ??= [];
    provider.abilities.push({
      ability_id: `support-effect:${encoreEffectId}`,
      presentation_name: encoreName,
      presentation_kind: "support-generated-damage",
      icon_asset_path: null,
      presentation_recount_group_id: null,
      presentation_recount_group_name: null,
      casts: 0,
      hits: value.events,
      critical_hits: 0,
      damage,
      effective_damage: damage,
      healing: 0,
      effective_healing: 0,
      shielding: 0,
    });
  }
  return participants.map((actor) => byActor.get(actor.actor_id) ?? actor);
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
    return `<li><span class="parse-skill-drilldown-rank">${index + 8}</span><span><strong>${escapeHtml(name)}</strong><small>${skillCastLabel(ability, castContext)} · ${ability.hits.toLocaleString()} hits · ${criticalRate.toFixed(1)}% crit</small></span><span><strong>${formatNumber(ability.damage)}</strong><small>${percent.toFixed(1)}%</small></span></li>`;
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

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
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
