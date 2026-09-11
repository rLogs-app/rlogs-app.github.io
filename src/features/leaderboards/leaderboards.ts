import { fetchPublicRead } from "../../public-api";
import {
  localizedClassName,
  localizedSceneName,
  localizedSpecializationName,
  loadParsePresentation,
  type ParsePresentationCatalog,
} from "../parse-browser/parse-presentation";

const apiBase = String(import.meta.env.VITE_RLOGS_API_BASE_URL ?? "").replace(/\/$/u, "");

export const seasonThreeActivities = [
  [1150, "Void - Towering Ruin"],
  [1633, "Void - Tina's Mindrealm"],
  [6515, "Cursed Radiant Tomb"],
  [6525, "Mech Facility"],
  [6545, "Mistveil Hunting Ground"],
  [6565, "Sea-Ringed Reef"],
] as const;

export const trainingClassFilters = [
  { id: 1, name: "Stormblade", specializations: [[101, "Iaido Slash"], [102, "Moonstrike"]] },
  { id: 2, name: "Frost Mage", specializations: [[104, "Icicle"], [105, "Frostbeam"]] },
  { id: 3, name: "Twin Striker", specializations: [[128, "Formless"], [129, "Crimson"]] },
  { id: 4, name: "Wind Knight", specializations: [[107, "Vanguard"], [108, "Skyward"]] },
  { id: 5, name: "Verdant Oracle", specializations: [[110, "Smite"], [111, "Lifebind"]] },
  { id: 9, name: "Heavy Guardian", specializations: [[113, "Earthfort"], [114, "Block"]] },
  { id: 11, name: "Marksman", specializations: [[116, "Wildpack"], [117, "Falconry"]] },
  { id: 12, name: "Shield Knight", specializations: [[122, "Recovery"], [123, "Shield"]] },
  { id: 13, name: "Beat Performer", specializations: [[119, "Dissonance"], [120, "Concerto"]] },
] as const;

interface RankedIdentity {
  character_id: string;
  display_name: string | null;
  deployment_id: string;
  region_id: string;
  realm_id: string | null;
}

interface LeaderboardIdentity extends RankedIdentity {
  profile_id: string;
  observed_unix_millis: number;
}

interface MasterScoreEntry extends LeaderboardIdentity {
  master_score: number;
}

interface DungeonTimeEntry extends LeaderboardIdentity {
  activity_id: number;
  tier: number;
  score: number | null;
  pass_time_seconds: number;
  completion_count: number | null;
}

export interface ProfileLeaderboard {
  schema_version: 1;
  season_id: number;
  region_id: string | null;
  activity_id: number | null;
  tier: number;
  master_scores: MasterScoreEntry[];
  dungeon_times: DungeonTimeEntry[];
}

interface TrainingDummyEntry {
  result_id: string;
  character_id: string;
  display_name: string | null;
  deployment_id: string;
  region_id: string;
  realm_id: string | null;
  world_id: string | null;
  season_id: number;
  class_id: number;
  specialization_id: number;
  target_monster_id: 115 | 122;
  duration_micros: 180_000_000;
  total_damage: number;
  dps: number;
  created_unix_millis: number;
  verified_unix_millis: number;
}

export interface TrainingDummyLeaderboard {
  schema_version: 1;
  season_id: number;
  region_id: string | null;
  class_id: number | null;
  specialization_id: number | null;
  duration_micros: 180_000_000;
  results: TrainingDummyEntry[];
}

