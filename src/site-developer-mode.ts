const sessionKey = "rlogs.web-session.v1";
const preferenceKey = "rlogs.site-developer-mode.v1";

export function mountSiteDeveloperMode(): void {
  applySiteDeveloperMode();
  window.addEventListener("rlogs:session-changed", applySiteDeveloperMode);
  window.addEventListener("rlogs:site-developer-mode-changed", applySiteDeveloperMode);
}

export function siteDeveloperModePreference(): boolean {
  return localStorage.getItem(preferenceKey) === "1";
}

export function setSiteDeveloperModePreference(enabled: boolean): void {
  localStorage.setItem(preferenceKey, enabled ? "1" : "0");
  window.dispatchEvent(new CustomEvent("rlogs:site-developer-mode-changed"));
}

export function applySiteDeveloperMode(): void {
  document.documentElement.toggleAttribute(
    "data-rlogs-developer-mode",
    siteDeveloperModeEnabled(
      localStorage.getItem(sessionKey),
      localStorage.getItem(preferenceKey),
    ),
  );
}

export function siteDeveloperModeEnabled(
  sessionSource: string | null,
  preferenceSource: string | null,
): boolean {
  if (preferenceSource !== "1" || !sessionSource) return false;
  try {
    const value = JSON.parse(sessionSource) as unknown;
    return (
      typeof value === "object" &&
      value !== null &&
      "account" in value &&
      typeof value.account === "object" &&
      value.account !== null &&
      "developer" in value.account &&
      value.account.developer === true
    );
  } catch {
    return false;
  }
}
