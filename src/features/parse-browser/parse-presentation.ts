export interface ParsePresentationCatalog {
  schema_version: 2;
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
    rdps_effect_count: number;
    localized_rdps_effect_count: number;
    uncovered_rdps_effect_ids: readonly string[];
  };
  actions: Readonly<Record<string, string>>;
  effects: Readonly<Record<string, string>>;
}

const catalogUrl = `${import.meta.env.BASE_URL}data/bpsr/parse-presentation.en-US.v2.json?schema=2&labels=reviewed-observed-v1&authority=protocol-v1`;
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
  publishedName: string | null,
): string {
  return humanName(catalog?.actions[abilityId] ?? null) ?? humanName(publishedName) ?? unlocalizedLabel("action", abilityId);
}

export function localizedEffectName(
  catalog: ParsePresentationCatalog | undefined,
  effectId: string,
  publishedName: string | null,
): string {
  return humanName(catalog?.effects[effectId] ?? null) ?? humanName(publishedName) ?? unlocalizedLabel("effect", effectId);
}

export function presentationForReport(
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
  schemaVersion: 6 | 7,
  entry: CatalogPresentationIdentity,
): ParsePresentationCatalog | undefined {
  return schemaVersion === 7
    ? presentationForReport(catalog, entry.deployment_id, entry.client_build ?? "", entry.protocol_pack_digest ?? undefined)
    : undefined;
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

function unlocalizedLabel(kind: "action" | "effect", id: string): string {
  const numericId = id.trim();
  return /^\d+$/u.test(numericId)
    ? `Unlocalized combat ${kind} #${numericId}`
    : `Unlocalized combat ${kind}`;
}

function isCatalog(value: unknown): value is ParsePresentationCatalog {
  return (
    isRecord(value) &&
    value.schema_version === 2 &&
    value.locale === "en-US" &&
    typeof value.deployment_id === "string" &&
    value.deployment_id.length > 0 &&
    typeof value.game_build === "string" &&
    value.game_build.length > 0 &&
    typeof value.protocol_pack_digest === "string" &&
    /^sha256:[a-f0-9]{64}$/u.test(value.protocol_pack_digest) &&
    typeof value.source === "string" &&
    isStringRecord(value.actions) &&
    isStringRecord(value.effects)
  );
}

function isStringRecord(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
