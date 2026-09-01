import {
  type PublicProfileCatalog,
  type PublicProfileCatalogEntry,
  isPublicProfileCatalog,
} from "../../contracts/public-profiles";
import { renderSyncedCharacterProfile } from "../account/profile-view";
import { loadPublishedProfile } from "./published-profile-loader";

const apiBase = String(import.meta.env.VITE_RLOGS_API_BASE_URL ?? "").replace(/\/$/u, "");

export async function mountProfileBrowser(): Promise<void> {
  const status = requiredElement("profile-browser-status");
  const search = requiredInput("profile-search");
  const list = requiredElement("profile-browser-list");
  const detail = requiredElement("profile-browser-detail");
  if (!apiBase) {
    status.textContent = "API unavailable";
    list.replaceChildren(message("The public profile API is not configured for this deployment."));
    return;
  }

  let catalog: PublicProfileCatalog;
  try {
    const response = await fetch(`${apiBase}/v1/profiles`);
    if (!response.ok) throw new Error(`Profile catalog request failed with HTTP ${response.status}.`);
    const value: unknown = await response.json();
    if (!isPublicProfileCatalog(value)) throw new Error("The public profile catalog is invalid.");
    catalog = value;
  } catch (error) {
    status.textContent = "Unavailable";
    list.replaceChildren(message(errorText(error)));
    return;
  }

  status.textContent = `${catalog.profiles.length.toLocaleString()} public profiles`;
  const requested = new URLSearchParams(location.search).get("profile");
  let selected = requested
    ? catalog.profiles.find((entry) => entry.profile_id === requested)
    : undefined;

  const renderList = (): void => {
    const query = search.value.trim().toLocaleLowerCase();
    const visible = catalog.profiles.filter((entry) => searchable(entry).includes(query));
    list.replaceChildren();
    if (!visible.length) {
      list.append(message(query ? "No public profile matches that search." : "No player has published a profile yet."));
      return;
    }
    for (const entry of visible) {
      const card = document.createElement("a");
      card.className = "linked-profile-card profile-browser-card";
      if (entry.profile_id === selected?.profile_id) card.setAttribute("aria-current", "true");
      card.href = `/profiles/?profile=${encodeURIComponent(entry.profile_id)}`;
      const locationLabel = [entry.region, entry.realm ?? entry.world].filter(Boolean).join(" · ");
      card.append(
        element("strong", "", entry.display_name ?? `UID ${entry.character_id}`),
        element("span", "identity-id", `UID ${entry.character_id}`),
        element("small", "", locationLabel || entry.deployment),
        element(
          "small",
          "",
          `${entry.module_inventory_count.toLocaleString()} modules · ${entry.equipped_module_count.toLocaleString()} equipped`,
        ),
      );
      list.append(card);
    }
  };
  search.addEventListener("input", renderList);
  renderList();

  if (requested && !selected) {
    detail.replaceChildren(message("That public profile was not found."));
    return;
  }
  selected ??= catalog.profiles[0];
  if (!selected) return;
  detail.replaceChildren(message("Loading the latest verified character snapshot…"));
  try {
    const profile = await loadPublishedProfile(selected.profile_id);
    detail.replaceChildren(renderSyncedCharacterProfile(profile));
  } catch (error) {
    detail.replaceChildren(message(errorText(error)));
  }
}

function searchable(entry: PublicProfileCatalogEntry): string {
  return [
    entry.display_name,
    entry.character_id,
    entry.deployment,
    entry.region,
    entry.realm,
    entry.world,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLocaleLowerCase();
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
