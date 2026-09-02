import { renderSyncedCharacterProfile } from "./profile-view";
import { loadPublishedProfile } from "../profiles/published-profile-loader";

const apiBase = String(import.meta.env.VITE_RLOGS_API_BASE_URL ?? "").replace(/\/$/u, "");
const sessionKey = "rlogs.web-session.v1";

interface AccountView {
  schema_version: 1;
  submitter_id: string;
  account_id?: number;
  username?: string;
  discord_username: string;
  discord_global_name: string | null;
  discord_avatar_url: string | null;
}

interface WebSession {
  schema_version: 1;
  access_token: string;
  expires_unix_millis: number;
  account: AccountView;
}

interface AppTokenReceipt {
  schema_version: 1;
  device_token: string;
  device_id: string;
  created_unix_millis: number;
}

interface DiscordCompletionReceipt {
  schema_version: 1;
  login_code: string;
}

interface LinkedProfileEntry {
  profile_id: string;
  updated_unix_millis: number;
  source_client_build: string;
  deployment: string;
  region: string;
  realm: string | null;
  world: string | null;
  character_id: string;
  display_name: string | null;
  module_inventory_count: number;
  equipped_module_count: number;
}

interface LinkedProfileCatalog {
  schema_version: 1;
  profiles: LinkedProfileEntry[];
}

export async function mountAccount(mode: "profile" | "settings" = "profile"): Promise<void> {
  const prefix = mode === "settings" ? "my-account" : "account";
  const status = requiredElement(`${prefix}-status`);
  const content = requiredElement(`${prefix}-content`);
  if (!apiBase) {
    status.textContent = "API unavailable";
    content.replaceChildren(message("Account authentication is not configured for this deployment."));
    return;
  }

  const parameters = new URLSearchParams(window.location.search);
  const oauthError = parameters.get("error");
  if (oauthError) {
    status.textContent = "Sign-in cancelled";
    content.replaceChildren(
      message(parameters.get("error_description") ?? "Discord sign-in was not completed."),
    );
    clearAuthenticationParameters();
    return;
  }

  let authCode = parameters.get("auth_code");
  const discordCode = parameters.get("code");
  const discordState = parameters.get("state");
  if (!authCode && (discordCode || discordState)) {
    status.textContent = "Completing Discord sign-in…";
    try {
      if (!discordCode || !discordState) throw new Error("Discord returned an incomplete sign-in response.");
      const response = await fetch(`${apiBase}/v1/auth/discord/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: discordCode, state: discordState }),
      });
      if (!response.ok) throw new Error(`Discord sign-in failed with HTTP ${response.status}.`);
      authCode = parseDiscordCompletion(await response.json()).login_code;
    } catch (error) {
      status.textContent = "Sign-in failed";
      content.replaceChildren(message(errorText(error)));
      clearAuthenticationParameters();
      return;
    }
  }

  if (authCode) {
    status.textContent = "Completing sign-in…";
    try {
      const response = await fetch(`${apiBase}/v1/auth/session/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: authCode }),
      });
      if (!response.ok) throw new Error(`Sign-in exchange failed with HTTP ${response.status}.`);
      const session = parseWebSession(await response.json());
      localStorage.setItem(sessionKey, JSON.stringify(session));
      window.dispatchEvent(new Event("rlogs:session-changed"));
      clearAuthenticationParameters();
    } catch (error) {
      status.textContent = "Sign-in failed";
      content.replaceChildren(message(errorText(error)));
      return;
    }
  }

  const session = loadSession();
  if (!session) {
    await renderSignedOut(status, content);
    return;
  }
  if (session.expires_unix_millis <= Date.now()) {
    localStorage.removeItem(sessionKey);
    window.dispatchEvent(new Event("rlogs:session-changed"));
    await renderSignedOut(status, content);
    return;
  }
  await renderSignedIn(status, content, session, mode);
}

