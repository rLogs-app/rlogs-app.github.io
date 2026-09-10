const unsupportedScript = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/u;
const numericPlaceholder = /^(?:skill|effect|action|status)(?:\s+|\s*#?)\d+$/iu;
const internalToken = /(?:^|[^A-Za-z])(?:ATK|AIRATK|EXATK|DODGE|FRACTURE_ATK|SKILL(?:_?\d+)?|UTR_SKILL)(?:$|[^A-Za-z])/u;
const compactCamelIdentifier = /^[a-z]+(?:[A-Z][A-Za-z0-9]*){2,}$/u;

/**
 * Accept only strings that are suitable to present as English UI labels.
 * This is deliberately a presentation gate, not a translation heuristic:
 * rejected source identities remain available through their numeric IDs.
 */
export function reviewedEnglishLabel(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (
    trimmed === "" ||
    /^\d+$/u.test(trimmed) ||
    numericPlaceholder.test(trimmed) ||
    unsupportedScript.test(trimmed) ||
    internalToken.test(trimmed) ||
    trimmed.includes("_") ||
    compactCamelIdentifier.test(trimmed)
  ) {
    return undefined;
  }
  return trimmed;
}

export function containsUnsupportedEnglishPresentation(value) {
  return typeof value === "string" && reviewedEnglishLabel(value) === undefined;
}
