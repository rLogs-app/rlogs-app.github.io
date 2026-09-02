import {
  isMyParseCatalog,
  isPublicParseReport,
  isPublicRunReconciliation,
  isUpdateParseVisibilityResponse,
  type MyParseCatalog,
  type MyParseCatalogEntry,
  type PublicRunReconciliation,
  validateRunGroupId,
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
    list.querySelectorAll<HTMLSelectElement>("[data-visibility-report]").forEach((control) => {
      control.addEventListener("change", () => void updateVisibility(control));
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
      const run = value.runs.find((candidate) => candidate.run_index === runIndex) ?? value.runs[0];
      let reconciliation: PublicRunReconciliation | null = null;
      let reconciliationError: string | null = null;
      if (run?.run_group_id && validateRunGroupId(run.run_group_id)) {
        try {
          const reconciliationResponse = await authenticatedFetch(
            `${configuredApi}/v1/run-groups/${encodeURIComponent(run.run_group_id)}/reconciliation`,
            authenticatedSession,
          );
          const reconciliationValue: unknown = await reconciliationResponse.json();
          if (!isPublicRunReconciliation(reconciliationValue)) {
            throw new Error("The server returned an unsupported reconciliation contract.");
          }
          reconciliation = reconciliationValue;
        } catch (error) {
          reconciliationError = errorText(error);
        }
      }
      detail.innerHTML = renderReport(value, runIndex, reconciliation, reconciliationError);
      history.replaceState(
        null,
        "",
        `${location.pathname}?parse=${encodeURIComponent(reportId)}&run=${runIndex}#my-parses`,
      );
    } catch (error) {
      detail.innerHTML = `<p class="empty-state">${escapeHtml(errorText(error))}</p>`;
    }
  }

  async function updateVisibility(control: HTMLSelectElement): Promise<void> {
    const reportId = control.dataset.visibilityReport ?? "";
    const previous = control.dataset.currentVisibility ?? "unlisted";
    const visibility = control.value;
    if (!/^rpt_[a-f0-9]{32}$/u.test(reportId) || !["public", "unlisted", "private"].includes(visibility)) {
      control.value = previous;
      return;
    }
    control.disabled = true;
    status.textContent = `Changing to ${title(visibility)}…`;
    status.className = "status-chip neutral";
    try {
      const response = await authenticatedFetch(
        `${configuredApi}/v1/auth/parses/${encodeURIComponent(reportId)}/visibility`,
        authenticatedSession,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visibility }),
        },
      );
      const value: unknown = await response.json();
      if (!isUpdateParseVisibilityResponse(value)) {
        throw new Error("The server returned an unsupported visibility receipt.");
      }
      catalog = {
        ...catalog,
        entries: catalog.entries.map((entry) =>
          entry.report_id === reportId ? { ...entry, visibility: value.visibility } : entry,
        ),
      };
      renderList();
      status.textContent = `${title(value.visibility)} · saved on server`;
      status.className = "status-chip success";
    } catch (error) {
      control.value = previous;
      control.disabled = false;
      status.textContent = errorText(error);
      status.className = "status-chip danger";
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

async function authenticatedFetch(
  url: string,
  session: WebSession,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${session.access_token}`);
  const response = await fetch(url, {
    ...init,
    headers,
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

export function renderMyParseEntry(entry: MyParseCatalogEntry): string {
  const relationship = entry.submitted_by_you
    ? "Submitted by you"
    : `Participant${entry.matched_character_ids.length === 1 ? "" : "s"}: ${entry.matched_character_ids.join(", ")}`;
  const visibility = entry.submitted_by_you
    ? `<label class="my-parse-visibility"><span>Visibility</span><select data-visibility-report="${escapeHtml(entry.report_id)}" data-current-visibility="${entry.visibility}" aria-label="Visibility for ${escapeHtml(entry.scene_name ?? entry.report_id)}"><option value="public"${entry.visibility === "public" ? " selected" : ""}>Public</option><option value="unlisted"${entry.visibility === "unlisted" ? " selected" : ""}>Unlisted</option><option value="private"${entry.visibility === "private" ? " selected" : ""}>Private</option></select></label>`
    : `<span class="status-chip neutral">${escapeHtml(title(entry.visibility))}</span>`;
  return `<article class="my-parse-entry">
    <div class="my-parse-entry-meta">${visibility}<span>${escapeHtml(relationship)}</span></div>
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
  return value.replace(/[&<>"']/gu, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
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