async function renderSignedOut(status: HTMLElement, content: HTMLElement): Promise<void> {
  let enabled = false;
  try {
    const response = await fetch(`${apiBase}/v1/auth/config`);
    const value: unknown = await response.json();
    enabled =
      response.ok &&
      isRecord(value) &&
      value.schema_version === 1 &&
      value.discord_enabled === true;
  } catch {
    // The explicit unavailable state below is more useful than a thrown mount.
  }
  status.textContent = enabled ? "Signed out" : "Awaiting Discord setup";
  const copy = message(
    enabled
      ? "Sign in with Discord to create a per-device rLogs app token and claim profiles observed by your local client."
      : "Discord sign-in is implemented but the deployment still needs its Discord application credentials.",
  );
  const link = document.createElement("a");
  link.className = "button primary";
  link.textContent = "Sign in with Discord";
  link.href = `${apiBase}/v1/auth/discord/start`;
  if (!enabled) {
    link.setAttribute("aria-disabled", "true");
    link.addEventListener("click", (event) => event.preventDefault());
  }
  content.replaceChildren(copy, link);
}

async function renderSignedIn(
  status: HTMLElement,
  content: HTMLElement,
  session: WebSession,
  mode: "profile" | "settings",
): Promise<void> {
  let account = session.account;
  try {
    const response = await fetch(`${apiBase}/v1/auth/me`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!response.ok) throw new Error("Session expired.");
    account = parseAccount(await response.json());
  } catch {
    localStorage.removeItem(sessionKey);
    window.dispatchEvent(new Event("rlogs:session-changed"));
    await renderSignedOut(status, content);
    return;
  }
  status.textContent = "Signed in";
  session.account = account;
  localStorage.setItem(sessionKey, JSON.stringify(session));
  if (mode === "profile") {
    document.querySelector<HTMLElement>("#account-title")?.replaceChildren("My Profile");
    const linkedProfiles = await renderLinkedProfiles(session);
    const manage = document.createElement("a");
    manage.className = "button secondary account-manage-link";
    manage.href = "/my-account/";
    manage.textContent = "Manage My Account";
    content.replaceChildren(linkedProfiles, manage);
    return;
  }

  const identity = document.createElement("div");
  identity.className = "profile-identity";
  if (account.discord_avatar_url) {
    const avatar = document.createElement("img");
    avatar.className = "profile-avatar";
    avatar.src = account.discord_avatar_url;
    avatar.alt = "";
    identity.append(avatar);
  }
  const copy = document.createElement("div");
  copy.append(
    element("p", "eyebrow", "Discord login identity"),
    element("h3", "", account.discord_global_name ?? account.discord_username),
    element("p", "identity-id", `@${account.discord_username}`),
  );
  identity.append(copy);

  const publicIdentity = document.createElement("section");
  publicIdentity.className = "account-settings-card";
  publicIdentity.append(
    element("p", "eyebrow", "Public rLogs identity"),
    element("h3", "", account.username ?? account.discord_username),
    element(
      "p",
      "identity-id",
      account.account_id ? `rLogs ID ${account.account_id}` : "rLogs ID will be assigned by the account service",
    ),
  );
  if (account.account_id) {
    const publicLink = document.createElement("a");
    publicLink.className = "profile-public-link";
    publicLink.href = `/users/${account.account_id}/`;
    publicLink.textContent = "View public account";
    publicIdentity.append(publicLink);
  }

  const usernameForm = document.createElement("form");
  usernameForm.className = "account-username-form account-settings-card";
  const usernameLabel = document.createElement("label");
  usernameLabel.append(element("span", "", "Public username"));
  const username = document.createElement("input");
  username.type = "text";
  username.name = "username";
  username.required = true;
  username.minLength = 3;
  username.maxLength = 24;
  username.pattern = "[A-Za-z0-9][A-Za-z0-9_-]{1,22}[A-Za-z0-9]";
  username.autocomplete = "username";
  username.value = account.username ?? account.discord_username;
  usernameLabel.append(username);
  const usernameHelp = element(
    "small",
    "",
    "3-24 letters, numbers, hyphens, or underscores. Changing it does not change your stable rLogs account URL.",
  );
  const saveUsername = element("button", "button primary", "Save username");
  saveUsername.type = "submit";
  const usernameStatus = element("span", "account-inline-status");
  usernameStatus.setAttribute("role", "status");
  usernameForm.append(usernameLabel, usernameHelp, saveUsername, usernameStatus);
  usernameForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    saveUsername.disabled = true;
    usernameStatus.textContent = "Saving…";
    try {
      const response = await fetch(`${apiBase}/v1/auth/me`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: username.value }),
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || `Username update failed with HTTP ${response.status}.`);
      }
      const updated = parseAccount(await response.json());
      session.account = updated;
      localStorage.setItem(sessionKey, JSON.stringify(session));
      username.value = updated.username ?? username.value;
      usernameStatus.textContent = "Saved";
      publicIdentity.querySelector("h3")?.replaceChildren(updated.username ?? updated.discord_username);
    } catch (error) {
      usernameStatus.textContent = errorText(error);
    } finally {
      saveUsername.disabled = false;
    }
  });

  const explanation = message(
    "Generate a token for one PC, then paste it into rLogs Settings → Website account connection. Log Uploader and Profile Sync share it. The desktop stores the token in Windows Credential Manager; the website will never show it again.",
  );
  const actions = document.createElement("div");
  actions.className = "button-row";
  const generate = element("button", "button primary", "Create app token");
  generate.type = "button";
  const signOut = element("button", "button secondary", "Sign out here");
  signOut.type = "button";
  const output = document.createElement("div");
  output.className = "account-token-output";
  output.hidden = true;
  generate.addEventListener("click", async () => {
    generate.disabled = true;
    status.textContent = "Creating app token…";
    try {
      const response = await fetch(`${apiBase}/v1/auth/app-tokens`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) throw new Error(`Token creation failed with HTTP ${response.status}.`);
      const receipt = parseAppToken(await response.json());
      const token = element("code", "", receipt.device_token);
      const copyButton = element("button", "button secondary", "Copy token");
      copyButton.type = "button";
      copyButton.addEventListener("click", async () => {
        await navigator.clipboard.writeText(receipt.device_token);
        copyButton.textContent = "Copied";
      });
      output.replaceChildren(
        element("strong", "", "Copy this app token now"),
        token,
        copyButton,
        element("small", "", `Device ${receipt.device_id}`),
      );
      output.hidden = false;
      status.textContent = "App token ready";
    } catch (error) {
      output.replaceChildren(message(errorText(error)));
      output.hidden = false;
      status.textContent = "Token creation failed";
    } finally {
      generate.disabled = false;
    }
  });
  signOut.addEventListener("click", () => {
    localStorage.removeItem(sessionKey);
    window.dispatchEvent(new Event("rlogs:session-changed"));
    location.reload();
  });
  actions.append(generate, signOut);
  const linkedProfiles = await renderClaimedProfileLinks(session);
  const connection = document.createElement("section");
  connection.className = "account-connection account-settings-card";
  connection.append(
    element("h3", "", "Desktop connection"),
    explanation,
    actions,
    output,
  );
  content.replaceChildren(identity, publicIdentity, usernameForm, linkedProfiles, connection);
}

