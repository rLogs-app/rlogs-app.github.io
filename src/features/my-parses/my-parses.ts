import {
  isMyParseCatalog,
  isPublicParseReport,
  type MyParseCatalog,
  type MyParseCatalogEntry,
} from "../../contracts/public-parse";
import { renderCatalogEntry, renderReport } from "../parse-browser/parse-browser";

const sessionKey = "rlogs.web-session.v1";
const configuredApi = String(import.meta.env.VITE_RLOGS_API_BASE_URL ?? "").replace(/\/$/u, "");

interface WebSession {
  access_token: string;
  expires_unix_millis: number;
}

export async function mountMyParses(): Promise<void> {
  const status = required<HTMLElement>("#my-parse-status");
  const signIn = required<HTMLElement>("#my-parse-sign-in");
  const browser = required<HTMLElement>("#my-parse-browser");
  const search = required<HTMLInputElement>("#my-parse-search");
  const list = required<HTMLElement>("#my-parse-list");
  const detail = required<HTMLElement>("#my-parse-detail");
  const session = activeSession();

  if (!session) {
    status.textContent = "Sign in required";
    status.className = "status-chip neutral";
    signIn.hidden = false;
    browser.hidden = true;
    return;
  }
  const authenticatedSession = session;
  if (!configuredApi) {
    status.textContent = "API unavailable";
    status.className = "status-chip danger";
    signIn.hidden = true;
    browser.hidden = false;
    list.innerHTML = '<p class="empty-state">My Parses is available on the published site.</p>';
    return;
  }

  signIn.hidden = true;
  browser.hidden = false;
  let catalog: MyParseCatalog;
  try {
    catalog = await fetchCatalog(authenticatedSession);
  } catch (error) {
    handleRequestError(error, status, list);
    return;
  }

  const renderList = (): void => {
    const entries = filterMyParses(catalog.entries, search.value);
    status.textContent = `${entries.length.toLocaleString()} shown · ${catalog.total_entries.toLocaleString()} my parses`;
    status.className = "status-chip success";
    const claimed = catalog.claimed_character_ids.length
      ? `<p class="my-parse-claims">Matched against claimed UID${catalog.claimed_character_ids.length === 1 ? "" : "s"}: ${catalog.claimed_character_ids.map(escapeHtml).join(", ")}</p>`
      : '<p class="my-parse-claims">No UID is claimed yet. Reports submitted by this account are still shown.</p>';
    list.innerHTML = entries.length
      ? `${claimed}${entries.map(renderMyParseEntry).join("")}${renderLoadMore(catalog)}`
      : `${claimed}<p class="empty-state">No parses match this search.</p>`;
    list.querySelectorAll<HTMLButtonElement>("[data-report-id]").forEach((button) => {
      button.addEventListener("click", () =>
        void openReport(
          button.dataset.reportId ?? "",
          Number(button.dataset.runIndex ?? "0"),
        ),
      );
    });
    list.querySelector<HTMLButtonElement>("[data-load-more]")?.addEventListener("click", () =>
      void loadMore(),
    );
  };

  search.addEventListener("input", renderList);
  renderList();
  const parameters = new URLSearchParams(location.search);
  const requested = parameters.get("parse");
  if (requested) await openReport(requested, Number(parameters.get("run") ?? "0"));

  async function loadMore(): Promise<void> {
    if (catalog.next_offset == null) return;
    try {
      const next = await fetchCatalog(authenticatedSession, catalog.next_offset);
      catalog = {
        ...next,
        entries: [...catalog.entries, ...next.entries],
        offset: 0,
      };
      renderList();
    } catch (error) {
      handleRequestError(error, status, list);
    }
  }

  async function openReport(reportId: string, runIndex: number): Promise<void> {
    if (!/^rpt_[a-f0-9]{32}$/u.test(reportId)) return;
    detail.innerHTML = '<p class="empty-state">Loading your server-verified parse…</p>';
    try {
      const response = await authenticatedFetch(
        `${configuredApi}/v1/auth/parses/${encodeURIComponent(reportId)}`,
        authenticatedSession,
      );
      const value: unknown = await response.json();
      if (!isPublicParseReport(value)) throw new Error("The server returned an unsupported parse contract.");
      detail.innerHTML = renderReport(value, runIndex, null, null);
      history.replaceState(
        null,
        "",
        `${location.pathname}?parse=${encodeURIComponent(reportId)}&run=${runIndex}#my-parses`,
      );
    } catch (error) {
      detail.innerHTML = `<p class="empty-state">${escapeHtml(errorText(error))}</p>`;
    }
  }
}

