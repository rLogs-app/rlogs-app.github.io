const latestReleaseApi = "https://api.github.com/repos/donneeee/RLogs/releases/latest";

interface LatestReleaseAsset {
  name: string;
  browser_download_url: string;
}

export function versionedInstallerAsset(value: unknown): LatestReleaseAsset | undefined {
  if (!isRecord(value) || value.draft !== false || value.prerelease !== false ||
      typeof value.tag_name !== "string" || !Array.isArray(value.assets)) return undefined;
  const candidates = value.assets.flatMap((asset) => {
    if (!isRecord(asset) || typeof asset.name !== "string" ||
        typeof asset.browser_download_url !== "string") return [];
    const match = /^rLogs_(\d+\.\d+\.\d+)_x64-setup\.exe$/u.exec(asset.name);
    if (!match || value.tag_name !== `v${match[1]}`) return [];
    try {
      const url = new URL(asset.browser_download_url);
      const path = url.pathname.split("/").filter(Boolean);
      if (url.protocol !== "https:" || url.hostname !== "github.com" ||
          path.length !== 6 || path[0] !== "donneeee" || path[1] !== "RLogs" ||
          path[2] !== "releases" || path[3] !== "download" || path[5] !== asset.name) return [];
    } catch {
      return [];
    }
    return [{ name: asset.name, browser_download_url: asset.browser_download_url }];
  });
  return candidates.length === 1 ? candidates[0] : undefined;
}

export async function mountLatestInstallerLink(
  fetcher: typeof fetch = fetch,
  root: ParentNode = document,
): Promise<void> {
  const link = root.querySelector<HTMLAnchorElement>("[data-latest-installer]");
  if (!link) return;
  try {
    const response = await fetcher(latestReleaseApi, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return;
    const asset = versionedInstallerAsset(await response.json());
    if (!asset) return;
    link.href = asset.browser_download_url;
    link.title = `Download ${asset.name}`;
  } catch {
    // Keep the latest-release page fallback when GitHub's unauthenticated API
    // is unavailable or rate-limited.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
