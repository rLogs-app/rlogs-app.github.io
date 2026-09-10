import { Window } from "happy-dom";
import { describe, expect, it, vi } from "vitest";

import { mountLatestInstallerLink, versionedInstallerAsset } from "./latest-installer";

const release = (overrides: Record<string, unknown> = {}) => ({
  tag_name: "v0.1.137",
  draft: false,
  prerelease: false,
  assets: [{
    name: "rLogs_0.1.137_x64-setup.exe",
    browser_download_url: "https://github.com/donneeee/RLogs/releases/download/v0.1.137/rLogs_0.1.137_x64-setup.exe",
  }],
  ...overrides,
});

describe("latest versioned installer link", () => {
  it("accepts exactly one versioned installer matching the latest release tag", () => {
    expect(versionedInstallerAsset(release())?.name).toBe("rLogs_0.1.137_x64-setup.exe");
    expect(versionedInstallerAsset(release({ tag_name: "v0.1.138" }))).toBeUndefined();
    expect(versionedInstallerAsset(release({ draft: true }))).toBeUndefined();
    expect(versionedInstallerAsset(release({
      assets: [...release().assets, ...release().assets],
    }))).toBeUndefined();
  });

  it("rejects unversioned and off-repository asset URLs", () => {
    expect(versionedInstallerAsset(release({ assets: [{
      name: "rLogs_x64-setup.exe",
      browser_download_url: "https://github.com/donneeee/RLogs/releases/download/v0.1.137/rLogs_x64-setup.exe",
    }] }))).toBeUndefined();
    expect(versionedInstallerAsset(release({ assets: [{
      name: "rLogs_0.1.137_x64-setup.exe",
      browser_download_url: "https://example.com/rLogs_0.1.137_x64-setup.exe",
    }] }))).toBeUndefined();
  });

  it("upgrades the fallback release-page link only after valid metadata", async () => {
    const window = new Window();
    window.document.body.innerHTML = '<a data-latest-installer href="https://github.com/donneeee/RLogs/releases/latest">Get</a>';
    const fetcher = vi.fn(async () => new Response(JSON.stringify(release()), { status: 200 }));

    await mountLatestInstallerLink(fetcher, window.document as unknown as ParentNode);

    const link = window.document.querySelector("a") as unknown as HTMLAnchorElement;
    expect(link.href).toBe("https://github.com/donneeee/RLogs/releases/download/v0.1.137/rLogs_0.1.137_x64-setup.exe");
    expect(link.title).toBe("Download rLogs_0.1.137_x64-setup.exe");
  });

  it("keeps the latest-release page when metadata cannot be trusted", async () => {
    const window = new Window();
    window.document.body.innerHTML = '<a data-latest-installer href="https://github.com/donneeee/RLogs/releases/latest">Get</a>';
    await mountLatestInstallerLink(
      vi.fn(async () => new Response(JSON.stringify(release({ prerelease: true })), { status: 200 })),
      window.document as unknown as ParentNode,
    );
    expect((window.document.querySelector("a") as unknown as HTMLAnchorElement).href)
      .toBe("https://github.com/donneeee/RLogs/releases/latest");
  });
});