async function fetchCatalog(session: WebSession, offset = 0): Promise<MyParseCatalog> {
  const response = await authenticatedFetch(
    `${configuredApi}/v1/auth/parses?limit=250${offset ? `&offset=${offset}` : ""}`,
    session,
  );
  const value: unknown = await response.json();
  if (!isMyParseCatalog(value)) throw new Error("The server returned an unsupported My Parses contract.");
  return value;
}

async function authenticatedFetch(url: string, session: WebSession): Promise<Response> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  if (response.status === 401) {
    localStorage.removeItem(sessionKey);
    window.dispatchEvent(new Event("rlogs:session-changed"));
    throw new Error("Your website session expired. Sign in again to view My Parses.");
  }
  if (!response.ok) throw new Error(`My Parses request failed (${response.status}).`);
  return response;
}

export function filterMyParses(
  entries: MyParseCatalogEntry[],
  search: string,
): MyParseCatalogEntry[] {
  const terms = search.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  if (!terms.length) return entries;
  return entries.filter((entry) => {
    const value = [
      entry.scene_name,
      entry.activity_id,
      entry.activity_family_id,
      entry.region_id,
      entry.deployment_id,
      entry.difficulty_family,
      entry.terminal_state,
      entry.report_id,
      entry.visibility,
      entry.submitted_by_you ? "submitted by me" : "participant",
      ...entry.matched_character_ids,
    ]
      .filter((part): part is string => Boolean(part))
      .join(" ")
      .toLocaleLowerCase();
    return terms.every((term) => value.includes(term));
  });
}

function renderMyParseEntry(entry: MyParseCatalogEntry): string {
  const relationship = entry.submitted_by_you
    ? "Submitted by you"
    : `Participant${entry.matched_character_ids.length === 1 ? "" : "s"}: ${entry.matched_character_ids.join(", ")}`;
  return `<article class="my-parse-entry">
    <div class="my-parse-entry-meta"><span class="status-chip neutral">${escapeHtml(title(entry.visibility))}</span><span>${escapeHtml(relationship)}</span></div>
    ${renderCatalogEntry(entry)}
  </article>`;
}

function renderLoadMore(catalog: MyParseCatalog): string {
  return catalog.next_offset == null
    ? ""
    : `<button class="button secondary parse-load-more" type="button" data-load-more>Load more (${catalog.entries.length} of ${catalog.total_entries})</button>`;
}

function activeSession(): WebSession | undefined {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(sessionKey) ?? "null");
    if (
      isRecord(value) &&
      typeof value.access_token === "string" &&
      value.access_token.startsWith("rlw_") &&
      typeof value.expires_unix_millis === "number" &&
      Number.isSafeInteger(value.expires_unix_millis) &&
      value.expires_unix_millis > Date.now()
    ) {
      return value as unknown as WebSession;
    }
  } catch {
    // The invalid session is removed below.
  }
  localStorage.removeItem(sessionKey);
  return undefined;
}

function handleRequestError(error: unknown, status: HTMLElement, target: HTMLElement): void {
  status.textContent = "My Parses unavailable";
  status.className = "status-chip danger";
  target.innerHTML = `<p class="empty-state">${escapeHtml(errorText(error))}</p>`;
}

function title(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function escapeHtml(value: string): string {
  const node = document.createElement("span");
  node.textContent = value;
  return node.innerHTML;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "My Parses could not be loaded.";
}

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing My Parses element ${selector}.`);
  return element;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
