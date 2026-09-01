import {
  isPublicParseCatalog,
  type PublicParseCatalog,
  type PublicParseCatalogEntry,
} from "../../contracts/public-parse";
import {
  isPublicProfileCatalog,
  type PublicProfileCatalog,
} from "../../contracts/public-profiles";

const apiBase = String(import.meta.env.VITE_RLOGS_API_BASE_URL ?? "").replace(/\/$/u, "");

export interface SceneRanking {
  key: string;
  label: string;
  floor?: number;
  entries: PublicParseCatalogEntry[];
}

export async function mountHome(): Promise<void> {
  const recent = required("home-recent-parses");
  const profiles = required("home-latest-profiles");
  const rankings = required("home-rankings");
  if (!apiBase) {
    setUnavailable("home-parse-status", recent, "Recent submissions are available on the published site.");
    setUnavailable("home-profile-status", profiles, "Recently seen players are available on the published site.");
    setUnavailable("home-ranking-status", rankings, "Scene rankings are available on the published site.");
    return;
  }

  const [parseResult, profileResult] = await Promise.allSettled([
    fetchTyped(`${apiBase}/v1/parses?limit=250`, isPublicParseCatalog),
    fetchTyped(`${apiBase}/v1/profiles`, isPublicProfileCatalog),
  ]);

  if (parseResult.status === "fulfilled") {
    renderRecentParses(parseResult.value, recent);
    renderRankings(parseResult.value, rankings);
  } else {
    setUnavailable("home-parse-status", recent, "Recent parse submissions are temporarily unavailable.");
    setUnavailable("home-ranking-status", rankings, "Scene rankings are temporarily unavailable.");
  }

  if (profileResult.status === "fulfilled") {
    renderLatestProfiles(profileResult.value, profiles);
  } else {
    setUnavailable("home-profile-status", profiles, "Recently seen players are temporarily unavailable.");
  }
}

