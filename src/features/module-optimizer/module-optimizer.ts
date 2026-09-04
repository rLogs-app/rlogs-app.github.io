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
import {
  loadPublishedProfile,
  loadPublishedProfileLoadout,
} from "../profiles/published-profile-loader";
import {
  loadProfilePresentation,
  type ProfilePresentationCatalog,
} from "../profiles/profile-presentation";
import { moduleCardModel, sortModuleInventory } from "./optimizer-presentation";
import {
  requestedOptimizerLoadout,
  requestedOptimizerProfile,
} from "./optimizer-profile-route";

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
let presentation: ProfilePresentationCatalog | undefined;
let inventoryVisibleLimit = 80;
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
    const [workerCatalog, presentationCatalog] = await Promise.all([
      callWorker({ kind: "catalog" }) as Promise<OptimizerCatalog>,
      loadProfilePresentation(),
    ]);
    catalog = workerCatalog;
    presentation = presentationCatalog;
    renderCatalog(catalog);
    setEngineState("valid", "Optimizer ready");
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
  requiredElement<HTMLInputElement>("optimizer-inventory-search").addEventListener("input", () => {
    inventoryVisibleLimit = 80;
    renderInventoryBrowser();
  });
  requiredElement<HTMLSelectElement>("optimizer-inventory-family").addEventListener("change", () => {
    inventoryVisibleLimit = 80;
    renderInventoryBrowser();
  });
  requiredElement<HTMLButtonElement>("optimizer-inventory-more").addEventListener("click", () => {
    inventoryVisibleLimit += 80;
    renderInventoryBrowser();
  });
  requiredElement<HTMLDetailsElement>("optimizer-inventory-browser").addEventListener("toggle", (event) => {
    if ((event.currentTarget as HTMLDetailsElement).open) renderInventoryBrowser();
  });
}

async function loadSyncedInventory(): Promise<void> {
  const signIn = requiredElement<HTMLAnchorElement>("optimizer-sign-in");
  const picker = requiredElement<HTMLSelectElement>("optimizer-profile-select");
  const pickerLabel = picker.closest<HTMLLabelElement>(".optimizer-profile-picker");
  const session = activeSession();
  const requestedProfile = requestedOptimizerProfile(location.search);
  const requestedLoadout = requestedOptimizerLoadout(location.search);
  if (requestedProfile) {
    signIn.hidden = true;
    if (pickerLabel) pickerLabel.hidden = true;
    await loadPublishedInventory(requestedProfile, requestedLoadout);
    return;
  }
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
  if (requestedProfile && profiles.some((profile) => profile.profile_id === requestedProfile)) picker.value = requestedProfile;
  if (pickerLabel) pickerLabel.hidden = profiles.length < 2;
  signIn.hidden = true;
  await loadPublishedInventory(picker.value);
}