export async function mountLeaderboards(): Promise<void> {
  const season = requiredSelect("leaderboard-season");
  const region = requiredSelect("leaderboard-region");
  const activity = requiredSelect("leaderboard-activity");
  const tier = requiredSelect("leaderboard-tier");
  const trainingSeason = requiredSelect("training-dummy-season");
  const trainingRegion = requiredSelect("training-dummy-region");
  const trainingClass = requiredSelect("training-dummy-class");
  const trainingSpecialization = requiredSelect("training-dummy-specialization");
  const presentation = await loadParsePresentation().catch(() => undefined);
  for (const [id, name] of seasonThreeActivities) {
    activity.add(new Option(presentation ? localizedSceneName(presentation, id) : name, String(id)));
  }
  activity.value = "1633";
  for (let value = 20; value >= 1; value -= 1) tier.add(new Option(`M${value}`, String(value)));
  tier.value = "20";
  for (const entry of trainingClassFilters) {
    trainingClass.add(new Option(
      presentation ? localizedClassName(presentation, entry.id) ?? entry.name : entry.name,
      String(entry.id),
    ));
  }
  populateTrainingSpecializations(trainingSpecialization, trainingClass.value, presentation);

  const refresh = async (): Promise<void> => {
    setLoading();
    if (!apiBase) return setFailure("Rankings are available on the published site.");
    const query = new URLSearchParams({
      season: season.value,
      activity: activity.value,
      tier: tier.value,
      limit: "100",
    });
    if (region.value) query.set("region", region.value);
    try {
      const response = await fetchPublicRead(`${apiBase}/v1/leaderboards/profiles?${query}`);
      const value: unknown = await response.json();
      if (!response.ok || !isProfileLeaderboard(value)) throw new Error("invalid leaderboard response");
      renderLeaderboard(value);
    } catch {
      setFailure("Profile rankings are temporarily unavailable.");
    }
  };

  for (const control of [season, region, activity, tier]) control.addEventListener("change", () => void refresh());
  const refreshTraining = async (): Promise<void> => {
    setTrainingLoading();
    if (!apiBase) return setTrainingFailure("Rankings are available on the published site.");
    const query = new URLSearchParams({ season: trainingSeason.value, limit: "100" });
    if (trainingRegion.value) query.set("region", trainingRegion.value);
    if (trainingClass.value) query.set("class", trainingClass.value);
    if (trainingSpecialization.value) query.set("specialization", trainingSpecialization.value);
    try {
      const response = await fetchPublicRead(`${apiBase}/v1/leaderboards/training-dummy?${query}`);
      const value: unknown = await response.json();
      if (!response.ok || !isTrainingDummyLeaderboard(value)) {
        throw new Error("invalid training-dummy leaderboard response");
      }
      renderTrainingDummyLeaderboard(value, presentation);
    } catch {
      setTrainingFailure("Target-dummy rankings are temporarily unavailable.");
    }
  };
  trainingClass.addEventListener("change", () => {
    populateTrainingSpecializations(trainingSpecialization, trainingClass.value, presentation);
    void refreshTraining();
  });
  for (const control of [trainingSeason, trainingRegion, trainingSpecialization]) {
    control.addEventListener("change", () => void refreshTraining());
  }
  await Promise.all([refresh(), refreshTraining()]);
}

export function isProfileLeaderboard(value: unknown): value is ProfileLeaderboard {
  if (!isRecord(value) || value.schema_version !== 1 || !positiveInteger(value.season_id) ||
      !(value.region_id === null || typeof value.region_id === "string") ||
      !(value.activity_id === null || positiveInteger(value.activity_id)) ||
      !positiveInteger(value.tier) || !Array.isArray(value.master_scores) || !Array.isArray(value.dungeon_times)) return false;
  return value.master_scores.every((entry) => isRecord(entry) && identity(entry) && nonnegativeInteger(entry.master_score)) &&
    value.dungeon_times.every((entry) => isRecord(entry) && identity(entry) && positiveInteger(entry.activity_id) &&
      positiveInteger(entry.tier) && positiveInteger(entry.pass_time_seconds) &&
      (entry.score === null || nonnegativeInteger(entry.score)) &&
      (entry.completion_count === null || nonnegativeInteger(entry.completion_count)));
}

