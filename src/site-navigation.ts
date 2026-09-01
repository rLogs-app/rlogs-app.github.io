const sessionKey = "rlogs.web-session.v1";

export type SitePage = "home" | "parses" | "profiles" | "account" | "optimizer";

const pageTitles: Record<SitePage, string> = {
  home: "rLogs",
  parses: "Parses · rLogs",
  profiles: "Profiles · rLogs",
  account: "Account · rLogs",
  optimizer: "Module Optimizer · rLogs",
};

export function pageFromPath(pathname: string): SitePage {
  const route = pathname.replace(/\/+$/u, "") || "/";
  if (route === "/parses") return "parses";
  if (route === "/profiles") return "profiles";
  if (route === "/account") return "account";
  if (route === "/optimizer") return "optimizer";
  return "home";
}

export function hasActiveSession(source: string | null, now = Date.now()): boolean {
  if (!source) return false;
  try {
    const value: unknown = JSON.parse(source);
    return (
      isRecord(value) &&
      typeof value.access_token === "string" &&
      value.access_token.startsWith("rlw_") &&
      typeof value.expires_unix_millis === "number" &&
      Number.isSafeInteger(value.expires_unix_millis) &&
      value.expires_unix_millis > now
    );
  } catch {
    return false;
  }
}

export function mountSiteNavigation(): SitePage {
  const page = pageFromPath(location.pathname);
  document.documentElement.dataset.rlogsPage = page;
  document.title = pageTitles[page];

  for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-nav-page]")) {
    if (link.dataset.navPage === page) link.setAttribute("aria-current", "page");
  }

  const refreshAccountLabel = (): void => {
    const signedIn = hasActiveSession(localStorage.getItem(sessionKey));
    for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-account-nav]")) {
      link.textContent = signedIn ? "My Profile" : "Account";
    }
    if (page === "account" && signedIn) document.title = "My Profile · rLogs";
  };
  refreshAccountLabel();
  window.addEventListener("rlogs:session-changed", refreshAccountLabel);

  if (page === "home") redirectLegacyDeepLink(location.search);
  return page;
}

function redirectLegacyDeepLink(search: string): void {
  const parameters = new URLSearchParams(search);
  if (parameters.has("parse")) {
    location.replace(`/parses/${search}`);
  } else if (parameters.has("profile")) {
    location.replace(`/profiles/${search}`);
  } else if (parameters.has("auth_code")) {
    location.replace(`/account/${search}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
