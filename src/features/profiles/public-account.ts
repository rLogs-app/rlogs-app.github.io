import {
  type PublicProfileCatalogEntry,
  isPublicProfileCatalog,
} from "../../contracts/public-profiles";

const apiBase = String(import.meta.env.VITE_RLOGS_API_BASE_URL ?? "").replace(/\/$/u, "");

export interface PublicAccountCatalog {
  schema_version: 1;
  account: {
    schema_version: 1;
    account_id: number;
    username: string;
  };
  profiles: PublicProfileCatalogEntry[];
}

export async function mountPublicAccount(): Promise<void> {
  const status = required("public-account-status");
  const title = required("public-account-title");
  const content = required("public-account-content");
  const accountId = publicAccountIdFromPath(location.pathname);
  if (!accountId) {
    status.textContent = "Not found";
    content.replaceChildren(message("That rLogs account URL is invalid."));
    return;
  }
  try {
    const response = await fetch(`${apiBase}/v1/users/${accountId}`);
    if (response.status === 404) throw new Error("That rLogs account was not found.");
    if (!response.ok) throw new Error(`Player account request failed with HTTP ${response.status}.`);
    const account = parsePublicAccountCatalog(await response.json());
    title.textContent = account.account.username;
    status.textContent = `${account.profiles.length.toLocaleString()} claimed character${account.profiles.length === 1 ? "" : "s"}`;
    const heading = element("header", "public-account-heading");
    heading.append(
      element("p", "eyebrow", "rLogs player"),
      element("h3", "", account.account.username),
      element("p", "identity-id", `rLogs ID ${account.account.account_id}`),
    );
    const list = element("div", "linked-profile-list public-account-characters");
    for (const profile of account.profiles) list.append(publicCharacterCard(profile));
    content.replaceChildren(
      heading,
      account.profiles.length
        ? list
        : message("This account has not published a claimed character profile yet."),
    );
  } catch (error) {
    status.textContent = "Unavailable";
    content.replaceChildren(message(errorText(error)));
  }
}

export function publicAccountIdFromPath(pathname: string): number | undefined {
  const match = /^\/users\/([1-9][0-9]{11})\/?$/u.exec(pathname);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : undefined;
}

export function parsePublicAccountCatalog(value: unknown): PublicAccountCatalog {
  if (
    !isRecord(value) ||
    value.schema_version !== 1 ||
    !isRecord(value.account) ||
    value.account.schema_version !== 1 ||
    typeof value.account.account_id !== "number" ||
    !Number.isSafeInteger(value.account.account_id) ||
    value.account.account_id < 100_000_000_000 ||
    value.account.account_id > 999_999_999_999 ||
    typeof value.account.username !== "string" ||
    !/^[a-z0-9][a-z0-9_-]{1,22}[a-z0-9]$/u.test(value.account.username) ||
    !isPublicProfileCatalog({ schema_version: 1, profiles: value.profiles })
  ) {
    throw new Error("The public account response is invalid.");
  }
  return value as unknown as PublicAccountCatalog;
}

function publicCharacterCard(profile: PublicProfileCatalogEntry): HTMLAnchorElement {
  const card = document.createElement("a");
  card.className = "linked-profile-card";
  card.href = `/profiles/${encodeURIComponent(profile.character_id)}/`;
  const location = [profile.region, profile.realm ?? profile.world].filter(Boolean).join(" · ");
  card.append(
    element("strong", "", profile.display_name ?? `UID ${profile.character_id}`),
    element("span", "identity-id", `UID ${profile.character_id}`),
    element("small", "", location || profile.deployment),
    element("small", "", `${profile.module_inventory_count.toLocaleString()} modules`),
  );
  return card;
}

function required(id: string): HTMLElement {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing public account element #${id}.`);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "The player account request failed.";
}