export function isTrainingDummyLeaderboard(value: unknown): value is TrainingDummyLeaderboard {
  if (!isRecord(value) || value.schema_version !== 1 || !positiveInteger(value.season_id) ||
      !(value.region_id === null || typeof value.region_id === "string") ||
      !(value.class_id === null || positiveInteger(value.class_id)) ||
      !(value.specialization_id === null || positiveInteger(value.specialization_id)) ||
      value.duration_micros !== 180_000_000 || !Array.isArray(value.results)) return false;
  return value.results.every((entry) => isRecord(entry) &&
    typeof entry.result_id === "string" && typeof entry.character_id === "string" &&
    (entry.display_name === null || typeof entry.display_name === "string") &&
    typeof entry.deployment_id === "string" && typeof entry.region_id === "string" &&
    (entry.realm_id === null || typeof entry.realm_id === "string") &&
    (entry.world_id === null || typeof entry.world_id === "string") &&
    positiveInteger(entry.season_id) && positiveInteger(entry.class_id) &&
    positiveInteger(entry.specialization_id) &&
    (entry.target_monster_id === 115 || entry.target_monster_id === 122) &&
    entry.duration_micros === 180_000_000 && positiveInteger(entry.total_damage) &&
    positiveNumber(entry.dps) && positiveInteger(entry.created_unix_millis) &&
    positiveInteger(entry.verified_unix_millis));
}

function populateTrainingSpecializations(
  select: HTMLSelectElement,
  classValue: string,
  presentation: ParsePresentationCatalog | undefined,
): void {
  const selected = select.value;
  select.replaceChildren(new Option("All specializations", ""));
  const requestedClass = Number.parseInt(classValue, 10);
  for (const entry of trainingClassFilters) {
    if (Number.isSafeInteger(requestedClass) && entry.id !== requestedClass) continue;
    for (const [id, name] of entry.specializations) {
      const className = presentation ? localizedClassName(presentation, entry.id) ?? entry.name : entry.name;
      const specializationName = presentation
        ? localizedSpecializationName(presentation, id) ?? name
        : name;
      const label = Number.isSafeInteger(requestedClass)
        ? specializationName
        : `${className} · ${specializationName}`;
      select.add(new Option(label, String(id)));
    }
  }
  if ([...select.options].some((option) => option.value === selected)) select.value = selected;
}

export function formatClearTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function renderLeaderboard(value: ProfileLeaderboard): void {
  const scoreList = required("master-score-ranking");
  const timeList = required("master-time-ranking");
  scoreList.replaceChildren(...value.master_scores.map((entry, index, entries) => rankingRow(
    entry, competitionRank(entries.map((candidate) => candidate.master_score), index),
    entry.master_score.toLocaleString(), "Master Score",
  )));
  timeList.replaceChildren(...value.dungeon_times.map((entry, index, entries) => rankingRow(
    entry, competitionRank(entries.map((candidate) => candidate.pass_time_seconds), index),
    formatClearTime(entry.pass_time_seconds),
    `${entry.completion_count?.toLocaleString() ?? "Observed"} clear${entry.completion_count === 1 ? "" : "s"}`,
  )));
  if (value.master_scores.length === 0) scoreList.append(emptyRow("No verified Master Scores for this season and region."));
  if (value.dungeon_times.length === 0) timeList.append(emptyRow("No verified clear times for this dungeon and tier yet."));
  const status = required("leaderboard-status");
  status.textContent = `${value.master_scores.length.toLocaleString()} ranked profiles`;
  status.className = "status-chip success";
}

function renderTrainingDummyLeaderboard(
  value: TrainingDummyLeaderboard,
  presentation: ParsePresentationCatalog | undefined,
): void {
  const list = required("training-dummy-ranking");
  list.replaceChildren(...value.results.map((entry, index, entries) => rankingRow(
    entry,
    competitionRank(entries.map((candidate) => candidate.dps), index),
    `${formatDps(entry.dps)} DPS`,
    `${entry.total_damage.toLocaleString()} damage · ${trainingSpecializationName(
      entry.class_id,
      entry.specialization_id,
      presentation,
    )}`,
  )));
  if (value.results.length === 0) {
    list.append(emptyRow("No verified solo target-dummy tests match these filters yet."));
  }
  const status = required("training-dummy-status");
  status.textContent = `${value.results.length.toLocaleString()} verified test${value.results.length === 1 ? "" : "s"}`;
  status.className = "status-chip success";
}

export function competitionRank(sortedValues: number[], index: number): number {
  if (index <= 0) return 1;
  return sortedValues[index] === sortedValues[index - 1]
    ? competitionRank(sortedValues, index - 1)
    : index + 1;
}

