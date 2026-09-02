const sessionKey = "rlogs.web-session.v1";
const apiBase = String(import.meta.env.VITE_RLOGS_API_BASE_URL ?? "").replace(/\/$/u, "");

export type SitePage = "home" | "parses" | "my-parses" | "profiles" | "users" | "account" | "my-account" | "optimizer";

const pageTitles: Record<SitePage, string> = {
  home: "rLogs",
  parses: "Parses · rLogs",
  "my-parses": "My Parses · rLogs",
  profiles: "Profiles · rLogs",
  users: "Player · rLogs",
  account: "Account · rLogs",
  "my-account": "My Account · rLogs",
  optimizer: "Module Optimizer · rLogs",
};

export function pageFromPath(pathname: string): SitePage {
  const route = pathname.replace(/\/+$/u, "") || "/";
  if (route === "/parses") return "parses";
  if (route === "/my-parses") return "my-parses";
  if (route === "/profiles" || route.startsWith("/profiles/")) return "profiles";
  if (route === "/users" || route.startsWith("/users/")) return "users";
  if (route === "/account") return "account";
  if (route === "/my-account") return "my-account";
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
    if (
      link.dataset.navPage === page ||
      (page === "users" && link.dataset.navPage === "profiles")
    ) link.setAttribute("aria-current", "page");
  }

  const refreshAccountLabel = (): void => {
    const signedIn = hasActiveSession(localStorage.getItem(sessionKey));
    for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-authenticated-nav]")) {
      link.hidden = !signedIn;
    }
    if (page === "account" && signedIn) document.title = "My Profile · rLogs";
  };
  refreshAccountLabel();
  window.addEventListener("rlogs:session-changed", refreshAccountLabel);

  for (const action of document.querySelectorAll<HTMLAnchorElement>("[data-auth-action]")) {
    action.addEventListener("click", (event) => {
      if (!hasActiveSession(localStorage.getItem(sessionKey))) return;
      event.preventDefault();
      localStorage.removeItem(sessionKey);
      window.dispatchEvent(new Event("rlogs:session-changed"));
      location.assign("/");
    });
  }

  const refreshAuthenticationAction = (): void => {
    const signedIn = hasActiveSession(localStorage.getItem(sessionKey));
    for (const action of document.querySelectorAll<HTMLAnchorElement>("[data-auth-action]")) {
      action.textContent = signedIn ? "Log out" : "Log in with Discord";
      action.href = signedIn
        ? "#logout"
        : apiBase
          ? `${apiBase}/v1/auth/discord/start`
          : "/account/";
    }
  };
  refreshAuthenticationAction();
  window.addEventListener("rlogs:session-changed", refreshAuthenticationAction);

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
