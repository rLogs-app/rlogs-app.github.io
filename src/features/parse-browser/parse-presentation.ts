export interface ParsePresentationCatalog {
  schema_version: 5;
  locale: "en-US";
  deployment_id: string;
  game_build: string;
  protocol_pack_digest: string;
  source: string;
  coverage?: {
    scope: string;
    observed_action_count: number;
    localized_observed_action_count: number;
    uncovered_action_ids: readonly string[];
    reviewed_action_count: number;
    saved_history_observed_action_count?: number;
    saved_history_localized_observed_action_count?: number;
    captured_public_promotion_count?: number;
    trusted_enrichment_count?: number;
    trusted_enrichment_action_ids?: readonly string[];
    conflicting_action_ids?: readonly string[];
    public_action_observation?: {
      captured_at: string;
      list_endpoint: string;
      report_detail_endpoint_template: string;
      report_count: number;
    };
    rdps_effect_count: number;
    localized_rdps_effect_count: number;
    uncovered_rdps_effect_ids: readonly string[];
    battle_imagine_count: number;
    localized_battle_imagine_count: number;
    uncovered_battle_imagine_skill_ids: readonly string[];
    module_count: number;
    localized_module_count: number;
    uncovered_module_ids: readonly string[];
    module_effect_count: number;
    localized_module_effect_count: number;
    uncovered_module_effect_ids: readonly string[];
  };
  actions: Readonly<Record<string, string>>;
  /** Site-owned icon paths keyed by exact-build action ID. */
  action_icons?: Readonly<Record<string, string>>;
  effects: Readonly<Record<string, string>>;
  imagines: Readonly<Record<string, string>>;
  modules: Readonly<Record<string, string>>;
  module_effects: Readonly<Record<string, string>>;
  scenes: Readonly<Record<string, string>>;
  classes: Readonly<Record<string, string>>;
  specializations: Readonly<Record<string, string>>;
}

const catalogUrl = `${import.meta.env.BASE_URL}data/bpsr/parse-presentation.en-US.v5.json?schema=5&labels=trusted-id-catalog-v1`;
let request: Promise<ParsePresentationCatalog> | undefined;

export function loadParsePresentation(): Promise<ParsePresentationCatalog> {
  request ??= fetch(catalogUrl, { cache: "no-cache" }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`BPSR parse localization request failed with HTTP ${response.status}.`);
    }
    const value: unknown = await response.json();
    if (!isCatalog(value)) throw new Error("The BPSR parse localization catalog is invalid.");
    return value;
  });
  return request;
}

export function localizedActionName(
  catalog: ParsePresentationCatalog | undefined,
  abilityId: string,
  _publishedName: string | null,
): string {
  return humanName(catalog?.actions[abilityId] ?? null) ?? unlocalizedLabel("action", abilityId);
}

export function localizedEffectName(
  catalog: ParsePresentationCatalog | undefined,
  effectId: string,
  _publishedName: string | null,
): string {
  return humanName(catalog?.effects[effectId] ?? null) ?? unlocalizedLabel("effect", effectId);
}

export function localizedImagineName(
  catalog: ParsePresentationCatalog | undefined,
  skillId: string,
): string {
  return humanName(catalog?.imagines[skillId] ?? null) ?? unlocalizedLabel("imagine", skillId);
}

export function localizedModuleName(
  catalog: ParsePresentationCatalog | undefined,
  configId: string,
): string {
  return humanName(catalog?.modules[configId] ?? null) ?? unlocalizedLabel("module", configId);
}

export function localizedModuleEffectName(
  catalog: ParsePresentationCatalog | undefined,
  effectId: string,
): string {
  return humanName(catalog?.module_effects[effectId] ?? null) ?? unlocalizedLabel("module effect", effectId);
}

export function localizedSceneName(
  catalog: ParsePresentationCatalog | undefined,
  sceneId: number | string | null | undefined,
): string {
  if (sceneId == null) return "Scene unresolved";
  const id = String(sceneId);
  return humanName(catalog?.scenes[id] ?? null) ?? `Scene #${id}`;
}

/** Stable labels carry forward across non-seasonal builds. When the bundled
 * catalog has not learned a new scene yet, accept the server-retained label
 * only with a complete producer identity; otherwise keep the numeric evidence. */
export function localizedSceneNameWithAuthority(
  catalog: ParsePresentationCatalog | undefined,
  sceneId: number | string | null | undefined,
  attachedName: string | null | undefined,
  identity: NullablePresentationIdentity | null | undefined,
): string {
  if (sceneId == null) return "Scene unresolved";
  const id = String(sceneId);
  return humanName(catalog?.scenes[id] ?? null)
    ?? (completePresentationIdentity(identity) ? humanName(attachedName ?? null) : undefined)
    ?? `Scene #${id}`;
}

export function localizedClassName(
  catalog: ParsePresentationCatalog | undefined,
  classId: number | string | null | undefined,
): string | undefined {
  if (classId == null) return undefined;
  const id = String(classId);
  return humanName(catalog?.classes[id] ?? null) ?? `Class #${id}`;
}

export function localizedSpecializationName(
  catalog: ParsePresentationCatalog | undefined,
  specializationId: number | string | null | undefined,
): string | undefined {
  if (specializationId == null) return undefined;
  const id = String(specializationId);
  return humanName(catalog?.specializations[id] ?? null) ?? `Specialization #${id}`;
}

