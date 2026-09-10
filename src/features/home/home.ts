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
import { fetchPublicRead } from "../../public-api";
import {
  loadParsePresentation,
  presentationForCatalogEntry,
  presentationForIdentity,
  renderCoreWithOptionalPresentation,
  type ParsePresentationCatalog,
} from "../parse-browser/parse-presentation";
import { regionalSeason } from "./regional-seasons";

const apiBase = String(import.meta.env.VITE_RLOGS_API_BASE_URL ?? "").replace(/\/$/u, "");
const sessionKey = "rlogs.web-session.v1";

export interface SceneRanking {
  key: string;
  label: string;
  regionLabel: string;
  seasonLabel: string;
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
    setUnavailable("home-milestone-status", milestones, "Verified clears are available on the published site.");
    return;
  }

  const authorization = activeAccessToken();
  const presentationRequest = loadParsePresentation().catch(() => undefined);
  const photoHeaders = new Headers({ Accept: "application/json" });
  if (authorization) photoHeaders.set("Authorization", `Bearer ${authorization}`);
  const parseTask = renderCoreWithOptionalPresentation(
    fetchTyped(`${apiBase}/v1/parses?limit=250`, isPublicParseCatalog),
    presentationRequest,
    (catalog, presentation) => {
      renderRecentParses(catalog, recent, presentation);
      renderRankings(catalog, rankings, presentation);
    },
  ).then(
    () => undefined,
    () => {
      setUnavailable("home-parse-status", recent, "Recent parse submissions are temporarily unavailable.");
      setUnavailable("home-ranking-status", rankings, "Scene rankings are temporarily unavailable.");
    },
  );
  const profileTask = fetchTyped(`${apiBase}/v1/profiles`, isPublicProfileCatalog).then(
    (catalog) => renderLatestProfiles(catalog, profiles),
    () => setUnavailable("home-profile-status", profiles, "Recently seen players are temporarily unavailable."),
  );
  const photoTask = Promise.all([
    fetchTyped(`${apiBase}/v1/photos?sort=newest&limit=4`, isPublicPhotoCatalog, photoHeaders),
    fetchTyped(`${apiBase}/v1/photos?sort=popular&limit=4`, isPublicPhotoCatalog, photoHeaders),
  ]).then(
    ([newestCatalog, popularCatalog]) => {
      renderPhotoCatalog(newestCatalog, newestPhotos);
      renderPhotoCatalog(popularCatalog, popularPhotos);
      const status = required("home-photo-status");
      status.textContent = `${newestCatalog.total_entries.toLocaleString()} photos`;
      status.className = "status-chip success";
      bindPhotoLikes();
    },
    () => {
      setUnavailable("home-photo-status", newestPhotos, "Community photos are temporarily unavailable.");
      popularPhotos.innerHTML = '<p class="empty-state">Popular photos are temporarily unavailable.</p>';
    },
  );
  const milestoneTask = renderCoreWithOptionalPresentation(
    fetchTyped(`${apiBase}/v1/activity/milestones?limit=10`, isPublicCommunityMilestoneCatalog),
    presentationRequest,
    (catalog, presentation) => renderMilestones(catalog, milestones, presentation),
  ).then(
    () => undefined,
    () => setUnavailable("home-milestone-status", milestones, "Verified clears are temporarily unavailable."),
  );
  await Promise.allSettled([parseTask, profileTask, photoTask, milestoneTask]);
}

