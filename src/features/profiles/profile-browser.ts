import {
  type PublicProfileCatalog,
  type PublicProfileCatalogEntry,
  isPublicProfileCatalog,
} from "../../contracts/public-profiles";
import { renderSyncedCharacterProfile } from "../account/profile-view";
import { loadPublishedProfile } from "./published-profile-loader";
import { fetchPublicRead } from "../../public-api";
import {
  type ObservedCharacterCatalog,
  type ObservedCharacterEntry,
  type ObservedCharacterReportReference,
  isObservedCharacterCatalog,
} from "../../contracts/public-characters";
import {
  loadParsePresentation,
  presentationForIdentity,
  type ParsePresentationCatalog,
} from "../parse-browser/parse-presentation";

const apiBase = String(import.meta.env.VITE_RLOGS_API_BASE_URL ?? "").replace(/\/$/u, "");

export type DirectoryEntry =
  | { kind: "claimed"; profile: PublicProfileCatalogEntry }
  | { kind: "observed"; character: ObservedCharacterEntry };

export async function mountProfileBrowser(): Promise<void> {
  const status = requiredElement("profile-browser-status");
  const search = requiredInput("profile-search");
  const list = requiredElement("profile-browser-list");
  const detail = requiredElement("profile-browser-detail");
  if (!apiBase && !import.meta.env.DEV) {
    status.textContent = "API unavailable";
    list.replaceChildren(message("The public profile API is not configured for this deployment."));
    return;
  }

  let catalog: PublicProfileCatalog;
  let observedCatalog: ObservedCharacterCatalog;
  let presentation: ParsePresentationCatalog | undefined;
  const presentationRequest = loadParsePresentation().catch(() => undefined);
  try {
    [catalog, observedCatalog] = await Promise.all([
      loadProfileCatalog(),
      loadObservedCharacterCatalog(),
    ]);
  } catch (error) {
    status.textContent = "Unavailable";
    list.replaceChildren(message(errorText(error)));
    return;
  }

  const claimedProfileIds = new Set(catalog.profiles.map((entry) => entry.profile_id));
  const directory: DirectoryEntry[] = [
    ...observedCatalog.characters
      .filter((entry) => !entry.claimed_profile_id || !claimedProfileIds.has(entry.claimed_profile_id))
      .map((character): DirectoryEntry => ({ kind: "observed", character })),
    ...catalog.profiles.map((profile): DirectoryEntry => ({ kind: "claimed", profile })),
  ].sort((left, right) => directoryUpdated(right) - directoryUpdated(left));
  status.textContent = `${directory.length.toLocaleString()} players · ${catalog.profiles.length.toLocaleString()} claimed`;
  const requested = requestedProfileReference(location.pathname, location.search);
  let selected = requested
    ? directory.find((entry) => directoryReferences(entry).includes(requested))
    : undefined;

  const renderList = (): void => {
    const query = search.value.trim().toLocaleLowerCase();
    const visible = directory.filter((entry) => searchableDirectoryEntry(
      entry,
      presentation,
      observedCatalog.schema_version,
    ).includes(query));
    list.replaceChildren();
    if (!visible.length) {
      list.append(message(query ? "No public profile matches that search." : "No player has published a profile yet."));
      return;
    }
    for (const entry of visible) {
      const card = document.createElement("a");
      card.className = "linked-profile-card profile-browser-card";
      if (directoryKey(entry) === (selected && directoryKey(selected))) card.setAttribute("aria-current", "true");
      card.href = profileUrl(directoryReference(entry));
      if (entry.kind === "claimed") {
        const profile = entry.profile;
        const locationLabel = [humanize(profile.region), profile.realm ?? profile.world].filter(Boolean).join(" · ");
        card.append(
          element("strong", "", profile.display_name ?? `UID ${profile.character_id}`),
          element("span", "identity-id", `Claimed · UID ${profile.character_id}`),
          element("small", "", locationLabel || humanize(profile.deployment)),
          element("small", "", `${profile.module_inventory_count.toLocaleString()} modules · ${profile.equipped_module_count.toLocaleString()} equipped`),
        );
      } else {
        const character = entry.character;
        card.append(
          element("strong", "", character.display_name),
          element("span", "identity-id", "Observed in public parses"),
          element("small", "", observedClassLabel(character, presentation, observedCatalog.schema_version).replace(" / ", " · ")),
          element("small", "", `${character.report_count.toLocaleString()} involved ${character.report_count === 1 ? "parse" : "parses"} · ${humanize(character.region)}`),
        );
      }
      list.append(card);
    }
  };
  search.addEventListener("input", renderList);
  renderList();

  if (requested && !selected) {
    detail.replaceChildren(message("That public profile was not found."));
    return;
  }
  selected ??= directory[0];
  if (!selected) return;
  const canonicalUrl = profileUrl(directoryReference(selected));
  if (`${location.pathname}${location.search}` !== canonicalUrl) {
    history.replaceState(null, "", canonicalUrl);
  }
  void presentationRequest.then((resolved) => {
    if (!resolved) return;
    presentation = resolved;
    renderList();
    if (selected?.kind === "observed") {
      detail.replaceChildren(renderObservedCharacter(
        selected.character,
        presentation,
        observedCatalog.schema_version,
      ));
    }
  });
  if (selected.kind === "observed") {
    detail.replaceChildren(renderObservedCharacter(
      selected.character,
      presentation,
      observedCatalog.schema_version,
    ));
  } else {
    detail.replaceChildren(message("Loading the latest verified character snapshot…"));
    try {
      const profile = await loadPublishedProfile(selected.profile.profile_id);
      detail.replaceChildren(await renderSyncedCharacterProfile(profile));
    } catch (error) {
      detail.replaceChildren(message(errorText(error)));
    }
  }
}