export function buildSceneRankings(entries: PublicParseCatalogEntry[]): SceneRanking[] {
  const ranked = entries.filter(
    (entry) => entry.terminal_state === "completed" && entry.total_run_time_micros != null,
  );
  const groups = new Map<string, SceneRanking>();
  const stimen = ranked.filter(isStimenRun);
  const highestStimenFloor = Math.max(0, ...stimen.map(stimenFloor));

  for (const entry of ranked) {
    const floor = stimenFloor(entry);
    if (isStimenRun(entry) && floor !== highestStimenFloor) continue;
    const key = isStimenRun(entry)
      ? `stimen:${highestStimenFloor}`
      : `scene:${entry.scene_id ?? entry.activity_id ?? entry.scene_name ?? "unknown"}`;
    const label = isStimenRun(entry)
      ? `Stimen Remains · Floor ${highestStimenFloor}`
      : entry.scene_name ?? entry.activity_id ?? `Scene ${entry.scene_id ?? "unknown"}`;
    const group = groups.get(key) ?? { key, label, ...(isStimenRun(entry) ? { floor } : {}), entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      entries: group.entries
        .sort((left, right) =>
          Number(left.total_run_time_micros) - Number(right.total_run_time_micros) ||
          right.created_unix_millis - left.created_unix_millis,
        )
        .slice(0, 5),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function renderRecentParses(catalog: PublicParseCatalog, target: HTMLElement): void {
  const status = required("home-parse-status");
  status.textContent = `${catalog.total_entries.toLocaleString()} submitted`;
  status.className = "status-chip success";
  const entries = catalog.entries.slice(0, 6);
  target.innerHTML = entries.length
    ? entries.map((entry) => parseFeedRow(entry)).join("")
    : '<p class="empty-state">No public parses have been submitted yet.</p>';
}

function renderLatestProfiles(catalog: PublicProfileCatalog, target: HTMLElement): void {
  const status = required("home-profile-status");
  status.textContent = `${catalog.profiles.length.toLocaleString()} players`;
  status.className = "status-chip success";
  const profiles = [...catalog.profiles]
    .sort((left, right) => right.updated_unix_millis - left.updated_unix_millis)
    .slice(0, 8);
  target.innerHTML = profiles.length
    ? profiles
        .map((profile) => {
          const location = [profile.region, profile.realm ?? profile.world].filter(Boolean).map(String).join(" · ");
          return `<div class="home-feed-row profile-feed-row"><span><strong>${escapeHtml(profile.display_name ?? `UID ${profile.character_id}`)}</strong><small>${escapeHtml(location || profile.deployment)}</small></span><span><small>Last seen</small><strong>${escapeHtml(relativeTime(profile.updated_unix_millis))}</strong></span></div>`;
        })
        .join("")
    : '<p class="empty-state">No players have synced a public profile yet.</p>';
}

function renderRankings(catalog: PublicParseCatalog, target: HTMLElement): void {
  const groups = buildSceneRankings(catalog.entries);
  const status = required("home-ranking-status");
  status.textContent = groups.length ? `${groups.length} scenes` : "No rankings yet";
  status.className = groups.length ? "status-chip success" : "status-chip neutral";
  target.innerHTML = groups.length
    ? groups
        .map(
          (group) => `<section class="scene-ranking"><h3>${escapeHtml(group.label)}</h3><ol>${group.entries
            .map((entry) => `<li><a href="/parses/?parse=${encodeURIComponent(entry.report_id)}&run=${entry.run_index}"><span>${escapeHtml(entry.region_id)}</span><strong>${formatDuration(entry.total_run_time_micros)}</strong><small>${new Date(entry.created_unix_millis).toLocaleDateString()}</small></a></li>`)
            .join("")}</ol></section>`,
        )
        .join("")
    : '<p class="empty-state">Rankings will appear after the first completed public parse.</p>';
}

function parseFeedRow(entry: PublicParseCatalogEntry): string {
  const name = entry.scene_name ?? entry.activity_id ?? `Scene ${entry.scene_id ?? "unknown"}`;
  return `<a class="home-feed-row" href="/parses/?parse=${encodeURIComponent(entry.report_id)}&run=${entry.run_index}"><span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(entry.region_id)} · ${entry.participant_count} players</small></span><span><small>${escapeHtml(relativeTime(entry.created_unix_millis))}</small><strong>${formatDuration(entry.total_run_time_micros)}</strong></span></a>`;
}

function isStimenRun(entry: PublicParseCatalogEntry): boolean {
  return Boolean(
    entry.activity_family_id?.toLowerCase().includes("stimen") ||
      entry.scene_name?.toLowerCase().includes("stimen") ||
      (entry.scene_id != null && ((entry.scene_id >= 30101 && entry.scene_id <= 30175) || (entry.scene_id >= 31101 && entry.scene_id <= 31175))),
  );
}

function stimenFloor(entry: PublicParseCatalogEntry): number {
  const nameFloor = entry.scene_name?.match(/floor\s*(\d+)/iu)?.[1];
  if (nameFloor) return Number(nameFloor);
  if (entry.scene_id != null && ((entry.scene_id >= 30101 && entry.scene_id <= 30175) || (entry.scene_id >= 31101 && entry.scene_id <= 31175))) {
    return entry.scene_id % 100;
  }
  return entry.difficulty_tier ?? 0;
}

async function fetchTyped<T>(url: string, guard: (value: unknown) => value is T): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Request failed (${response.status}).`);
  const value: unknown = await response.json();
  if (!guard(value)) throw new Error("The server returned an unsupported public contract.");
  return value;
}

function setUnavailable(statusId: string, target: HTMLElement, copy: string): void {
  const status = required(statusId);
  status.textContent = "Unavailable";
  status.className = "status-chip danger";
  target.innerHTML = `<p class="empty-state">${escapeHtml(copy)}</p>`;
}

function relativeTime(timestamp: number): string {
  const seconds = Math.round((timestamp - Date.now()) / 1_000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

function formatDuration(micros: number | null | undefined): string {
  if (micros == null) return "—";
  const seconds = micros / 1_000_000;
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, "0")}`;
}

function escapeHtml(value: string): string {
  const node = document.createElement("span");
  node.textContent = value;
  return node.innerHTML;
}

function required(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing home element #${id}.`);
  return element;
}
