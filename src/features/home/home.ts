import {
  isPublicParseCatalog,
  type PublicParseCatalog,
  type PublicParseCatalogEntry,
} from "../../contracts/public-parse";
import {
  isPublicProfileCatalog,
  type PublicProfileCatalog,
} from "../../contracts/public-profiles";
import {
  isPublicPhotoCatalog,
  type PublicPhotoCatalog,
  type PublicPhotoCatalogEntry,
} from "../../contracts/public-photos";
import {
  isPublicCommunityMilestoneCatalog,
  type PublicCommunityMilestone,
  type PublicCommunityMilestoneCatalog,
} from "../../contracts/public-activity";

const apiBase = String(import.meta.env.VITE_RLOGS_API_BASE_URL ?? "").replace(/\/$/u, "");
const sessionKey = "rlogs.web-session.v1";

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
  const newestPhotos = required("home-newest-photos");
  const popularPhotos = required("home-popular-photos");
  const milestones = required("home-milestones");
  if (!apiBase) {
    setUnavailable("home-parse-status", recent, "Recent submissions are available on the published site.");
    setUnavailable("home-profile-status", profiles, "Recently seen players are available on the published site.");
    setUnavailable("home-ranking-status", rankings, "Scene rankings are available on the published site.");
    setUnavailable("home-photo-status", newestPhotos, "Community photos are available on the published site.");
    popularPhotos.innerHTML = '<p class="empty-state">Popular photos are available on the published site.</p>';
    setUnavailable("home-milestone-status", milestones, "First-clear milestones are available on the published site.");
    return;
  }

  const authorization = activeAccessToken();
  const photoHeaders = new Headers({ Accept: "application/json" });
  if (authorization) photoHeaders.set("Authorization", `Bearer ${authorization}`);
  const [parseResult, profileResult, newestPhotoResult, popularPhotoResult, milestoneResult] = await Promise.allSettled([
    fetchTyped(`${apiBase}/v1/parses?limit=250`, isPublicParseCatalog),
    fetchTyped(`${apiBase}/v1/profiles`, isPublicProfileCatalog),
    fetchTyped(`${apiBase}/v1/photos?sort=newest&limit=4`, isPublicPhotoCatalog, photoHeaders),
    fetchTyped(`${apiBase}/v1/photos?sort=popular&limit=4`, isPublicPhotoCatalog, photoHeaders),
    fetchTyped(`${apiBase}/v1/activity/milestones?limit=10`, isPublicCommunityMilestoneCatalog),
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

  if (newestPhotoResult.status === "fulfilled" && popularPhotoResult.status === "fulfilled") {
    renderPhotoCatalog(newestPhotoResult.value, newestPhotos);
    renderPhotoCatalog(popularPhotoResult.value, popularPhotos);
    const status = required("home-photo-status");
    status.textContent = `${newestPhotoResult.value.total_entries.toLocaleString()} photos`;
    status.className = "status-chip success";
    bindPhotoLikes();
  } else {
    setUnavailable("home-photo-status", newestPhotos, "Community photos are temporarily unavailable.");
    popularPhotos.innerHTML = '<p class="empty-state">Popular photos are temporarily unavailable.</p>';
  }

  if (milestoneResult.status === "fulfilled") {
    renderMilestones(milestoneResult.value, milestones);
  } else {
    setUnavailable("home-milestone-status", milestones, "First-clear milestones are temporarily unavailable.");
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
          return `<a class="home-feed-row profile-feed-row" href="/profiles/${encodeURIComponent(profile.character_id)}/"><span><strong>${escapeHtml(profile.display_name ?? `UID ${profile.character_id}`)}</strong><small>${escapeHtml(location || profile.deployment)}</small></span><span><small>Last seen</small><strong>${escapeHtml(relativeTime(profile.updated_unix_millis))}</strong></span></a>`;
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

function renderPhotoCatalog(catalog: PublicPhotoCatalog, target: HTMLElement): void {
  target.innerHTML = catalog.entries.length
    ? catalog.entries.map(photoCard).join("")
    : '<p class="empty-state">No Photo Wall images have been published yet.</p>';
}

function photoCard(entry: PublicPhotoCatalogEntry): string {
  const name = entry.display_name ?? `UID ${entry.character_id}`;
  const identity = `${entry.profile_id}:${entry.photo_id}`;
  return `<article class="community-photo-card"><a class="community-photo-link" href="/profiles/${encodeURIComponent(entry.character_id)}/" aria-label="Open ${escapeHtml(name)}'s profile"><img src="${escapeHtml(`${apiBase}${entry.image_path}`)}" alt="Photo Wall image from ${escapeHtml(name)}" loading="lazy" decoding="async" /></a><div class="community-photo-meta"><span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(relativeTime(entry.uploaded_unix_millis))}</small></span><button class="photo-like-button${entry.viewer_liked ? " is-liked" : ""}" type="button" data-photo-like="${escapeHtml(identity)}" data-profile-id="${escapeHtml(entry.profile_id)}" data-photo-id="${entry.photo_id}" aria-pressed="${entry.viewer_liked}" title="${entry.viewer_liked ? "Remove like" : "Like this photo"}"><span aria-hidden="true">♥</span><span data-like-count>${entry.like_count.toLocaleString()}</span></button></div></article>`;
}

function renderMilestones(
  catalog: PublicCommunityMilestoneCatalog,
  target: HTMLElement,
): void {
  const status = required("home-milestone-status");
  status.textContent = catalog.total_entries
    ? `${catalog.total_entries.toLocaleString()} first clears`
    : "Waiting for a first clear";
  status.className = catalog.total_entries ? "status-chip success" : "status-chip neutral";
  target.innerHTML = catalog.entries.length
    ? catalog.entries.map(milestoneRow).join("")
    : '<p class="empty-state">Verified first-time M20 dungeon and Nightmare raid clears will appear here.</p>';
}

function milestoneRow(entry: PublicCommunityMilestone): string {
  const player = entry.display_name ?? `UID ${entry.character_id}`;
  const activity = entry.scene_name ?? `Scene ${entry.scene_id ?? "unknown"}`;
  const achievement =
    entry.kind === "master_twenty_dungeon"
      ? `first M${entry.difficulty_tier ?? 20} clear`
      : "first Nightmare clear";
  return `<a class="home-feed-row milestone-feed-row" href="/parses/?parse=${encodeURIComponent(entry.report_id)}&run=${entry.run_index}"><span><strong>${escapeHtml(player)}</strong><small>${escapeHtml(`${activity} · ${achievement}`)}</small></span><span><small>${escapeHtml(relativeTime(entry.completed_unix_millis))}</small><strong>${formatDuration(entry.total_run_time_micros)}</strong></span></a>`;
}

function bindPhotoLikes(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-photo-like]")) {
    button.addEventListener("click", () => void togglePhotoLike(button));
  }
}

async function togglePhotoLike(button: HTMLButtonElement): Promise<void> {
  const token = activeAccessToken();
  if (!token) {
    window.location.assign("/account/");
    return;
  }
  const profileId = button.dataset.profileId;
  const photoId = Number(button.dataset.photoId);
  if (!profileId || !Number.isSafeInteger(photoId) || photoId <= 0) return;
  const liked = button.getAttribute("aria-pressed") === "true";
  button.disabled = true;
  try {
    const response = await fetch(
      `${apiBase}/v1/profiles/${encodeURIComponent(profileId)}/photo-wall/${photoId}/like`,
      {
        method: liked ? "DELETE" : "PUT",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      },
    );
    if (response.status === 401) {
      localStorage.removeItem(sessionKey);
      window.dispatchEvent(new Event("rlogs:session-changed"));
      window.location.assign("/account/");
      return;
    }
    if (!response.ok) throw new Error(`Like request failed (${response.status}).`);
    const receipt = parseLikeReceipt(await response.json());
    for (const match of document.querySelectorAll<HTMLButtonElement>(
      `[data-photo-like="${CSS.escape(`${profileId}:${photoId}`)}"]`,
    )) {
      match.setAttribute("aria-pressed", String(receipt.liked));
      match.classList.toggle("is-liked", receipt.liked);
      match.title = receipt.liked ? "Remove like" : "Like this photo";
      const count = match.querySelector<HTMLElement>("[data-like-count]");
      if (count) count.textContent = receipt.like_count.toLocaleString();
    }
  } catch {
    button.title = "Could not update this like. Try again.";
  } finally {
    button.disabled = false;
  }
}

function parseLikeReceipt(value: unknown): { liked: boolean; like_count: number } {
  if (
    typeof value !== "object" ||
    value === null ||
    !("liked" in value) ||
    typeof value.liked !== "boolean" ||
    !("like_count" in value) ||
    typeof value.like_count !== "number" ||
    !Number.isSafeInteger(value.like_count) ||
    value.like_count < 0
  ) {
    throw new Error("The server returned an unsupported like receipt.");
  }
  return { liked: value.liked, like_count: value.like_count };
}

function activeAccessToken(): string | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(sessionKey) ?? "null");
    if (
      typeof value === "object" &&
      value !== null &&
      "access_token" in value &&
      typeof value.access_token === "string" &&
      value.access_token.startsWith("rlw_") &&
      "expires_unix_millis" in value &&
      typeof value.expires_unix_millis === "number" &&
      value.expires_unix_millis > Date.now()
    ) {
      return value.access_token;
    }
  } catch {
    // A malformed session is treated as signed out.
  }
  return null;
}

async function fetchTyped<T>(
  url: string,
  guard: (value: unknown) => value is T,
  headers: HeadersInit = { Accept: "application/json" },
): Promise<T> {
  const response = await fetch(url, { headers });
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