function rankingRow(entry: RankedIdentity, rank: number, primary: string, secondary: string): HTMLLIElement {
  const row = document.createElement("li");
  row.className = "leaderboard-row";
  const identityBlock = document.createElement("div");
  identityBlock.className = "leaderboard-rank-identity";
  const rankLabel = document.createElement("span");
  rankLabel.className = "leaderboard-rank";
  rankLabel.textContent = String(rank);
  const link = document.createElement("a");
  link.className = "leaderboard-identity";
  link.href = `/profiles/?profile=${encodeURIComponent(entry.character_id)}`;
  const name = document.createElement("strong");
  name.textContent = entry.display_name?.trim() || `UID ${entry.character_id}`;
  const metadata = document.createElement("small");
  metadata.textContent = `${regionName(entry.region_id)} · UID ${entry.character_id}`;
  link.append(name, metadata);
  identityBlock.append(rankLabel, link);
  const value = document.createElement("span");
  value.className = "leaderboard-value";
  value.textContent = primary;
  const detail = document.createElement("small");
  detail.textContent = secondary;
  value.append(detail);
  row.append(identityBlock, value);
  return row;
}

function emptyRow(message: string): HTMLLIElement {
  const row = document.createElement("li");
  row.className = "empty-state";
  row.textContent = message;
  return row;
}

function setLoading(): void {
  const status = required("leaderboard-status");
  status.textContent = "Loading rankings…";
  status.className = "status-chip neutral";
  required("master-score-ranking").innerHTML = '<li class="empty-state">Loading scores…</li>';
  required("master-time-ranking").innerHTML = '<li class="empty-state">Loading times…</li>';
}

function setFailure(message: string): void {
  const status = required("leaderboard-status");
  status.textContent = "Unavailable";
  status.className = "status-chip warning";
  required("master-score-ranking").replaceChildren(emptyRow(message));
  required("master-time-ranking").replaceChildren(emptyRow(message));
}

function setTrainingLoading(): void {
  const status = required("training-dummy-status");
  status.textContent = "Loading rankings…";
  status.className = "status-chip neutral";
  required("training-dummy-ranking").replaceChildren(emptyRow("Loading dummy results…"));
}

function setTrainingFailure(message: string): void {
  const status = required("training-dummy-status");
  status.textContent = "Unavailable";
  status.className = "status-chip warning";
  required("training-dummy-ranking").replaceChildren(emptyRow(message));
}

function trainingSpecializationName(
  classId: number,
  specializationId: number,
  presentation: ParsePresentationCatalog | undefined,
): string {
  const classEntry = trainingClassFilters.find((entry) => entry.id === classId);
  const specialization = classEntry?.specializations.find(([id]) => id === specializationId);
  if (presentation) {
    return `${localizedClassName(presentation, classId) ?? `Class ${classId}`} · ${
      localizedSpecializationName(presentation, specializationId) ?? `Spec ${specializationId}`
    }`;
  }
  if (!classEntry) return `Class ${classId} · Spec ${specializationId}`;
  return `${classEntry.name} · ${specialization?.[1] ?? `Spec ${specializationId}`}`;
}

function formatDps(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
}

function identity(value: unknown): value is LeaderboardIdentity {
  return isRecord(value) && typeof value.profile_id === "string" && typeof value.character_id === "string" &&
    (value.display_name === null || typeof value.display_name === "string") &&
    typeof value.deployment_id === "string" && typeof value.region_id === "string" &&
    (value.realm_id === null || typeof value.realm_id === "string") && positiveInteger(value.observed_unix_millis);
}

function regionName(value: string): string {
  return value.split("-").map((word) => word ? `${word[0].toUpperCase()}${word.slice(1)}` : word).join(" ");
}

function required(id: string): HTMLElement {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing #${id}.`);
  return value;
}

function requiredSelect(id: string): HTMLSelectElement {
  const value = required(id);
  if (!(value instanceof HTMLSelectElement)) throw new Error(`#${id} is not a select.`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function nonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function positiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
