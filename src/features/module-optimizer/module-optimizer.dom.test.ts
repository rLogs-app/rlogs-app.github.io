import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ModuleCandidate,
  ModuleSolution,
  OptimizerCatalog,
  OptimizerWorkerRequest,
  OptimizerWorkerResponse,
} from "./optimizer-types";

const profileId = `prf_${"a".repeat(32)}`;
const modules: ModuleCandidate[] = Array.from({ length: 5 }, (_, index) => ({
  instance_id: `module-${index + 1}`,
  config_id: 5_500_101 + index,
  quality: 5,
  parts: [{
    part_id: index % 2 === 0 ? 1_110 : 1_111,
    initial_link_points: 5 + index,
  }],
}));
const equippedSlots = Object.fromEntries(modules.slice(0, 4).map((module, index) => [String(index + 1), module.instance_id]));
const optimizerInput = { modules: { inventory: modules, equipped_slots: equippedSlots } };

const catalog: OptimizerCatalog = {
  game_id: "blue-protocol-star-resonance",
  catalog_revision: "test-catalog",
  scoring_revision: "test-scoring",
  client_builds: ["24687926"],
  attributes: [
    { id: 1_110, name: "Effect 1110", official_name: null, icon: null, thresholds: [1, 5], fight_values: [100, 250] },
    { id: 1_111, name: "Effect 1111", official_name: null, icon: null, thresholds: [1, 5], fight_values: [80, 200] },
  ],
  link_power: Array.from({ length: 64 }, (_, index) => index * 10),
  combination_sizes: [4, 5],
  default_max_solutions: 10,
};

const presentation = {
  schema_version: 25,
  locale: "en-US",
  deployment_id: "global",
  game_build: "24687926",
  protocol_pack_digest: `sha256:${"b".repeat(64)}`,
  quality_names: { 5: "Legendary" },
  modules: Object.fromEntries(modules.map((module, index) => [String(module.config_id), {
    name: `Localized Module ${index + 1}`,
    icon: null,
    quality: 5,
  }])),
  module_effects: {
    1110: { name: "Localized Power", icon: null },
    1111: { name: "Localized Support", icon: null },
  },
} as const;

function solution(selected: ModuleCandidate[], score: number, rankingScore = score): ModuleSolution {
  return {
    instance_ids: selected.map((module) => module.instance_id),
    modules: selected,
    score,
    ranking_score: rankingScore,
    breakdown: {
      threshold_power: 0,
      ranking_threshold_power: 0,
      total_link_points: selected.reduce((sum, module) => sum + module.parts[0]!.initial_link_points, 0),
      total_link_power: 0,
      attributes: [],
    },
  };
}

class OptimizerWorkerStub {
  private readonly listeners = new Map<string, Array<(event: MessageEvent<OptimizerWorkerResponse>) => void>>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const callback = typeof listener === "function" ? listener : (event: Event) => listener.handleEvent(event);
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(callback as (event: MessageEvent<OptimizerWorkerResponse>) => void);
    this.listeners.set(type, listeners);
  }

  postMessage(message: OptimizerWorkerRequest): void {
    const value = message.kind === "catalog"
      ? catalog
      : {
        scoring_revision: catalog.scoring_revision,
        catalog_revision: catalog.catalog_revision,
        current_setup: solution(modules.slice(0, 4), 1_000),
        solutions: [solution(modules.slice(1, 5), 1_200, 1_300)],
        search: {
          requested_mode: message.request.search_mode,
          used_mode: "exact",
          exact: true,
          input_module_count: modules.length,
          candidate_module_count: modules.length,
          excluded_module_count: 0,
          total_combinations: 5,
          evaluated_states: 5,
          combination_size: 4,
          beam_width: null,
        },
      };
    queueMicrotask(() => this.listeners.get("message")?.forEach((listener) => listener({
      data: { id: message.id, ok: true, value },
    } as MessageEvent<OptimizerWorkerResponse>)));
  }
}