export async function loadProfileCatalog(
  endpoint = apiBase,
  request: (url: string) => Promise<Response> = (url) => fetchPublicRead(url),
): Promise<PublicProfileCatalog> {
  if (!endpoint) {
    throw new Error("The public profile API is not configured for this deployment.");
  }
  const response = await request(`${endpoint}/v1/profiles`);
  if (!response.ok) {
    throw new Error(`Profile catalog request failed with HTTP ${response.status}.`);
  }
  const value: unknown = await response.json();
  if (!isPublicProfileCatalog(value)) {
    throw new Error("The public profile catalog is invalid.");
  }
  return value;
}

export async function loadObservedCharacterCatalog(
  endpoint = apiBase,
  request: (url: string) => Promise<Response> = (url) => fetchPublicRead(url),
): Promise<ObservedCharacterCatalog> {
  if (!endpoint) throw new Error("The public character API is not configured for this deployment.");
  const response = await request(`${endpoint}/v1/characters`);
  if (!response.ok) throw new Error(`Character catalog request failed with HTTP ${response.status}.`);
  const value: unknown = await response.json();
  if (!isObservedCharacterCatalog(value)) throw new Error("The public character catalog is invalid.");
  return value;
}

export function requestedProfileReference(pathname: string, search: string): string | undefined {
  const path = pathname.replace(/\/+$/u, "");
  const match = /^\/profiles\/([^/]+)$/u.exec(path);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
  return new URLSearchParams(search).get("profile") ?? undefined;
}

export function profileUrl(characterId: string): string {
  return `/profiles/?profile=${encodeURIComponent(characterId)}`;
}

export function searchableDirectoryEntry(
  entry: DirectoryEntry,
  presentation?: ParsePresentationCatalog,
  observedSchemaVersion: 1 | 2 = 1,
): string {
  const observedPresentation = entry.kind === "observed"
    ? presentationForObservedCharacter(presentation, observedSchemaVersion, entry.character)
    : undefined;
  const values = entry.kind === "claimed"
    ? [entry.profile.display_name, entry.profile.character_id, entry.profile.deployment, entry.profile.region, entry.profile.realm, entry.profile.world]
    : [
      entry.character.display_name,
      observedPresentation ? entry.character.class_name : undefined,
      observedPresentation ? entry.character.specialization_name : undefined,
      entry.character.class_id == null ? undefined : String(entry.character.class_id),
      entry.character.specialization_id == null ? undefined : String(entry.character.specialization_id),
      entry.character.deployment,
      entry.character.region,
    ];
  return values
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLocaleLowerCase();
}

function directoryReference(entry: DirectoryEntry): string {
  return entry.kind === "claimed" ? entry.profile.character_id : entry.character.observed_character_key;
}

function directoryReferences(entry: DirectoryEntry): string[] {
  return entry.kind === "claimed"
    ? [entry.profile.character_id, entry.profile.profile_id]
    : [entry.character.observed_character_key];
}

function directoryKey(entry: DirectoryEntry): string {
  return `${entry.kind}:${directoryReference(entry)}`;
}

function directoryUpdated(entry: DirectoryEntry): number {
  return entry.kind === "claimed" ? entry.profile.updated_unix_millis : entry.character.last_seen_unix_millis;
}

