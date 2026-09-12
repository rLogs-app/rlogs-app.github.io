import { readFile } from "node:fs/promises";

import initOptimizer, {
  optimizer_catalog_json as optimizerCatalogJson,
  optimize_json as optimizeJson,
} from "../public/wasm/rlogs_bpsr_module_optimizer_wasm.js";

const expectedCatalogRevision = "steam-24252055-24687926-reviewed-catalog-v6";
const expectedClientBuilds = ["24252055", "24687926"];
const wasmBytes = await readFile(new URL(
  "../public/wasm/rlogs_bpsr_module_optimizer_wasm_bg.wasm",
  import.meta.url,
));
await initOptimizer({ module_or_path: wasmBytes });

const catalog = JSON.parse(optimizerCatalogJson());
if (catalog.catalog_revision !== expectedCatalogRevision) {
  throw new Error(
    `Optimizer WASM embeds ${catalog.catalog_revision}; expected ${expectedCatalogRevision}.`,
  );
}
if (JSON.stringify(catalog.client_builds) !== JSON.stringify(expectedClientBuilds)) {
  throw new Error(
    `Optimizer WASM embeds builds ${JSON.stringify(catalog.client_builds)}; expected ${JSON.stringify(expectedClientBuilds)}.`,
  );
}

const presentation = JSON.parse(await readFile(new URL(
  "../public/data/bpsr/profile-presentation.en-US.v1.json",
  import.meta.url,
), "utf8"));
for (const attribute of catalog.attributes) {
  const trusted = presentation.module_effects[String(attribute.id)]?.name;
  if (!trusted) {
    throw new Error(`Optimizer effect ${attribute.id} has no trusted presentation label.`);
  }
  if (attribute.name !== trusted) {
    throw new Error(
      `Optimizer effect ${attribute.id} is ${JSON.stringify(attribute.name)}; expected ${JSON.stringify(trusted)}.`,
    );
  }
}

const modules = ["0", "1", "2", "3"].map((instance_id) => ({
  instance_id,
  config_id: 5_500_101,
  quality: 2,
  parts: [
    { part_id: 1110, initial_link_points: 4 },
    { part_id: 1111, initial_link_points: 4 },
  ],
}));
const response = JSON.parse(optimizeJson(JSON.stringify({
  modules,
  current_instance_ids: modules.map((module) => module.instance_id),
  target_attributes: [],
  exclude_attributes: [],
  min_attr_requirements: {},
  combination_size: 4,
  max_solutions: 5,
  search_mode: "exact",
  beam_width: 1_000,
  minimum_module_total: null,
  require_target_match: false,
})));
if (response.current_setup?.score !== 520 || response.current_setup.ranking_score !== 520) {
  throw new Error(
    `Optimizer WASM score fixture returned ${JSON.stringify(response.current_setup)}; expected score and ranking score 520.`,
  );
}
if (response.scoring_revision !== catalog.scoring_revision) {
  throw new Error("Optimizer WASM response and public catalog use different scoring revisions.");
}

console.log(
  `Optimizer WASM catalog ${catalog.catalog_revision}: ${catalog.attributes.length} trusted effect labels and score fixture verified.`,
);
