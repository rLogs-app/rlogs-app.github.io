import {
  combinationCount,
  DEFAULT_EXACT_COMBINATION_LIMIT,
  extractOptimizerInput,
  optimizerComputeBudget,
} from "./optimizer-data";
import type {
  AttributeCatalogEntry,
  ModuleCandidate,
  ModuleSolution,
  OptimizerCatalog,
  OptimizerWorkerRequest,
  OptimizerWorkerResponse,
  OptimizeRequest,
  OptimizeResponse,
  SearchMode,
} from "./optimizer-types";
import { loadPublishedProfile } from "../profiles/published-profile-loader";

const apiBase = String(import.meta.env.VITE_RLOGS_API_BASE_URL ?? "").replace(/\/$/u, "");
const sessionKey = "rlogs.web-session.v1";
const computeBudget = optimizerComputeBudget(browserDeviceCapabilities());

interface LinkedProfile {
  profile_id: string;
  character_id: string;
  display_name: string | null;
  updated_unix_millis: number;
}

let inventory: ModuleCandidate[] = [];
let currentInstanceIds: string[] = [];
let catalog: OptimizerCatalog | undefined;
let nextWorkerRequestId = 1;
const pendingWorkerCalls = new Map<
  number,
  {
    resolve: (value: OptimizerCatalog | OptimizeResponse) => void;
    reject: (reason: Error) => void;
  }
>();

const optimizerWorker = new Worker(
  new URL("./optimizer-worker.ts", import.meta.url),
  { type: "module" },
);

optimizerWorker.addEventListener(
  "message",
  (event: MessageEvent<OptimizerWorkerResponse>) => {
    const pending = pendingWorkerCalls.get(event.data.id);
    if (!pending) return;
    pendingWorkerCalls.delete(event.data.id);
    if (event.data.ok) {
      pending.resolve(event.data.value);
    } else {
      pending.reject(new Error(event.data.error));
    }
  },
);

optimizerWorker.addEventListener("error", (event) => {
  for (const pending of pendingWorkerCalls.values()) {
    pending.reject(new Error(event.message || "Optimizer worker failed."));
  }
  pendingWorkerCalls.clear();
});

export async function mountModuleOptimizer(): Promise<void> {
  bindControls();
  try {
    catalog = (await callWorker({ kind: "catalog" })) as OptimizerCatalog;
    renderCatalog(catalog);
    setEngineState("valid", "Rust + WASM ready");
    await loadSyncedInventory();
  } catch (error) {
    setEngineState("invalid", "Engine unavailable");
    setRunStatus(errorMessage(error), true);
    setInventoryStatus("The browser optimizer could not initialize.");
  }
}

function bindControls(): void {
  requiredElement<HTMLSelectElement>("optimizer-profile-select").addEventListener(
    "change",
    (event) => void loadPublishedInventory((event.currentTarget as HTMLSelectElement).value),
  );
  requiredElement<HTMLButtonElement>("run-optimizer").addEventListener(
    "click",
    () => void runOptimizer(),
  );
  requiredElement<HTMLSelectElement>("optimizer-combination-size").addEventListener(
    "change",
    updateExactSearchAvailability,
  );
  requiredElement<HTMLInputElement>("optimizer-min-total").addEventListener(
    "input",
    updateExactSearchAvailability,
  );
  requiredElement<HTMLInputElement>("optimizer-require-target").addEventListener(
    "change",
    updateExactSearchAvailability,
  );
  requiredElement("optimizer-attributes").addEventListener(
    "change",
    updateExactSearchAvailability,
  );
}