describe("module optimizer composed score rendering", () => {
  let window: Window;

  beforeEach(() => {
    vi.resetModules();
    window = new Window({ url: `https://rlogs.app/optimizer/?profile=${profileId}` });
    const html = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
    window.document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/iu)?.[1] ?? html;
    const globals = {
      window,
      document: window.document,
      navigator: window.navigator,
      location: window.location,
      localStorage: window.localStorage,
      Element: window.Element,
      HTMLElement: window.HTMLElement,
      HTMLAnchorElement: window.HTMLAnchorElement,
      HTMLButtonElement: window.HTMLButtonElement,
      HTMLDetailsElement: window.HTMLDetailsElement,
      HTMLInputElement: window.HTMLInputElement,
      HTMLOptionElement: window.HTMLOptionElement,
      HTMLSelectElement: window.HTMLSelectElement,
      Event: window.Event,
      File: window.File,
      Worker: OptimizerWorkerStub,
    };
    Object.entries(globals).forEach(([name, value]) => vi.stubGlobal(name, value));
    vi.doMock("../profiles/profile-presentation", async () => ({
      ...(await vi.importActual<typeof import("../profiles/profile-presentation")>("../profiles/profile-presentation")),
      loadProfilePresentation: vi.fn(async () => presentation),
    }));
    vi.doMock("../profiles/published-profile-loader", async () => ({
      ...(await vi.importActual<typeof import("../profiles/published-profile-loader")>("../profiles/published-profile-loader")),
      loadPublishedProfile: vi.fn(async () => ({
        entry: {
          profile_id: profileId,
          label: "Profile Player",
          deployment: "global",
          source_client_build: "24687926",
          source_protocol_pack_digest: presentation.protocol_pack_digest,
        },
        envelope: optimizerInput,
        loadouts: [],
      })),
    }));
  });

  afterEach(() => {
    vi.doUnmock("../profiles/profile-presentation");
    vi.doUnmock("../profiles/published-profile-loader");
    vi.unstubAllGlobals();
    window.close();
  });

  async function mount(): Promise<void> {
    const { mountModuleOptimizer } = await import("./module-optimizer");
    await mountModuleOptimizer();
  }

  async function expectScoresAfterOptimize(): Promise<void> {
    const equippedSummary = window.document.querySelector("#optimizer-equipped-summary");
    expect(equippedSummary?.textContent).toContain("Score ");
    const equippedCards = [...window.document.querySelectorAll("#optimizer-equipped-cards .optimizer-module-card")];
    expect(equippedCards).toHaveLength(4);
    equippedCards.forEach((card) => {
      expect(card.textContent).toContain("Localized Module");
      expect(card.textContent).toMatch(/Score [\d,]+/u);
    });

    (window.document.querySelector("#run-optimizer") as unknown as { click(): void }).click();
    await vi.waitFor(() => expect(window.document.querySelector("#optimizer-result")?.hasAttribute("hidden")).toBe(false));
    expect(window.document.querySelector(".optimizer-solution-card.is-current .optimizer-score-summary")?.textContent)
      .toBe("Score 1,000");
    expect(window.document.querySelector(".optimizer-solution-card:not(.is-current) .optimizer-score-summary")?.textContent)
      .toBe("Score 1,200 · Priority 1,300");
    window.document.querySelectorAll(".optimizer-solution-card .optimizer-module-card").forEach((card) => {
      expect(card.textContent).toMatch(/Score [\d,]+/u);
    });
  }

  it("renders scores after loading a published profile", async () => {
    await mount();
    expect(window.document.querySelector("#optimizer-inventory-status")?.textContent).toContain("Profile Player loaded");
    await expectScoresAfterOptimize();
  });

  it("renders the same scores after loading local JSON", async () => {
    window.happyDOM.setURL("https://rlogs.app/optimizer/");
    await mount();
    const input = window.document.querySelector("#optimizer-file");
    expect(input).not.toBeNull();
    const file = new window.File([JSON.stringify(optimizerInput)], "modules.json", { type: "application/json" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    input!.dispatchEvent(new window.Event("change"));
    await vi.waitFor(() => expect(window.document.querySelector("#optimizer-inventory-status")?.textContent)
      .toContain("equipped modules loaded locally"));
    await expectScoresAfterOptimize();
  });
});