function renderObservedCharacter(
  character: ObservedCharacterEntry,
  presentation?: ParsePresentationCatalog,
  schemaVersion: 1 | 2 = 1,
): HTMLElement {
  const article = element("article", "panel profile-data-section observed-character-profile");
  const heading = element("div", "profile-data-heading");
  const title = element("div", "");
  title.append(
    element("p", "eyebrow", "Observed public combat record"),
    element("h2", "", character.display_name),
    element("p", "section-intro", "This lightweight profile contains only information observed in public parses. It is not a claimed character profile."),
  );
  heading.append(title, element("span", "status-chip neutral", "Unclaimed"));
  article.append(heading);

  const facts = element("dl", "profile-facts observed-character-facts");
  for (const [label, value] of [
    ["Class", observedClassLabel(character, presentation, schemaVersion)],
    ["Region", humanize(character.region)],
    ["Client deployment", humanize(character.deployment)],
    ["First observed", formatDate(character.first_seen_unix_millis)],
    ["Last observed", formatDate(character.last_seen_unix_millis)],
    ["Public parses", character.report_count.toLocaleString()],
  ]) {
    facts.append(element("dt", "", label), element("dd", "", value));
  }
  article.append(facts);

  const reports = element("section", "observed-character-reports");
  reports.append(element("h3", "", "Involved parses"));
  const links = element("div", "linked-profile-list observed-character-report-list");
  for (const report of character.reports) {
    const link = element("a", "linked-profile-card");
    link.setAttribute("href", `/parses/?parse=${encodeURIComponent(report.report_id)}&run=${report.run_index}`);
    link.append(
      element("strong", "", observedReportSceneLabel(report, presentation, schemaVersion)),
      element("small", "", `${humanize(report.terminal_state)} · ${formatDate(report.created_unix_millis)}`),
      element("span", "identity-id", report.report_id),
    );
    links.append(link);
  }
  reports.append(links);
  article.append(reports);
  return article;
}

export function observedClassLabel(
  character: ObservedCharacterEntry,
  presentation?: ParsePresentationCatalog,
  schemaVersion: 1 | 2 = 1,
): string {
  if (presentationForObservedCharacter(presentation, schemaVersion, character)) {
    return [character.class_name, character.specialization_name].filter(Boolean).join(" / ") || rawObservedClassLabel(character);
  }
  return rawObservedClassLabel(character);
}

export function observedReportSceneLabel(
  report: ObservedCharacterReportReference,
  presentation?: ParsePresentationCatalog,
  schemaVersion: 1 | 2 = 1,
): string {
  const identity = schemaVersion === 2 ? {
    deployment_id: report.deployment_id ?? null,
    client_build: report.client_build ?? null,
    protocol_pack_digest: report.protocol_pack_digest ?? null,
  } : null;
  return presentationForIdentity(presentation, identity)
    ? report.scene_name ?? rawObservedSceneLabel(report.scene_id)
    : rawObservedSceneLabel(report.scene_id);
}

function presentationForObservedCharacter(
  presentation: ParsePresentationCatalog | undefined,
  schemaVersion: 1 | 2,
  character: ObservedCharacterEntry,
): ParsePresentationCatalog | undefined {
  return schemaVersion === 2
    ? presentationForIdentity(presentation, character.presentation_authority)
    : undefined;
}

function rawObservedClassLabel(character: ObservedCharacterEntry): string {
  return [
    character.class_id == null ? undefined : `Class #${character.class_id}`,
    character.specialization_id == null ? undefined : `Specialization #${character.specialization_id}`,
  ].filter(Boolean).join(" / ") || "Class not observed";
}

function rawObservedSceneLabel(sceneId: number | null): string {
  return sceneId == null ? "Scene unresolved" : `Scene #${sceneId}`;
}

function humanize(value: string): string {
  return value.replace(/[-_]+/gu, " ").replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase());
}

function formatDate(unixMillis: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(unixMillis));
}

function requiredElement(id: string): HTMLElement {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing profile browser element #${id}.`);
  return value;
}

function requiredInput(id: string): HTMLInputElement {
  const value = document.getElementById(id);
  if (!(value instanceof HTMLInputElement)) throw new Error(`Missing profile browser input #${id}.`);
  return value;
}

function message(copy: string): HTMLParagraphElement {
  return element("p", "empty-state", copy);
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  copy = "",
): HTMLElementTagNameMap[K] {
  const value = document.createElement(tag);
  value.className = className;
  value.textContent = copy;
  return value;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