async function loadSyncedInventory(): Promise<void> {
  const signIn = requiredElement<HTMLAnchorElement>("optimizer-sign-in");
  const picker = requiredElement<HTMLSelectElement>("optimizer-profile-select");
  const pickerLabel = picker.closest<HTMLLabelElement>(".optimizer-profile-picker");
  const session = activeSession();
  if (!apiBase || !session) {
    signIn.hidden = false;
    if (pickerLabel) pickerLabel.hidden = true;
    setInventoryStatus("Sign in to rLogs to use the module inventory synced by your desktop app.");
    setRunStatus("A synced module inventory is required.");
    return;
  }

  const response = await fetch(`${apiBase}/v1/auth/profiles`, {
    headers: { Authorization: `Bearer ${session.access_token}`, Accept: "application/json" },
  });
  if (response.status === 401) {
    localStorage.removeItem(sessionKey);
    window.dispatchEvent(new Event("rlogs:session-changed"));
    signIn.hidden = false;
    setInventoryStatus("Your website session expired. Sign in again to load synced modules.", true);
    return;
  }
  if (!response.ok) throw new Error(`Synced-profile request failed with HTTP ${response.status}.`);
  const profiles = parseLinkedProfiles(await response.json());
  if (!profiles.length) {
    setInventoryStatus(
      "No synced character profile is linked yet. Connect the desktop app and enable BPSR Profile Sync while the game is open; the parser will publish modules as soon as it observes your personal character snapshot.",
    );
    setRunStatus("Waiting for a synced module inventory.");
    return;
  }

  picker.replaceChildren(
    ...profiles.map((profile) => {
      const option = document.createElement("option");
      option.value = profile.profile_id;
      option.textContent = `${profile.display_name ?? `UID ${profile.character_id}`} · ${profile.character_id}`;
      return option;
    }),
  );
  const requested = new URLSearchParams(location.search).get("profile");
  if (requested && profiles.some((profile) => profile.profile_id === requested)) picker.value = requested;
  if (pickerLabel) pickerLabel.hidden = profiles.length < 2;
  signIn.hidden = true;
  await loadPublishedInventory(picker.value);
}

async function loadPublishedInventory(profileId: string): Promise<void> {
  setInventoryStatus(`Loading published UID ${profileId} module inventory...`);
  try {
    const published = await loadPublishedProfile(profileId);
    const input = extractOptimizerInput(published.envelope);
    inventory = input.modules;
    currentInstanceIds = input.currentInstanceIds;
    setCombinationSizeForCurrentSetup();
    updateExactSearchAvailability();
    setInventoryStatus(
      `${published.entry.label} loaded: ${formatNumber(inventory.length)} modules and ` +
        `${currentInstanceIds.length} equipped modules.`,
    );
    setRunStatus("Choose attribute priorities, then optimize.");
    enableRun();
  } catch (error) {
    setInventoryStatus(errorMessage(error), true);
    setRunStatus(`Could not load the UID ${profileId} inventory.`, true);
  }
}

function activeSession(): { access_token: string } | undefined {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(sessionKey) ?? "null");
    if (
      isRecord(value) &&
      typeof value.access_token === "string" &&
      value.access_token.startsWith("rlw_") &&
      typeof value.expires_unix_millis === "number" &&
      value.expires_unix_millis > Date.now()
    ) {
      return { access_token: value.access_token };
    }
  } catch {
    // The explicit signed-out state is rendered by the caller.
  }
  return undefined;
}

