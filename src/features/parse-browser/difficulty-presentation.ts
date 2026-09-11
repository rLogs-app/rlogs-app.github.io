import type { MessageResolver } from "../../localization/messages";

export interface DifficultyPresentationIdentity {
  activity_family_id?: string | null;
  difficulty_family?: string | null;
  difficulty_tier?: number | null;
}

const difficultyLessActivityFamilies = new Set(["stimen-vaults"]);

export function supplementalDifficultyLabel(
  identity: DifficultyPresentationIdentity,
  sceneLabel: string,
  presentationAuthorized: boolean,
  messages: MessageResolver,
  unresolvedWhenAbsent = true,
): string | null {
  if (!presentationAuthorized) {
    return identity.difficulty_tier == null
      ? unresolvedWhenAbsent ? messages.message("parse.report.difficulty_unresolved") : null
      : messages.message("parse.report.difficulty_tier", { tier: identity.difficulty_tier });
  }
  if (
    identity.difficulty_family == null &&
    identity.difficulty_tier == null &&
    identity.activity_family_id != null &&
    difficultyLessActivityFamilies.has(identity.activity_family_id)
  ) {
    return null;
  }
  const difficulty = identity.difficulty_family === "master"
    ? identity.difficulty_tier == null
      ? messages.message("parse.report.difficulty_master_tier_unresolved")
      : messages.message("parse.report.difficulty_master_tier", { tier: identity.difficulty_tier })
    : identity.difficulty_family
      ? [formatIdentifier(identity.difficulty_family), identity.difficulty_tier == null ? "" : ` ${identity.difficulty_tier}`].join("")
      : identity.difficulty_tier == null
        ? unresolvedWhenAbsent ? messages.message("parse.report.difficulty_unresolved") : null
        : messages.message("parse.report.difficulty_tier", { tier: identity.difficulty_tier });
  if (difficulty == null) return null;
  const normalizedScene = normalizedLabel(sceneLabel);
  const normalizedDifficulty = normalizedLabel(difficulty);
  return normalizedScene && normalizedDifficulty && ` ${normalizedScene} `.includes(` ${normalizedDifficulty} `)
    ? null
    : difficulty;
}

function formatIdentifier(value: string): string {
  return value.replace(/[_-]+/gu, " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function normalizedLabel(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