export function buildSceneRankings(
  entries: PublicParseCatalogEntry[],
  presentation?: ParsePresentationCatalog,
  schemaVersion: 6 | 7 = 6,
): SceneRanking[] {
  const ranked = entries.filter(
    (entry) => entry.terminal_state === "completed" && entry.total_run_time_micros != null,
  );
  const groups = new Map<string, SceneRanking>();
  const authorized = (entry: PublicParseCatalogEntry): boolean =>
    presentationForCatalogEntry(presentation, schemaVersion, entry) != null;
  const stimen = ranked.filter((entry) => isStimenRun(entry, authorized(entry)));
  const highestStimenFloorBySeason = new Map<string, number>();
  for (const entry of stimen) {
    const season = regionalSeason(entry.deployment_id, entry.region_id, entry.created_unix_millis);
    const seasonKey = `${season.cohort}:${season.seasonId ?? "unknown"}`;
    highestStimenFloorBySeason.set(
      seasonKey,
      Math.max(highestStimenFloorBySeason.get(seasonKey) ?? 0, stimenFloor(entry, true)),
    );
  }

  for (const entry of ranked) {
    const season = regionalSeason(entry.deployment_id, entry.region_id, entry.created_unix_millis);
    const seasonKey = `${season.cohort}:${season.seasonId ?? "unknown"}`;
    const highestStimenFloor = highestStimenFloorBySeason.get(seasonKey) ?? 0;
    const hasPresentation = authorized(entry);
    const floor = stimenFloor(entry, hasPresentation);
    if (isStimenRun(entry, hasPresentation) && floor !== highestStimenFloor) continue;
    const key = isStimenRun(entry, hasPresentation)
      ? `${season.cohort}:${season.seasonId ?? "unknown"}:stimen:${highestStimenFloor}`
      : `${season.cohort}:${season.seasonId ?? "unknown"}:${hasPresentation ? "presented" : "raw"}:scene:${entry.scene_id ?? (hasPresentation ? entry.activity_id ?? entry.scene_name : undefined) ?? "unknown"}`;
    const label = isStimenRun(entry, hasPresentation)
      ? `Stimen Remains · Floor ${highestStimenFloor}`
      : hasPresentation
        ? entry.scene_name ?? entry.activity_id ?? rawSceneLabel(entry)
        : rawSceneLabel(entry);
    const group = groups.get(key) ?? {
      key,
      label,
      regionLabel: season.regionLabel,
      seasonLabel: season.seasonLabel,
      ...(isStimenRun(entry, hasPresentation) ? { floor } : {}),
      entries: [],
    };
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

function renderRecentParses(
  catalog: PublicParseCatalog,
  target: HTMLElement,
  presentation?: ParsePresentationCatalog,
): void {
  const status = required("home-parse-status");
  status.textContent = `${catalog.total_entries.toLocaleString()} submitted`;
  status.className = "status-chip success";
  const entries = catalog.entries.slice(0, 6);
  target.innerHTML = entries.length
    ? entries.map((entry) => parseFeedRow(entry, presentation, catalog.schema_version)).join("")
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
          const location = [profile.region, profile.realm ?? profile.world].filter(Boolean).map((value) => humanizeIdentifier(String(value))).join(" · ");
          return `<a class="home-feed-row profile-feed-row" href="/profiles/?profile=${encodeURIComponent(profile.character_id)}"><span><strong>${escapeHtml(profile.display_name ?? `UID ${profile.character_id}`)}</strong><small>${escapeHtml(location || profile.deployment)}</small></span><span><small>Last seen</small><strong>${escapeHtml(relativeTime(profile.updated_unix_millis))}</strong></span></a>`;
        })
        .join("")
    : '<p class="empty-state">No players have synced a public profile yet.</p>';
}

function renderRankings(
  catalog: PublicParseCatalog,
  target: HTMLElement,
  presentation?: ParsePresentationCatalog,
): void {
  const groups = buildSceneRankings(catalog.entries, presentation, catalog.schema_version);
  const status = required("home-ranking-status");
  status.textContent = groups.length ? `${groups.length} scenes` : "No rankings yet";
  status.className = groups.length ? "status-chip success" : "status-chip neutral";
  target.innerHTML = groups.length
    ? groups
        .map(
          (group) => `<section class="scene-ranking"><h3>${escapeHtml(group.label)}</h3><p class="scene-ranking-context">${escapeHtml(group.regionLabel)} · ${escapeHtml(group.seasonLabel)}</p><ol>${group.entries
            .map((entry, index) => `<li><a href="/parses/?parse=${encodeURIComponent(entry.report_id)}&run=${entry.run_index}"><span class="scene-ranking-position">${index + 1}</span><span class="scene-ranking-submitter">${escapeHtml(entry.submitter_name ?? "Unknown submitter")}</span><strong>${formatDuration(entry.total_run_time_micros)}</strong></a></li>`)
            .join("")}</ol></section>`,
        )
        .join("")
    : '<p class="empty-state">Rankings will appear after the first completed public parse.</p>';
}

export function parseFeedRow(
  entry: PublicParseCatalogEntry,
  presentation?: ParsePresentationCatalog,
  schemaVersion: 6 | 7 = 6,
): string {
  const name = catalogEntrySceneLabel(entry, presentation, schemaVersion);
  return `<a class="home-feed-row" href="/parses/?parse=${encodeURIComponent(entry.report_id)}&run=${entry.run_index}"><span><strong>${escapeHtml(name)}</strong><small>Submitted by ${escapeHtml(entry.submitter_name ?? "Unknown submitter")} · ${entry.participant_count} players</small></span><span><strong>${formatDuration(entry.total_run_time_micros)}</strong></span></a>`;
}

function humanizeIdentifier(value: string): string {
  return value.split(/[-_\s]+/u).filter(Boolean).map((part) => `${part[0]?.toLocaleUpperCase() ?? ""}${part.slice(1)}`).join(" ");
}

function isStimenRun(entry: PublicParseCatalogEntry, hasPresentation: boolean): boolean {
  if (!hasPresentation) return false;
  return Boolean(
    entry.activity_family_id?.toLowerCase().includes("stimen") ||
      entry.scene_name?.toLowerCase().includes("stimen") ||
      (entry.scene_id != null && ((entry.scene_id >= 30101 && entry.scene_id <= 30175) || (entry.scene_id >= 31101 && entry.scene_id <= 31175))),
  );
}

function stimenFloor(entry: PublicParseCatalogEntry, hasPresentation: boolean): number {
  if (!hasPresentation) return 0;
  const nameFloor = entry.scene_name?.match(/floor\s*(\d+)/iu)?.[1];
  if (nameFloor) return Number(nameFloor);
  if (entry.scene_id != null && ((entry.scene_id >= 30101 && entry.scene_id <= 30175) || (entry.scene_id >= 31101 && entry.scene_id <= 31175))) {
    return entry.scene_id % 100;
  }
  return entry.difficulty_tier ?? 0;
}