async function loadPublishedInventory(profileId: string, projectId?: number): Promise<void> {
  setInventoryStatus("Loading this profile's published module inventory...");
  try {
    const published = await loadPublishedProfile(profileId);
    const envelope = projectId == null
      ? published.envelope
      : await loadPublishedProfileLoadout(published, projectId);
    const input = extractOptimizerInput(envelope);
    inventory = input.modules;
    currentInstanceIds = input.currentInstanceIds;
    renderInventoryPreview();
    setCombinationSizeForCurrentSetup();
    updateExactSearchAvailability();
    setInventoryStatus(
      `${published.entry.label}${projectId == null ? "" : ` · Loadout ${projectId}`} loaded: ${formatNumber(inventory.length)} modules and ` +
        `${currentInstanceIds.length} equipped modules.`,
    );
    setRunStatus("Choose attribute priorities, then optimize.");
    enableRun();
  } catch (error) {
    requiredElement("optimizer-inventory-preview").hidden = true;
    setInventoryStatus(errorMessage(error), true);
    setRunStatus("Could not load this profile's published inventory.", true);
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
    `Game build ${value.client_builds.map((build) => Number(build).toLocaleString("en-US")).join(", ")}`;
  requiredElement("optimizer-catalog-revision").title = value.catalog_revision;
  const root = requiredElement("optimizer-attributes");
  root.replaceChildren(
    ...value.attributes.map((attribute) => attributeRow(attribute)),
  );
  updateExactSearchAvailability();
}

function attributeRow(attribute: AttributeCatalogEntry): HTMLElement {
  const row = element("div", "optimizer-attribute-row");
  row.dataset.attributeId = String(attribute.id);
  const localized = presentation?.module_effects[String(attribute.id)];

  const identity = element("div", "optimizer-attribute-name");
  appendOptimizerIcon(identity, localized?.icon ?? attribute.icon, localized?.name ?? attribute.name, "optimizer-attribute-icon");
  const copy = element("span", "optimizer-attribute-copy");
  const thresholdCopy = attribute.thresholds.length
    ? `Power steps at ${attribute.thresholds.join(", ")} Link`
    : "No activation thresholds";
  copy.append(
    element("strong", "", localized?.name ?? attribute.name),
    element("small", "", thresholdCopy),
  );
  identity.append(
    copy,
  );

  const mode = element("select");
  mode.setAttribute("aria-label", `Scoring policy for ${attribute.name}`);
  for (const [value, label] of [
    ["normal", "Balanced"],
    ["target", "Prioritize"],
    ["exclude", "Exclude"],
  ]) {
    const option = element("option", "", label);
    option.value = value;
    mode.append(option);
  }

  const minimum = element("input");
  minimum.type = "number";
  minimum.min = "0";
  minimum.placeholder = "Any";
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
    [current ? formatNumber(current.score) : "—", "current power"],
    [top ? formatNumber(top.score) : "—", "best power"],
    [actualDelta == null ? "—" : formatSigned(actualDelta), "improvement"],
    [top ? formatNumber(top.ranking_score) : "—", "priority fit"],
    [formatNumber(result.search.candidate_module_count), "eligible modules"],
    [`${durationMs.toFixed(0)} ms`, "search time"],
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
    solutionCard(solution, `Recommendation ${index + 1}`, false, current?.score),
  );
  if (current) rows.unshift(solutionCard(current, "Currently equipped", true, current.score));
  requiredElement("optimizer-result-rows").replaceChildren(...rows);

  requiredElement("optimizer-footnote").textContent =
    `Calculated locally from ${formatNumber(result.search.candidate_module_count)} eligible modules. ` +
    `${formatNumber(result.search.total_combinations)} possible sets; ` +
    `${formatNumber(result.search.evaluated_states)} candidate states checked with ` +
    `${result.search.exact ? "an exact" : "a fast bounded"} search.`;
  requiredElement("optimizer-result").hidden = false;
}

function solutionSignature(solution: ModuleSolution): string {
  return [...solution.instance_ids].sort().join("\u0000");
}

function solutionCard(
  solution: ModuleSolution,
  label: string,
  current = false,
  currentScore?: number,
): HTMLElement {
  const card = element("article", current ? "optimizer-solution-card is-current" : "optimizer-solution-card");
  const heading = element("header", "optimizer-solution-heading");
  const identity = element("div");
  identity.append(
    element("span", current ? "optimizer-solution-kicker is-current" : "optimizer-solution-kicker", current ? "Your loadout" : "Suggested loadout"),
    element("h4", "", label),
  );
  const score = element("div", "optimizer-solution-score");
  score.append(
    element("strong", "", formatNumber(solution.score)),
    element("span", "", "Actual module power"),
  );
  if (!current && currentScore != null) {
    score.append(element("small", "", `${formatSigned(solution.score - currentScore)} vs current`));
  }
  heading.append(identity, score);

  const modules = element("div", "optimizer-solution-modules");
  for (const module of solution.modules) {
    modules.append(moduleCard(module, currentInstanceIds.indexOf(module.instance_id) + 1 || undefined, true));
  }
  const attributes = element("div", "optimizer-solution-attributes");
  for (const attribute of solution.breakdown.attributes.filter((entry) => entry.total > 0)) {
      const entry = catalog?.attributes.find(
        (candidate) => candidate.id === attribute.attribute_id,
      );
      const localized = presentation?.module_effects[String(attribute.attribute_id)];
      const suffix =
        attribute.multiplier === 2
          ? " · Priority"
          : attribute.multiplier === 0
            ? " · Excluded from ranking"
            : "";
      const chip = element("span", "optimizer-result-effect");
      appendOptimizerIcon(chip, localized?.icon ?? entry?.icon, localized?.name ?? entry?.name ?? "Module effect", "optimizer-result-effect-icon");
      chip.append(element("span", "", `${localized?.name ?? entry?.name ?? "Unknown effect"} · ${attribute.total} Link${suffix}`));
      attributes.append(chip);
  }
  const footer = element("div", "optimizer-solution-footer");
  footer.append(
    element("span", "", `${solution.breakdown.total_link_points} total Link`),
    element("span", "", `Priority fit ${formatNumber(solution.ranking_score)}`),
  );
  card.append(heading, modules, attributes, footer);
  return card;
}

