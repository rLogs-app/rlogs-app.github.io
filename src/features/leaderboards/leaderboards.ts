import { fetchPublicRead } from "../../public-api";

const apiBase = String(import.meta.env.VITE_RLOGS_API_BASE_URL ?? "").replace(/\/$/u, "");

export const seasonThreeActivities = [
  [1150, "Void - Towering Ruin"],
  [1633, "Void - Tina's Mindrealm"],
  [6515, "Cursed Radiant Tomb"],
  [6525, "Mech Facility"],
  [6545, "Mistveil Hunting Ground"],
  [6565, "Sea-Ringed Reef"],
] as const;

interface LeaderboardIdentity {
  profile_id: string;
  character_id: string;
  display_name: string | null;
  deployment_id: string;
  region_id: string;
  realm_id: string | null;
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

export async function mountLeaderboards(): Promise<void> {
  const season = requiredSelect("leaderboard-season");
  const region = requiredSelect("leaderboard-region");
  const activity = requiredSelect("leaderboard-activity");
  const tier = requiredSelect("leaderboard-tier");
  for (const [id, name] of seasonThreeActivities) activity.add(new Option(name, String(id)));
  activity.value = "1633";
  for (let value = 20; value >= 1; value -= 1) tier.add(new Option(`M${value}`, String(value)));
  tier.value = "20";

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
  await refresh();
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

export function formatClearTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function renderLeaderboard(value: ProfileLeaderboard): void {
  const scoreList = required("master-score-ranking");
  const timeList = required("master-time-ranking");
  scoreList.replaceChildren(...value.master_scores.map((entry, index) => rankingRow(
    entry, index + 1, entry.master_score.toLocaleString(), "Master Score",
  )));
  timeList.replaceChildren(...value.dungeon_times.map((entry, index) => rankingRow(
    entry, index + 1, formatClearTime(entry.pass_time_seconds),
    `${entry.completion_count?.toLocaleString() ?? "Observed"} clear${entry.completion_count === 1 ? "" : "s"}`,
  )));
  if (value.master_scores.length === 0) scoreList.append(emptyRow("No verified Master Scores for this season and region."));
  if (value.dungeon_times.length === 0) timeList.append(emptyRow("No verified clear times for this dungeon and tier yet."));
  const status = required("leaderboard-status");
  status.textContent = `${value.master_scores.length.toLocaleString()} ranked profiles`;
  status.className = "status-chip success";
}

function rankingRow(entry: LeaderboardIdentity, rank: number, primary: string, secondary: string): HTMLLIElement {
  const row = document.createElement("li");
  row.className = "leaderboard-row";
  const identityBlock = document.createElement("div");
  identityBlock.className = "leaderboard-rank-identity";
  const rankLabel = document.createElement("span");
  rankLabel.className = "leaderboard-rank";
  rankLabel.textContent = String(rank);
  const link = document.createElement("a");
  link.className = "leaderboard-identity";
  link.href = `/profiles/${encodeURIComponent(entry.character_id)}/`;
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
