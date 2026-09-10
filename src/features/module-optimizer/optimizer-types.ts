export interface ModulePartInput {
  part_id: number;
  initial_link_points: number;
}

export interface ModuleCandidate {
  instance_id: string;
  config_id: number;
  quality?: number | null;
  parts: ModulePartInput[];
}

export interface AttributeCatalogEntry {
  id: number;
  name: string;
  official_name: string | null;
  icon: string | null;
  thresholds: number[];
  fight_values: number[];
}

export interface OptimizerCatalog {
  game_id: string;
  catalog_revision: string;
  scoring_revision: string;
  client_builds: string[];
  attributes: AttributeCatalogEntry[];
  link_power: number[];
  combination_sizes: number[];
  default_max_solutions: number;
}

export type SearchMode = "auto" | "exact" | "beam";

export interface OptimizeRequest {
  modules: ModuleCandidate[];
  current_instance_ids: string[];
  target_attributes: number[];
  exclude_attributes: number[];
  min_attr_requirements: Record<string, number>;
  combination_size: number;
  max_solutions: number;
  search_mode: SearchMode;
  beam_width: number;
  minimum_module_total: number | null;
  require_target_match: boolean;
}

export interface AttributeScore {
  attribute_id: number;
  total: number;
  reached_threshold: number | null;
  base_power: number;
  multiplier: number;
  applied_power: number;
}

export interface ModuleSolution {
  instance_ids: string[];
  modules: ModuleCandidate[];
  /** Actual in-game module power without optimizer preference weighting. */
  score: number;
  /** Preference-weighted value used only to order recommendations. */
  ranking_score: number;
  breakdown: {
    threshold_power: number;
    ranking_threshold_power: number;
    total_link_points: number;
    total_link_power: number;
    attributes: AttributeScore[];
  };
}

export interface OptimizeResponse {
  scoring_revision: string;
  catalog_revision: string;
  current_setup: ModuleSolution | null;
  solutions: ModuleSolution[];
  search: {
    requested_mode: SearchMode;
    used_mode: SearchMode;
    exact: boolean;
    input_module_count: number;
    candidate_module_count: number;
    excluded_module_count: number;
    total_combinations: number;
    evaluated_states: number;
    combination_size: number;
    beam_width: number | null;
  };
}

export type OptimizerWorkerRequest =
  | { id: number; kind: "catalog" }
  | { id: number; kind: "optimize"; request: OptimizeRequest };

export type OptimizerWorkerResponse =
  | { id: number; ok: true; value: OptimizerCatalog | OptimizeResponse }
  | { id: number; ok: false; error: string };
