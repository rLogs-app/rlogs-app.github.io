import type { ProfilePresentationCatalog, PresentationRecord } from "../profiles/profile-presentation";
import type { ModuleCandidate } from "./optimizer-types";

// These IDs have identical reviewed en-US labels in the authoritative global
// build 24252055 catalog and the exact-build 24687926 public catalog.
const stableModuleIds = new Set([
  "5500101", "5500102", "5500103", "5500104",
  "5500201", "5500202", "5500203", "5500204",
  "5500301", "5500302", "5500303", "5500304",
]);
const stableEffectIds = new Set([
  "1110", "1111", "1112", "1113", "1114", "1205", "1206",
  "1307", "1308", "1407", "1408", "1409", "1410", "2104",
  "2105", "2204", "2205", "2304", "2404", "2405", "2406",
]);

export type OptimizerPresentationProvenance = "exact" | "carried-forward" | "unavailable";

export interface OptimizerPresentationCatalog extends ProfilePresentationCatalog {
  optimizer_provenance: OptimizerPresentationProvenance;
  optimizer_provenance_label: string;
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

/**
 * Presentation labels are allowed to survive a newer build or protocol pack,
 * but only for reviewed stable IDs in the same deployment. Parser and scoring
 * inputs never pass through this presentation-only compatibility boundary.
 */
export function optimizerPresentationForIdentity(
  catalog: ProfilePresentationCatalog,
  identity: OptimizerPresentationIdentity,
): OptimizerPresentationCatalog {
  const catalogDigestIsValid = /^sha256:[a-f0-9]{64}$/u.test(catalog.protocol_pack_digest ?? "");
  const exact = catalogDigestIsValid
    && typeof catalog.game_build === "string"
    && catalog.deployment_id === identity.deployment
    && catalog.game_build === identity.source_client_build
    && catalog.protocol_pack_digest === identity.source_protocol_pack_digest;
  if (exact) {
    return withProvenance(catalog, "exact", `Exact ${catalog.locale ?? "en-US"} labels for build ${catalog.game_build}.`);
  }

  const catalogBuild = numericBuild(catalog.game_build);
  const sourceBuild = numericBuild(identity.source_client_build);
  const digestIsValid = /^sha256:[a-f0-9]{64}$/u.test(identity.source_protocol_pack_digest ?? "");
  if (
    catalog.deployment_id === identity.deployment
    && catalogDigestIsValid
    && catalogBuild != null
    && sourceBuild != null
    && sourceBuild > catalogBuild
    && digestIsValid
  ) {
    return withProvenance({
      ...catalog,
      modules: stableRecords(catalog.modules, stableModuleIds),
      module_effects: stableRecords(catalog.module_effects, stableEffectIds),
    }, "carried-forward", `Reviewed stable ${catalog.locale ?? "en-US"} labels carried forward from build ${catalog.game_build} to ${identity.source_client_build}.`);
  }

  return withProvenance({ ...catalog, modules: {}, module_effects: {} }, "unavailable", "Module labels are unresolved because same-deployment provenance could not be established.");
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

function numericBuild(value: string | undefined): bigint | undefined {
  return value && /^\d+$/u.test(value) ? BigInt(value) : undefined;
}

function stableRecords(
  records: Record<string, PresentationRecord>,
  stableIds: ReadonlySet<string>,
): Record<string, PresentationRecord> {
  return Object.fromEntries(Object.entries(records).filter(([id]) => stableIds.has(id)));
}

function withProvenance(
  catalog: ProfilePresentationCatalog,
  provenance: OptimizerPresentationProvenance,
  label: string,
): OptimizerPresentationCatalog {
  return { ...catalog, optimizer_provenance: provenance, optimizer_provenance_label: label };
}
