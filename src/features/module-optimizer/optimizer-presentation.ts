import type { ProfilePresentationCatalog, PresentationRecord } from "../profiles/profile-presentation";
import type { ModuleCandidate, ModuleSolution, OptimizerCatalog } from "./optimizer-types";

export interface OptimizerPresentationCatalog extends ProfilePresentationCatalog {
  optimizer_label_catalog_provenance: string;
}

export interface OptimizerPresentationIdentity {
  deployment: string;
  source_client_build?: string;
  source_protocol_pack_digest?: string;
}

interface PublishedPresentationSource {
  source_client_build?: string;
  source_protocol_pack_digest?: string;
}

export function optimizerPresentationIdentityForPublishedSelection(
  deployment: string,
  entry: PublishedPresentationSource,
  selectedLoadout: PublishedPresentationSource | null,
): OptimizerPresentationIdentity {
  const source = selectedLoadout ?? entry;
  return {
    deployment,
    source_client_build: source.source_client_build,
    source_protocol_pack_digest: source.source_protocol_pack_digest,
  };
}

export function optimizerPresentationForIdentity(
  catalog: ProfilePresentationCatalog,
  _identity: OptimizerPresentationIdentity,
): OptimizerPresentationCatalog {
  const locale = catalog.locale ?? "en-US";
  const build = catalog.game_build ? ` build ${catalog.game_build}` : "";
  return {
    ...catalog,
    optimizer_label_catalog_provenance: `Labels from the trusted ${locale} catalog${build}.`,
  };
}

export interface ModuleCardModel {
  name: string;
  icon?: string | null;
  quality: string;
  totalLink: number;
  copyLabel: string;
  searchText: string;
  effects: Array<{
    id: number;
    name: string;
    icon?: string | null;
    link: number;
  }>;
}

export interface LoadoutLinkSummary {
  id: number;
  name: string;
  icon?: string | null;
  link: number;
}

export function loadoutLinkSummary(
  modules: readonly ModuleCandidate[],
  catalog: ProfilePresentationCatalog,
): LoadoutLinkSummary[] {
  const totals = new Map<number, LoadoutLinkSummary>();
  for (const module of modules) {
    for (const effect of moduleCardModel(module, catalog).effects) {
      const existing = totals.get(effect.id);
      totals.set(effect.id, {
        id: effect.id,
        name: effect.name,
        icon: effect.icon,
        link: (existing?.link ?? 0) + effect.link,
      });
    }
  }
  return [...totals.values()].sort((left, right) =>
    right.link - left.link || left.name.localeCompare(right.name));
}

export function moduleCardModel(
  module: ModuleCandidate,
  catalog: ProfilePresentationCatalog,
): ModuleCardModel {
  const localized = catalog.modules[String(module.config_id)];
  const effects = module.parts.map((part) => {
    const effect = catalog.module_effects[String(part.part_id)];
    return {
      id: part.part_id,
      name: effect?.name ?? `Effect ${part.part_id} (unresolved)`,
      icon: effect?.icon,
      link: Math.max(0, part.initial_link_points),
    };
  });
  const name = localized?.name ?? `Module ${module.config_id} (unresolved)`;
  const quality = moduleQualityName(module, localized, catalog);
  const totalLink = effects.reduce((sum, effect) => sum + effect.link, 0);
  const copyLabel = `Copy ${shortInstanceId(module.instance_id)}`;
  return {
    name,
    icon: localized?.icon,
    quality,
    totalLink,
    copyLabel,
    searchText: [name, quality, copyLabel, ...effects.map((effect) => effect.name)]
      .join(" ")
      .toLocaleLowerCase("en-US"),
    effects,
  };
}

export function sortModuleInventory(
  modules: ModuleCandidate[],
  catalog: ProfilePresentationCatalog,
  equippedIds: ReadonlySet<string>,
): ModuleCandidate[] {
  return [...modules].sort((left, right) => {
    const equippedDifference = Number(equippedIds.has(right.instance_id)) - Number(equippedIds.has(left.instance_id));
    if (equippedDifference !== 0) return equippedDifference;
    const qualityDifference = (right.quality ?? 0) - (left.quality ?? 0);
    if (qualityDifference !== 0) return qualityDifference;
    const linkDifference = moduleLinkTotal(right) - moduleLinkTotal(left);
    if (linkDifference !== 0) return linkDifference;
    return moduleCardModel(left, catalog).name.localeCompare(moduleCardModel(right, catalog).name);
  });
}

export function moduleLinkTotal(module: ModuleCandidate): number {
  return module.parts.reduce((sum, part) => sum + Math.max(0, part.initial_link_points), 0);
}

function moduleQualityName(
  module: ModuleCandidate,
  localized: PresentationRecord | undefined,
  catalog: ProfilePresentationCatalog,
): string {
  const quality = module.quality ?? localized?.quality;
  if (quality == null) return "Unrated";
  return catalog.quality_names[String(quality)] ?? `Quality ${quality}`;
}

function shortInstanceId(value: string): string {
  return value.length <= 8 ? `#${value}` : `…${value.slice(-6)}`;
}

export function moduleSolutionScoreSummary(solution: ModuleSolution): string {
  const score = solution.score.toLocaleString("en-US");
  return solution.ranking_score === solution.score
    ? `Score ${score}`
    : `Score ${score} · Priority ${solution.ranking_score.toLocaleString("en-US")}`;
}

export function optimizerScoringStatus(
  catalog: Pick<OptimizerCatalog, "client_builds" | "scoring_revision">,
): string {
  const builds = catalog.client_builds
    .map((build) => Number(build).toLocaleString("en-US"))
    .join(", ");
  return `Reviewed scoring ${catalog.scoring_revision} · catalog build ${builds} · ordinary builds carry forward unless a seasonal update is declared`;
}

export function scoreModuleSet(
  modules: readonly ModuleCandidate[],
  catalog: OptimizerCatalog,
): number {
  const totals = new Map<number, number>();
  let totalLink = 0;
  for (const module of modules) {
    for (const part of module.parts) {
      const link = Math.max(0, part.initial_link_points ?? 0);
      totalLink += link;
      totals.set(part.part_id, (totals.get(part.part_id) ?? 0) + link);
    }
  }
  const linkIndex = Math.min(totalLink, catalog.link_power.length - 1);
  let score = catalog.link_power[linkIndex] ?? 0;
  for (const attribute of catalog.attributes) {
    const total = totals.get(attribute.id) ?? 0;
    for (let index = attribute.thresholds.length - 1; index >= 0; index -= 1) {
      if (total >= (attribute.thresholds[index] ?? Number.POSITIVE_INFINITY)) {
        score += attribute.fight_values[index] ?? 0;
        break;
      }
    }
  }
  return score;
}