function parseLinkedProfiles(value: unknown): LinkedProfile[] {
  if (!isRecord(value) || value.schema_version !== 1 || !Array.isArray(value.profiles)) {
    throw new Error("The synced-profile response is invalid.");
  }
  return value.profiles.map((profile) => {
    if (
      !isRecord(profile) ||
      typeof profile.profile_id !== "string" ||
      !/^prf_[0-9a-f]{32}$/u.test(profile.profile_id) ||
      typeof profile.character_id !== "string" ||
      !(profile.display_name === null || typeof profile.display_name === "string") ||
      typeof profile.updated_unix_millis !== "number" ||
      !Number.isSafeInteger(profile.updated_unix_millis)
    ) {
      throw new Error("The synced-profile response is invalid.");
    }
    return profile as unknown as LinkedProfile;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function runOptimizer(): Promise<void> {
  if (!catalog) {
    setRunStatus("The optimizer catalog is not ready.", true);
    return;
  }
  if (inventory.length === 0) {
    setRunStatus("Load a module inventory first.", true);
    return;
  }

  const button = requiredElement<HTMLButtonElement>("run-optimizer");
  const searchMode =
    requiredElement<HTMLSelectElement>("optimizer-search-mode");
  const exactEstimate = estimateExactSearch();
  const fellBackFromExact =
    searchMode.value === "exact" &&
    exactEstimate.combinations > DEFAULT_EXACT_COMBINATION_LIMIT;
  if (fellBackFromExact) {
    searchMode.value = "auto";
    updateExactSearchAvailability();
  }
  button.disabled = true;
  button.textContent = "Optimizing...";
  requiredElement("optimizer-result").hidden = true;
  const request = buildRequest();
  setRunStatus(
    fellBackFromExact
      ? `Exact search would require ${formatBigInt(exactEstimate.combinations)} sets; ` +
          `using ${computeBudget.label} bounded search automatically.`
      : `Searching ${formatNumber(inventory.length)} modules in a background worker ` +
        `with the ${computeBudget.label} device budget (${formatNumber(computeBudget.beamWidth)} beam states)...`,
  );
  const started = performance.now();
  try {
    const response = (await callWorker({
      kind: "optimize",
      request,
    })) as OptimizeResponse;
    renderResult(response, performance.now() - started);
    setRunStatus(
      `Found ${response.solutions.length} result(s) using ${response.search.used_mode} search.`,
    );
  } catch (error) {
    setRunStatus(errorMessage(error), true);
  } finally {
    button.disabled = false;
    button.textContent = "Optimize modules";
  }
}

function buildRequest(): OptimizeRequest {
  const targetAttributes: number[] = [];
  const excludeAttributes: number[] = [];
  const minimums: Record<string, number> = {};
  document
    .querySelectorAll<HTMLElement>(".optimizer-attribute-row")
    .forEach((row) => {
      const attributeId = Number(row.dataset.attributeId);
      const mode = row.querySelector<HTMLSelectElement>("select")?.value;
      const minimum = Number(
        row.querySelector<HTMLInputElement>('input[type="number"]')?.value || 0,
      );
      if (mode === "target") targetAttributes.push(attributeId);
      if (mode === "exclude") excludeAttributes.push(attributeId);
      if (minimum > 0) minimums[String(attributeId)] = minimum;
    });
  const minimumTotalRaw =
    requiredElement<HTMLInputElement>("optimizer-min-total").value;
  return {
    modules: inventory,
    current_instance_ids: currentInstanceIds,
    target_attributes: targetAttributes,
    exclude_attributes: excludeAttributes,
    min_attr_requirements: minimums,
    combination_size: Number(
      requiredElement<HTMLSelectElement>("optimizer-combination-size").value,
    ),
    max_solutions: Number(
      requiredElement<HTMLInputElement>("optimizer-result-count").value,
    ),
    search_mode: requiredElement<HTMLSelectElement>(
      "optimizer-search-mode",
    ).value as SearchMode,
    beam_width: computeBudget.beamWidth,
    minimum_module_total:
      minimumTotalRaw === "" ? null : Number(minimumTotalRaw),
    require_target_match:
      requiredElement<HTMLInputElement>("optimizer-require-target").checked,
  };
}

function renderCatalog(value: OptimizerCatalog): void {
  requiredElement("optimizer-catalog-revision").textContent =
    `${value.catalog_revision} / build ${value.client_builds.join(", ")}`;
  const root = requiredElement("optimizer-attributes");
  root.replaceChildren(
    ...value.attributes.map((attribute) => attributeRow(attribute)),
  );
  updateExactSearchAvailability();
}

function attributeRow(attribute: AttributeCatalogEntry): HTMLElement {
  const row = element("div", "optimizer-attribute-row");
  row.dataset.attributeId = String(attribute.id);

  const identity = element("div", "optimizer-attribute-name");
  identity.append(
    element("strong", "", attribute.name),
    element(
      "small",
      "",
      `${attribute.id} / ${attribute.thresholds.join("/")}`,
    ),
  );

  const mode = element("select");
  mode.setAttribute("aria-label", `Scoring policy for ${attribute.name}`);
  for (const [value, label] of [
    ["normal", "Normal"],
    ["target", "Priority"],
    ["exclude", "Ignore"],
  ]) {
    const option = element("option", "", label);
    option.value = value;
    mode.append(option);
  }

  const minimum = element("input");
  minimum.type = "number";
  minimum.min = "0";
  minimum.placeholder = "0";
  minimum.setAttribute("aria-label", `Minimum ${attribute.name}`);
  row.append(identity, mode, minimum);
  return row;
}

function renderResult(result: OptimizeResponse, durationMs: number): void {
  const current = result.current_setup;
  const top = result.solutions[0];
  const currentIsComparable =
    current?.instance_ids.length === result.search.combination_size;
  const actualDelta =
    currentIsComparable && current && top ? top.score - current.score : undefined;
  const metrics: Array<[string, string]> = [
    [current ? formatNumber(current.score) : "—", "current actual"],
    [top ? formatNumber(top.score) : "—", "top recommendation"],
    [actualDelta == null ? "—" : formatSigned(actualDelta), "actual change"],
    [top ? formatNumber(top.ranking_score) : "—", "preference score"],
    [formatNumber(result.search.candidate_module_count), "candidates"],
    [`${durationMs.toFixed(0)} ms`, "browser time"],
  ];
  requiredElement("optimizer-metrics").replaceChildren(
    ...metrics.map(([value, label]) => {
      const metric = element("div", "optimizer-result-metric");
      metric.append(element("strong", "", value), element("span", "", label));
      return metric;
    }),
  );

  const currentSignature = current ? solutionSignature(current) : undefined;
  const recommendations = result.solutions.filter(
    (solution) => solutionSignature(solution) !== currentSignature,
  );
  const rows = recommendations.map((solution, index) =>
    solutionRow(solution, `#${index + 1}`),
  );
  if (current) rows.unshift(solutionRow(current, "Current", true));
  requiredElement("optimizer-result-rows").replaceChildren(...rows);

  requiredElement("optimizer-footnote").textContent =
    `Actual power is always unweighted. Preference score is used only to order recommendations. ` +
    `${result.solutions.length} solutions; ${formatNumber(result.search.total_combinations)} possible sets; ` +
    `${formatNumber(result.search.evaluated_states)} states evaluated with ` +
    `${result.search.exact ? "exact" : "bounded"} search. ${result.scoring_revision}.`;
  requiredElement("optimizer-result").hidden = false;
}

function solutionSignature(solution: ModuleSolution): string {
  return [...solution.instance_ids].sort().join("\u0000");
}

function solutionRow(
  solution: ModuleSolution,
  label: string,
  current = false,
): HTMLTableRowElement {
  const row = element("tr");
  if (current) row.classList.add("optimizer-current-row");
  const modules = element("td", "optimizer-module-ids");
  for (const module of solution.modules) {
    const line = element("span");
    line.append(
      element("strong", "", module.instance_id),
      element(
        "small",
        "",
        `config ${module.config_id}${module.quality == null ? "" : ` / Q${module.quality}`}`,
      ),
    );
    modules.append(line);
  }
  const attributes = solution.breakdown.attributes
    .filter((attribute) => attribute.total > 0)
    .map((attribute) => {
      const entry = catalog?.attributes.find(
        (candidate) => candidate.id === attribute.attribute_id,
      );
      const suffix =
        attribute.multiplier === 2
          ? " (priority)"
          : attribute.multiplier === 0
            ? " (ignored for ranking)"
            : "";
      return `${entry?.name ?? attribute.attribute_id}: ${attribute.total}${suffix}`;
    })
    .join(" / ");
  row.append(
    element("td", current ? "optimizer-current-label" : "", label),
    element("td", "optimizer-score", formatNumber(solution.score)),
    element(
      "td",
      "optimizer-ranking-score",
      formatNumber(solution.ranking_score),
    ),
    modules,
    element("td", "optimizer-attribute-summary", attributes),
  );
  return row;
}

function setCombinationSizeForCurrentSetup(): void {
  if (currentInstanceIds.length === 4 || currentInstanceIds.length === 5) {
    requiredElement<HTMLSelectElement>("optimizer-combination-size").value =
      String(currentInstanceIds.length);
  }
}

function updateExactSearchAvailability(): void {
  const searchMode =
    requiredElement<HTMLSelectElement>("optimizer-search-mode");
  const exactOption = searchMode.querySelector<HTMLOptionElement>(
    'option[value="exact"]',
  );
  if (!exactOption) return;
  const estimate = estimateExactSearch();
  const tooLarge =
    estimate.combinations > DEFAULT_EXACT_COMBINATION_LIMIT;
  exactOption.disabled = tooLarge;
  exactOption.textContent = tooLarge
    ? "Exact verification (too many sets)"
    : "Exact verification";
  if (tooLarge && searchMode.value === "exact") {
    searchMode.value = "auto";
  }
  const help = requiredElement("optimizer-search-help");
  help.textContent =
    inventory.length === 0
      ? "Exact verification is available for small inventories."
      : tooLarge
        ? `Exact disabled: ${formatNumber(estimate.candidateCount)} eligible modules can produce ` +
          `up to ${formatBigInt(estimate.combinations)} sets. Auto uses bounded search.`
        : `Exact available for ${formatBigInt(estimate.combinations)} possible sets.`;
}

function estimateExactSearch(): {
  candidateCount: number;
  combinations: bigint;
} {
  const combinationSize = Number(
    requiredElement<HTMLSelectElement>("optimizer-combination-size").value,
  );
  const minimumTotalRaw =
    requiredElement<HTMLInputElement>("optimizer-min-total").value;
  const minimumTotal =
    minimumTotalRaw === "" ? undefined : Number(minimumTotalRaw);
  const priorityAttributes = new Set(
    [...document.querySelectorAll<HTMLElement>(".optimizer-attribute-row")]
      .filter((row) => row.querySelector<HTMLSelectElement>("select")?.value === "target")
      .map((row) => Number(row.dataset.attributeId)),
  );
  const requirePriority =
    requiredElement<HTMLInputElement>("optimizer-require-target").checked &&
    priorityAttributes.size > 0;
  const candidateCount = inventory.filter((module) => {
    if (module.parts.length < 2) return false;
    const total = module.parts.reduce(
      (sum, part) => sum + part.initial_link_points,
      0,
    );
    if (minimumTotal != null && total < minimumTotal) return false;
    return (
      !requirePriority ||
      module.parts.some((part) => priorityAttributes.has(part.part_id))
    );
  }).length;
  return {
    candidateCount,
    combinations: combinationCount(candidateCount, combinationSize),
  };
}

function callWorker(
  message:
    | { kind: "catalog" }
    | { kind: "optimize"; request: OptimizeRequest },
): Promise<OptimizerCatalog | OptimizeResponse> {
  const id = nextWorkerRequestId++;
  return new Promise((resolve, reject) => {
    pendingWorkerCalls.set(id, { resolve, reject });
    optimizerWorker.postMessage({ ...message, id } as OptimizerWorkerRequest);
  });
}

function browserDeviceCapabilities(): {
  hardwareConcurrency?: number;
  deviceMemoryGb?: number;
  mobile: boolean;
} {
  const extendedNavigator = navigator as Navigator & {
    deviceMemory?: number;
    userAgentData?: { mobile?: boolean };
  };
  return {
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemoryGb: extendedNavigator.deviceMemory,
    mobile:
      extendedNavigator.userAgentData?.mobile ??
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent),
  };
}

function enableRun(): void {
  requiredElement<HTMLButtonElement>("run-optimizer").disabled =
    !catalog || inventory.length === 0;
}

function setEngineState(
  state: "valid" | "invalid",
  message: string,
): void {
  const chip = requiredElement("optimizer-status-chip");
  chip.className = `status-chip ${state}`;
  chip.textContent = message;
}

function setInventoryStatus(message: string, error = false): void {
  const status = requiredElement("optimizer-inventory-status");
  status.textContent = message;
  status.classList.toggle("inline-error", error);
}

function setRunStatus(message: string, error = false): void {
  const status = requiredElement("optimizer-run-status");
  status.textContent = message;
  status.classList.toggle("inline-error", error);
}

function requiredElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing required page element #${id}.`);
  return node as T;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function formatBigInt(value: bigint): string {
  return value.toLocaleString("en-US");
}

function formatSigned(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatNumber(value)}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