async function renderClaimedProfileLinks(session: WebSession): Promise<HTMLElement> {
  const section = document.createElement("section");
  section.className = "account-settings-card";
  section.append(element("h3", "", "Claimed characters"));
  try {
    const catalog = await loadLinkedProfileCatalog(session);
    if (!catalog.profiles.length) {
      section.append(message("No UID has been claimed by this account yet."));
      return section;
    }
    const list = document.createElement("div");
    list.className = "linked-profile-list";
    for (const profile of catalog.profiles) {
      const link = document.createElement("a");
      link.className = "linked-profile-card";
      link.href = `/profiles/${encodeURIComponent(profile.character_id)}/`;
      link.append(
        element("strong", "", profile.display_name ?? `UID ${profile.character_id}`),
        element("small", "identity-id", `UID ${profile.character_id}`),
      );
      list.append(link);
    }
    section.append(list);
  } catch (error) {
    section.append(message(errorText(error)));
  }
  return section;
}

async function loadLinkedProfileCatalog(session: WebSession): Promise<LinkedProfileCatalog> {
  const response = await fetch(`${apiBase}/v1/auth/profiles`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!response.ok) throw new Error(`Linked-profile request failed with HTTP ${response.status}.`);
  return parseLinkedProfileCatalog(await response.json());
}