export function catalogEntrySceneLabel(
  entry: PublicParseCatalogEntry,
  presentation?: ParsePresentationCatalog,
  schemaVersion: 6 | 7 = 6,
): string {
  return presentationForCatalogEntry(presentation, schemaVersion, entry)
    ? entry.scene_name ?? entry.activity_id ?? rawSceneLabel(entry)
    : rawSceneLabel(entry);
}

function rawSceneLabel(entry: PublicParseCatalogEntry): string {
  return entry.scene_id == null ? "Scene unresolved" : `Scene #${entry.scene_id}`;
}

function renderPhotoCatalog(catalog: PublicPhotoCatalog, target: HTMLElement): void {
  target.innerHTML = catalog.entries.length
    ? catalog.entries.map(photoCard).join("")
    : '<p class="empty-state">No Photo Wall images have been published yet.</p>';
}

function photoCard(entry: PublicPhotoCatalogEntry): string {
  const name = entry.display_name ?? `UID ${entry.character_id}`;
  const identity = `${entry.profile_id}:${entry.photo_id}`;
  return `<article class="community-photo-card"><a class="community-photo-link" href="/profiles/?profile=${encodeURIComponent(entry.character_id)}" aria-label="Open ${escapeHtml(name)}'s profile"><img src="${escapeHtml(`${apiBase}${entry.image_path}`)}" alt="Photo Wall image from ${escapeHtml(name)}" loading="lazy" decoding="async" /></a><div class="community-photo-meta"><span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(relativeTime(entry.uploaded_unix_millis))}</small></span><button class="photo-like-button${entry.viewer_liked ? " is-liked" : ""}" type="button" data-photo-like="${escapeHtml(identity)}" data-profile-id="${escapeHtml(entry.profile_id)}" data-photo-id="${entry.photo_id}" aria-pressed="${entry.viewer_liked}" title="${entry.viewer_liked ? "Remove like" : "Like this photo"}"><span aria-hidden="true">♥</span><span data-like-count>${entry.like_count.toLocaleString()}</span></button></div></article>`;
}

function renderMilestones(
  catalog: PublicCommunityMilestoneCatalog,
  target: HTMLElement,
  presentation?: ParsePresentationCatalog,
): void {
  const status = required("home-milestone-status");
  status.textContent = catalog.total_entries
    ? `${catalog.total_entries.toLocaleString()} verified clears`
    : "Waiting for a verified clear";
  status.className = catalog.total_entries ? "status-chip success" : "status-chip neutral";
  target.innerHTML = catalog.entries.length
    ? catalog.entries.map((entry) => milestoneRow(entry, presentation, catalog.schema_version)).join("")
    : '<p class="empty-state">Server-verified public clears will appear here.</p>';
}

export function milestoneRow(
  entry: PublicCommunityMilestone,
  presentation?: ParsePresentationCatalog,
  schemaVersion: 1 | 2 = 1,
): string {
  const player = entry.display_name ?? `UID ${entry.character_id}`;
  const { activity, achievement } = milestonePresentationCopy(entry, presentation, schemaVersion);
  return `<a class="home-feed-row milestone-feed-row" href="/parses/?parse=${encodeURIComponent(entry.report_id)}&run=${entry.run_index}"><span><strong>${escapeHtml(player)}</strong><small>${escapeHtml(`${activity} · ${achievement}`)}</small></span><span><small>${escapeHtml(relativeTime(entry.completed_unix_millis))}</small><strong>${formatDuration(entry.total_run_time_micros)}</strong></span></a>`;
}

export function milestonePresentationCopy(
  entry: PublicCommunityMilestone,
  presentation?: ParsePresentationCatalog,
  schemaVersion: 1 | 2 = 1,
): { activity: string; achievement: string } {
  const identity = schemaVersion === 2 ? {
    deployment_id: entry.deployment_id ?? null,
    client_build: entry.client_build ?? null,
    protocol_pack_digest: entry.protocol_pack_digest ?? null,
  } : null;
  const authorized = presentationForIdentity(presentation, identity) != null;
  const activity = authorized
    ? entry.scene_name ?? rawMilestoneSceneLabel(entry.scene_id)
    : rawMilestoneSceneLabel(entry.scene_id);
  const achievement = authorized && entry.kind === "master_twenty_dungeon"
    ? `first M${entry.difficulty_tier ?? 20} clear`
    : authorized && entry.kind === "nightmare_raid"
      ? "first Nightmare clear"
      : [entry.difficulty_tier == null ? undefined : `Tier ${entry.difficulty_tier}`, "verified clear"]
      .filter(Boolean)
      .join(" · ");
  return { activity, achievement };
}

function rawMilestoneSceneLabel(sceneId: number | null): string {
  return sceneId == null ? "Scene unresolved" : `Scene #${sceneId}`;
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
  const response = await fetchPublicRead(url, { headers });
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