export async function renderCoreWithOptionalPresentation<T>(
  coreRequest: Promise<T>,
  presentationRequest: Promise<ParsePresentationCatalog | undefined>,
  render: (core: T, presentation: ParsePresentationCatalog | undefined) => void,
): Promise<T> {
  const core = await coreRequest;
  render(core, undefined);
  void presentationRequest.then(
    (presentation) => { if (presentation) render(core, presentation); },
    () => undefined,
  );
  return core;
}

export function presentationForReport(
  catalog: ParsePresentationCatalog | undefined,
  _deploymentId: string,
  _clientBuild: string,
  _protocolPackDigest: string | undefined,
): ParsePresentationCatalog | undefined {
  return catalog;
}

export function semanticPresentationForReport(
  catalog: ParsePresentationCatalog | undefined,
  deploymentId: string,
  clientBuild: string,
  protocolPackDigest: string | undefined,
): ParsePresentationCatalog | undefined {
  if (
    !catalog ||
    catalog.deployment_id !== deploymentId ||
    catalog.game_build !== clientBuild ||
    catalog.protocol_pack_digest !== protocolPackDigest
  ) {
    return undefined;
  }
  return catalog;
}

export interface CatalogPresentationIdentity {
  deployment_id: string;
  client_build?: string | null;
  protocol_pack_digest?: string | null;
}

export function presentationForCatalogEntry(
  catalog: ParsePresentationCatalog | undefined,
  _schemaVersion: 6 | 7,
  _entry: CatalogPresentationIdentity,
): ParsePresentationCatalog | undefined {
  return catalog;
}

export function semanticPresentationForCatalogEntry(
  catalog: ParsePresentationCatalog | undefined,
  schemaVersion: 6 | 7,
  entry: CatalogPresentationIdentity,
): ParsePresentationCatalog | undefined {
  return schemaVersion === 7
    ? semanticPresentationForReport(catalog, entry.deployment_id, entry.client_build ?? "", entry.protocol_pack_digest ?? undefined)
    : undefined;
}

export interface NullablePresentationIdentity {
  deployment_id: string | null;
  client_build: string | null;
  protocol_pack_digest: string | null;
}

export function presentationForIdentity(
  catalog: ParsePresentationCatalog | undefined,
  _identity: NullablePresentationIdentity | null | undefined,
): ParsePresentationCatalog | undefined {
  return catalog;
}

export function semanticPresentationForIdentity(
  catalog: ParsePresentationCatalog | undefined,
  identity: NullablePresentationIdentity | null | undefined,
): ParsePresentationCatalog | undefined {
  return identity?.deployment_id != null && identity.client_build != null && identity.protocol_pack_digest != null
    ? semanticPresentationForReport(catalog, identity.deployment_id, identity.client_build, identity.protocol_pack_digest)
    : undefined;
}

function completePresentationIdentity(identity: NullablePresentationIdentity | null | undefined): boolean {
  return typeof identity?.deployment_id === "string" && identity.deployment_id.trim().length > 0
    && typeof identity.client_build === "string" && identity.client_build.trim().length > 0
    && typeof identity.protocol_pack_digest === "string"
    && /^sha256:[0-9a-f]{64}$/u.test(identity.protocol_pack_digest);
}

function humanName(value: string | null): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  if (
    trimmed === "" ||
    /^(?:skill|effect|action|status)(?:\s+|\s*#?)\d+$/iu.test(trimmed) ||
    /^\d+$/u.test(trimmed) ||
    /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/u.test(trimmed) ||
    /(?:^|[^A-Za-z])(?:ATK|AIRATK|EXATK|DODGE|FRACTURE_ATK|SKILL(?:_?\d+)?|UTR_SKILL)(?:$|[^A-Za-z])/u.test(trimmed) ||
    trimmed.includes("_") ||
    /^[a-z]+(?:[A-Z][A-Za-z0-9]*){2,}$/u.test(trimmed)
  ) {
    return undefined;
  }
  return trimmed;
}

function unlocalizedLabel(kind: "action" | "effect" | "imagine" | "module" | "module effect", id: string): string {
  const numericId = id.trim();
  return /^\d+$/u.test(numericId)
    ? `Unlocalized combat ${kind} #${numericId}`
    : `Unlocalized combat ${kind}`;
}

function isCatalog(value: unknown): value is ParsePresentationCatalog {
  return (
    isRecord(value) &&
    value.schema_version === 5 &&
    value.locale === "en-US" &&
    typeof value.deployment_id === "string" &&
    value.deployment_id.length > 0 &&
    typeof value.game_build === "string" &&
    value.game_build.length > 0 &&
    typeof value.protocol_pack_digest === "string" &&
    /^sha256:[a-f0-9]{64}$/u.test(value.protocol_pack_digest) &&
    typeof value.source === "string" &&
    isStringRecord(value.actions) &&
    (value.action_icons === undefined || isStringRecord(value.action_icons)) &&
    isStringRecord(value.effects) &&
    isStringRecord(value.imagines) &&
    isStringRecord(value.modules) &&
    isStringRecord(value.module_effects) &&
    isStringRecord(value.scenes) &&
    isStringRecord(value.classes) &&
    isStringRecord(value.specializations)
  );
}

function isStringRecord(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