async function renderLinkedProfiles(session: WebSession): Promise<HTMLElement> {
  const section = document.createElement("section");
  section.className = "linked-profile-section";
  try {
    const catalog = await loadLinkedProfileCatalog(session);
    if (catalog.profiles.length === 0) {
      section.append(
        element("h3", "", "My Profile"),
        message(
          "No UID is linked yet. Connect your local rLogs app and enable BPSR Profile Sync while the game is open. The parser will claim your UID as soon as it observes your personal character snapshot; replayed, imported, offline, and shared logs are rejected.",
        ),
      );
      return section;
    }

    const list = document.createElement("div");
    list.className = "linked-profile-list";
    for (const profile of catalog.profiles) {
      const card = document.createElement("article");
      card.className = "linked-profile-card";
      const location = [profile.region, profile.realm ?? profile.world]
        .filter((value): value is string => Boolean(value))
        .join(" · ");
      const link = document.createElement("a");
      link.href = `/account/?profile=${encodeURIComponent(profile.profile_id)}`;
      link.textContent = profile.display_name ?? `UID ${profile.character_id}`;
      const publicLink = document.createElement("a");
      publicLink.className = "profile-public-link";
      publicLink.href = `/profiles/${encodeURIComponent(profile.character_id)}/`;
      publicLink.textContent = "View public profile";
      card.append(
        link,
        element("strong", "identity-id", `UID ${profile.character_id}`),
        element("small", "", location || profile.deployment),
        element(
          "small",
          "",
          `${profile.module_inventory_count.toLocaleString()} modules · ${profile.equipped_module_count.toLocaleString()} equipped`,
        ),
        publicLink,
      );
      list.append(card);
    }
    if (catalog.profiles.length > 1) {
      const switcher = element("div", "linked-profile-switcher");
      switcher.append(element("p", "eyebrow", "Choose a synced character"), list);
      section.append(switcher);
    }

    const requested = new URLSearchParams(location.search).get("profile");
    const selected = catalog.profiles.find((profile) => profile.profile_id === requested) ?? catalog.profiles[0];
    if (!selected) return section;
    const loading = message("Loading your latest synced character snapshot…");
    section.append(loading);
    try {
      const profile = await loadPublishedProfile(selected.profile_id);
      loading.replaceWith(await renderSyncedCharacterProfile(profile));
    } catch (error) {
      loading.replaceWith(message(errorText(error)));
    }
  } catch (error) {
    section.append(message(errorText(error)));
  }
  return section;
}

export function parseAccount(value: unknown): AccountView {
  if (
    !isRecord(value) ||
    value.schema_version !== 1 ||
    typeof value.submitter_id !== "string" ||
    !/^usr_[0-9a-f]{32}$/u.test(value.submitter_id) ||
    typeof value.discord_username !== "string" ||
    value.discord_username.length === 0 ||
    !(value.account_id === undefined ||
      (positiveSafeInteger(value.account_id) && value.account_id >= 100_000_000_000 && value.account_id <= 999_999_999_999)) ||
    !(value.username === undefined ||
      (typeof value.username === "string" && /^[a-z0-9][a-z0-9_-]{1,22}[a-z0-9]$/u.test(value.username))) ||
    !isNullableString(value.discord_global_name) ||
    !isNullableString(value.discord_avatar_url)
  ) {
    throw new Error("The account response is invalid.");
  }
  return value as unknown as AccountView;
}