function renderInventoryPreview(): void {
  if (!presentation) return;
  const root = requiredElement("optimizer-inventory-preview");
  root.hidden = false;
  requiredElement("optimizer-inventory-count").textContent = `${formatNumber(inventory.length)} owned`;
  const equippedById = new Map(currentInstanceIds.map((instanceId, index) => [instanceId, index + 1]));
  const equipped = currentInstanceIds
    .map((instanceId) => inventory.find((module) => module.instance_id === instanceId))
    .filter((module): module is ModuleCandidate => module != null);
  requiredElement("optimizer-equipped-cards").replaceChildren(
    ...equipped.map((module) => moduleCard(module, equippedById.get(module.instance_id))),
  );
  requiredElement("optimizer-equipped-empty").hidden = equipped.length > 0;
  inventoryVisibleLimit = 80;
  if (requiredElement<HTMLDetailsElement>("optimizer-inventory-browser").open) renderInventoryBrowser();
}

function renderInventoryBrowser(): void {
  if (!presentation || !inventory.length) return;
  const search = requiredElement<HTMLInputElement>("optimizer-inventory-search").value.trim().toLocaleLowerCase("en-US");
  const family = requiredElement<HTMLSelectElement>("optimizer-inventory-family").value;
  const equippedIds = new Set(currentInstanceIds);
  const matching = sortModuleInventory(inventory, presentation, equippedIds).filter((module) => {
    const model = moduleCardModel(module, presentation!);
    const familyMatches = family === "all" || model.name.toLocaleLowerCase("en-US").includes(family);
    return familyMatches && (!search || model.searchText.includes(search));
  });
  const visible = matching.slice(0, inventoryVisibleLimit);
  const equippedById = new Map(currentInstanceIds.map((instanceId, index) => [instanceId, index + 1]));
  requiredElement("optimizer-inventory-cards").replaceChildren(
    ...visible.map((module) => moduleCard(module, equippedById.get(module.instance_id))),
  );
  requiredElement("optimizer-inventory-visible").textContent = matching.length
    ? `Showing ${formatNumber(visible.length)} of ${formatNumber(matching.length)} matching modules`
    : "No modules match those filters.";
  requiredElement<HTMLButtonElement>("optimizer-inventory-more").hidden = visible.length >= matching.length;
}

function moduleCard(module: ModuleCandidate, equippedSlot?: number, compact = false): HTMLElement {
  if (!presentation) return element("article", "optimizer-module-card", "Module presentation unavailable");
  const model = moduleCardModel(module, presentation);
  const card = element("article", compact ? "optimizer-module-card is-compact" : "optimizer-module-card");
  if (equippedSlot != null) card.classList.add("is-equipped");
  const top = element("div", "optimizer-module-card-top");
  const icon = element("div", "optimizer-module-card-icon-wrap");
  appendOptimizerIcon(icon, model.icon, model.name, "optimizer-module-card-icon");
  const copy = element("div", "optimizer-module-card-copy");
  copy.append(
    element("strong", "", model.name),
    element("small", "", `${model.quality} · ${model.totalLink} total Link`),
  );
  top.append(icon, copy);
  if (equippedSlot != null) top.append(element("span", "optimizer-equipped-badge", `Equipped · Slot ${equippedSlot}`));
  const effects = element("div", "optimizer-module-card-effects");
  for (const effect of model.effects) {
    const row = element("span", "optimizer-module-effect");
    appendOptimizerIcon(row, effect.icon, effect.name, "optimizer-module-effect-icon");
    row.append(
      element("strong", "", effect.name),
      element("small", "", `${effect.link} Link`),
    );
    effects.append(row);
  }
  const copyLabel = element("span", "optimizer-module-copy-label", model.copyLabel);
  copyLabel.title = `Exact module instance ${module.instance_id}`;
  card.append(top, effects, copyLabel);
  return card;
}

function appendOptimizerIcon(target: HTMLElement, value: string | null | undefined, alt: string, className: string): void {
  if (!value || !/^\/assets\/bpsr\/profile\/[a-z0-9_./-]+\.png$/iu.test(value)) return;
  const image = document.createElement("img");
  image.src = value;
  image.alt = alt;
  image.className = className;
  image.loading = "lazy";
  target.append(image);
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
    ? "Exact check (too many sets)"
    : "Exact check";
  if (tooLarge && searchMode.value === "exact") {
    searchMode.value = "auto";
  }
  const help = requiredElement("optimizer-search-help");
  help.textContent =
    inventory.length === 0
      ? "Exact check is available for small inventories."
      : tooLarge
        ? `${formatNumber(estimate.candidateCount)} eligible modules can produce ` +
          `up to ${formatBigInt(estimate.combinations)} sets, so Automatic uses the fast search.`
        : `Exact check is available for ${formatBigInt(estimate.combinations)} possible sets.`;
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
