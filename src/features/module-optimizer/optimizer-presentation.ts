import type { ProfilePresentationCatalog, PresentationRecord } from "../profiles/profile-presentation";
import type { ModuleCandidate } from "./optimizer-types";

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

export function moduleCardModel(
  module: ModuleCandidate,
  catalog: ProfilePresentationCatalog,
): ModuleCardModel {
  const localized = catalog.modules[String(module.config_id)];
  const effects = module.parts.map((part) => {
    const effect = catalog.module_effects[String(part.part_id)];
    return {
      id: part.part_id,
      name: effect?.name ?? "Unknown effect",
      icon: effect?.icon,
      link: Math.max(0, part.initial_link_points),
    };
  });
  const name = localized?.name ?? "Unknown module";
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