export function parseWebSession(value: unknown): WebSession {
  if (
    !isRecord(value) ||
    value.schema_version !== 1 ||
    typeof value.access_token !== "string" ||
    !value.access_token.startsWith("rlw_") ||
    typeof value.expires_unix_millis !== "number" ||
    !Number.isSafeInteger(value.expires_unix_millis) ||
    value.expires_unix_millis <= Date.now()
  ) {
    throw new Error("The sign-in response is invalid.");
  }
  const account = parseAccount(value.account);
  return { ...value, account } as WebSession;
}

export function parseAppToken(value: unknown): AppTokenReceipt {
  if (
    !isRecord(value) ||
    value.schema_version !== 1 ||
    typeof value.device_token !== "string" ||
    !/^rld_[0-9a-f]{64}$/u.test(value.device_token) ||
    typeof value.device_id !== "string" ||
    !/^dev_[0-9a-f]{32}$/u.test(value.device_id) ||
    typeof value.created_unix_millis !== "number" ||
    !Number.isSafeInteger(value.created_unix_millis) ||
    value.created_unix_millis <= 0
  ) {
    throw new Error("The app-token response is invalid.");
  }
  return value as unknown as AppTokenReceipt;
}

export function parseDiscordCompletion(value: unknown): DiscordCompletionReceipt {
  if (
    !isRecord(value) ||
    value.schema_version !== 1 ||
    typeof value.login_code !== "string" ||
    !/^login_[0-9a-f]{64}$/u.test(value.login_code)
  ) {
    throw new Error("The Discord completion response is invalid.");
  }
  return value as unknown as DiscordCompletionReceipt;
}

export function parseLinkedProfileCatalog(value: unknown): LinkedProfileCatalog {
  if (!isRecord(value) || value.schema_version !== 1 || !Array.isArray(value.profiles)) {
    throw new Error("The linked-profile response is invalid.");
  }
  const profiles = value.profiles.map((profile) => {
    if (
      !isRecord(profile) ||
      typeof profile.profile_id !== "string" ||
      !/^prf_[0-9a-f]{32}$/u.test(profile.profile_id) ||
      !positiveSafeInteger(profile.updated_unix_millis) ||
      typeof profile.source_client_build !== "string" ||
      typeof profile.deployment !== "string" ||
      typeof profile.region !== "string" ||
      !isNullableString(profile.realm) ||
      !isNullableString(profile.world) ||
      typeof profile.character_id !== "string" ||
      profile.character_id.length === 0 ||
      !isNullableString(profile.display_name) ||
      !nonnegativeSafeInteger(profile.module_inventory_count) ||
      !nonnegativeSafeInteger(profile.equipped_module_count)
    ) {
      throw new Error("The linked-profile response is invalid.");
    }
    return profile as unknown as LinkedProfileEntry;
  });
  return { schema_version: 1, profiles };
}

function clearAuthenticationParameters(): void {
  const url = new URL(window.location.href);
  for (const name of ["auth_code", "code", "state", "error", "error_description"]) {
    url.searchParams.delete(name);
  }
  history.replaceState(null, "", `${url.pathname}${url.search}`);
}

function loadSession(): WebSession | undefined {
  const source = localStorage.getItem(sessionKey);
  if (!source) return undefined;
  try {
    return parseWebSession(JSON.parse(source) as unknown);
  } catch {
    localStorage.removeItem(sessionKey);
    window.dispatchEvent(new Event("rlogs:session-changed"));
    return undefined;
  }
}

function requiredElement(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing required account element #${id}.`);
  return node;
}

function message(text: string): HTMLParagraphElement {
  return element("p", "section-intro", text);
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "The account request failed.";
}
