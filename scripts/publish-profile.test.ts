import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import {
  type LocalProfilePackage,
  requestDigest,
} from "../src/contracts/local-profile-package";
import {
  type JsonValue,
  type WebsitePayloadEnvelope,
} from "../src/contracts/website-payload";
import { publishProfilePackage } from "./publish-profile";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

describe("developer profile publisher", () => {
  it("uses the character UID and updates the same profile in place", async () => {
    const root = await temporaryRoot();
    const input = join(root, "profile.json");
    await writeFile(input, JSON.stringify(profileEnvelope("1000001", 60)));

    const first = await publishProfilePackage({
      input,
      websiteRoot: root,
      confirmPublic: true,
    });
    expect(first.wroteFiles).toBe(true);
    expect(first.entry.profile_id).toBe("1000001");
    expect(first.profilePath).toContain("1000001");

    await writeFile(input, JSON.stringify(profileEnvelope("1000001", 61)));
    await publishProfilePackage({
      input,
      websiteRoot: root,
      confirmPublic: true,
    });

    const index = JSON.parse(await readFile(first.indexPath, "utf8")) as {
      profiles: Array<{ profile_id: string }>;
    };
    expect(index.profiles.map((entry) => entry.profile_id)).toEqual(["1000001"]);
    const payload = JSON.parse(await readFile(first.profilePath, "utf8")) as {
      body: { level: number };
    };
    expect(payload.body.level).toBe(61);
  });

  it("normalizes published package line endings for stable GitHub Pages hashes", async () => {
    const root = await temporaryRoot();
    const input = join(root, "profile.json");
    const source = `${JSON.stringify(profileEnvelope("1000001", 60), null, 2)}\n`
      .replace(/\n/g, "\r\n");
    await writeFile(input, source);

    const result = await publishProfilePackage({
      input,
      websiteRoot: root,
      confirmPublic: true,
    });
    const published = await readFile(result.profilePath, "utf8");

    expect(published).not.toContain("\r");
    expect(result.entry.payload_bytes).toBe(Buffer.byteLength(published));
  });

  it("verifies a native local package and publishes only its public envelope", async () => {
    const root = await temporaryRoot();
    const input = join(root, "current.profile.json");
    const profilePackage = await localProfilePackage("1000001", 60);
    await writeFile(input, JSON.stringify(profilePackage, null, 2));

    const result = await publishProfilePackage({
      input,
      websiteRoot: root,
      confirmPublic: true,
    });
    const published = JSON.parse(await readFile(result.profilePath, "utf8")) as {
      request?: unknown;
      body: { level: number };
    };

    expect(published.request).toBeUndefined();
    expect(published.body.level).toBe(60);
    expect(result.entry.source_package_id).toBe(profilePackage.package_id);
    expect(result.entry.source_observation_count).toBe(2);
    expect(result.entry.source_protocol_pack_digest).toBe(profilePackage.source.protocol_pack_digest);
  });

  it("rejects a tampered native local package before publication", async () => {
    const root = await temporaryRoot();
    const input = join(root, "current.profile.json");
    const profilePackage = await localProfilePackage("1000001", 60);
    profilePackage.request.payload.body.level = 61;
    await writeFile(input, JSON.stringify(profilePackage));

    await expect(
      publishProfilePackage({
        input,
        websiteRoot: root,
        confirmPublic: true,
      }),
    ).rejects.toThrow("package_id does not match");
  });

  it("requires explicit confirmation before writing public files", async () => {
    const root = await temporaryRoot();
    const input = join(root, "profile.json");
    await writeFile(input, JSON.stringify(profileEnvelope("1000001", 60)));

    await expect(
      publishProfilePackage({
        input,
        websiteRoot: root,
      }),
    ).rejects.toThrow("--confirm-public");
  });

  it("rejects prohibited account data before publication", async () => {
    const root = await temporaryRoot();
    const input = join(root, "profile.json");
    const profile = profileEnvelope("1000001", 60);
    profile.body.account = { id: "private" };
    await writeFile(input, JSON.stringify(profile));

    await expect(
      publishProfilePackage({
        input,
        websiteRoot: root,
        confirmPublic: true,
      }),
    ).rejects.toThrow("prohibited account or credential field");
  });

  it("rejects mismatched body and routing character UIDs", async () => {
    const root = await temporaryRoot();
    const input = join(root, "profile.json");
    const profile = profileEnvelope("1000001", 60);
    profile.routing["character-id"] = "1000002";
    await writeFile(input, JSON.stringify(profile));

    await expect(
      publishProfilePackage({
        input,
        websiteRoot: root,
        confirmPublic: true,
      }),
    ).rejects.toThrow("must match routing character-id");
  });
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "rlogs-profile-publisher-"));
  temporaryRoots.push(root);
  return root;
}

function profileEnvelope(
  characterId: string,
  level: number,
): WebsitePayloadEnvelope {
  const body: Record<string, JsonValue> = {
    character: { character_id: characterId },
    display_name: "Test Character",
    level,
  };
  return {
    schema_version: 1,
    game_plugin_id: "app.rlogs.game.blue-protocol-star-resonance",
    payload_kind: "character-profile",
    payload_schema_id: "app.rlogs.bpsr.character-profile",
    payload_schema_version: 1,
    routing: {
      deployment: "global",
      region: "global",
      realm: "asteria",
      "character-id": characterId,
    },
    body,
  };
}

async function localProfilePackage(
  characterId: string,
  level: number,
): Promise<LocalProfilePackage> {
  const request = {
    relative_endpoint: "/v1/games/blue-protocol-star-resonance/profiles",
    payload: profileEnvelope(characterId, level),
  };
  return {
    schema_version: 1,
    package_id: await requestDigest(request),
    created_unix_millis: 1_789_000_000_000,
    source: {
      session_id: "session-1",
      client_build: "build-1",
      protocol_pack_digest: `sha256:${"b".repeat(64)}`,
      canonical_content_sha256: `sha256:${"a".repeat(64)}`,
      observation_count: 2,
      last_event_sequence: 9,
    },
    request,
  };
}
