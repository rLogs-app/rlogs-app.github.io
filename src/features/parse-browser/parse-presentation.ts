export interface ParsePresentationCatalog {
  schema_version: 1;
  locale: "en-US";
  game_build: string;
  source: string;
  actions: Readonly<Record<string, string>>;
  effects: Readonly<Record<string, string>>;
}

const catalogUrl = `${import.meta.env.BASE_URL}data/bpsr/parse-presentation.en-US.v1.json?schema=1`;
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
  return humanName(publishedName) ?? catalog?.actions[abilityId] ?? "Unlocalized combat action";
}

export function localizedEffectName(
  catalog: ParsePresentationCatalog | undefined,
  effectId: string,
  publishedName: string | null,
): string {
  return humanName(publishedName) ?? catalog?.effects[effectId] ?? "Unlocalized combat effect";
}

function humanName(value: string | null): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  if (
    trimmed === "" ||
    /^(?:skill|effect|action|status)(?:\s+|\s*#?)\d+$/iu.test(trimmed) ||
    /^\d+$/u.test(trimmed)
  ) {
    return undefined;
  }
  return trimmed;
}

function isCatalog(value: unknown): value is ParsePresentationCatalog {
  return (
    isRecord(value) &&
    value.schema_version === 1 &&
    value.locale === "en-US" &&
    typeof value.game_build === "string" &&
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
