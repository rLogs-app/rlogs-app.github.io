import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  type PublishedProfileEntry,
  type PublishedProfileIndex,
  validatePublishedProfileIndex,
  validatePublishedProfileId,
} from "../src/contracts/published-profiles.ts";
import {
  type LocalProfilePackage,
  validateLocalProfilePackage,
} from "../src/contracts/local-profile-package.ts";
import {
  type JsonValue,
  type WebsitePayloadEnvelope,
  validateWebsitePayload,
} from "../src/contracts/website-payload.ts";

export interface PublishProfileOptions {
  input: string;
  label?: string;
  websiteRoot?: string;
  confirmPublic?: boolean;
  dryRun?: boolean;
}

export interface PublishProfileResult {
  entry: PublishedProfileEntry;
  profilePath: string;
  indexPath: string;
  wroteFiles: boolean;
}

const defaultWebsiteRoot = fileURLToPath(new URL("../", import.meta.url));

export async function publishProfilePackage(
  options: PublishProfileOptions,
): Promise<PublishProfileResult> {
  if (!options.confirmPublic && !options.dryRun) {
    throw new Error(
      "refusing to publish without --confirm-public; only sanitized, user-approved data belongs on the public site",
    );
  }

  const websiteRoot = resolve(options.websiteRoot ?? defaultWebsiteRoot);
  const inputPath = resolve(options.input);
  const source = await readFile(inputPath, "utf8");
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown JSON error";
    throw new Error(`input is not valid JSON: ${message}`);
  }

  const { envelope, profilePackage } = await validateProfileInput(value);
  if (envelope.payload_kind !== "character-profile") {
    throw new Error('payload_kind must be "character-profile".');
  }

  // Local packages retain sealed-log provenance on the developer machine. The
  // public site receives only the already-reviewed website envelope.
  const publishedSource = `${JSON.stringify(envelope, null, 2)}\n`;
  const encoded = Buffer.from(publishedSource, "utf8");
  const character = recordAt(envelope.body, "character");
  const displayName = stringAt(envelope.body, "display_name");
  const routingCharacterId = requiredRoute(envelope.routing, "character-id");
  const characterId = stringAt(character, "character_id") ?? routingCharacterId;
  if (characterId !== routingCharacterId) {
    throw new Error(
      "body.character.character_id must match routing character-id.",
    );
  }
  const profileIdError = validatePublishedProfileId(characterId);
  if (profileIdError) {
    throw new Error(`character UID cannot be used as a profile URL: ${profileIdError}.`);
  }

  const entry: PublishedProfileEntry = {
    profile_id: characterId,
    label: normalizedLabel(options.label ?? displayName ?? characterId),
    game_plugin_id: envelope.game_plugin_id,
    payload_schema_id: envelope.payload_schema_id,
    payload_schema_version: envelope.payload_schema_version,
    deployment: requiredRoute(envelope.routing, "deployment"),
    region: requiredRoute(envelope.routing, "region"),
    realm: envelope.routing.realm,
    world: envelope.routing.world,
    character_id: characterId,
    payload_path: `${characterId}/profile.v${envelope.payload_schema_version}.json`,
    payload_sha256: createHash("sha256").update(encoded).digest("hex"),
    payload_bytes: encoded.byteLength,
    ...(profilePackage
      ? {
          source_package_id: profilePackage.package_id,
          source_created_unix_millis: profilePackage.created_unix_millis,
          source_observation_count: profilePackage.source.observation_count,
          source_client_build: profilePackage.source.client_build,
        }
      : {}),
  };

  const profilesRoot = resolve(websiteRoot, "public", "profiles");
  const indexPath = resolve(profilesRoot, "index.v1.json");
  const profilePath = resolve(profilesRoot, entry.payload_path);
  const index = await readIndex(indexPath);
  index.profiles = [
    ...index.profiles.filter(
      (candidate) => candidate.profile_id !== entry.profile_id,
    ),
    entry,
  ].sort((left, right) => left.profile_id.localeCompare(right.profile_id));

  const indexValidation = validatePublishedProfileIndex(index);
  if (!indexValidation.index) {
    throw new Error(`generated profile index is invalid: ${indexValidation.errors.join(" ")}`);
  }

  if (!options.dryRun) {
    await atomicWrite(profilePath, publishedSource);
    await atomicWrite(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  }
  return { entry, profilePath, indexPath, wroteFiles: !options.dryRun };
}

async function validateProfileInput(value: unknown): Promise<{
  envelope: WebsitePayloadEnvelope;
  profilePackage?: LocalProfilePackage;
}> {
  if (isRecord(value) && ("request" in value || "package_id" in value)) {
    const validation = await validateLocalProfilePackage(value);
    if (!validation.package) {
      throw new Error(
        `local profile package failed validation: ${validation.errors.join(" ")}`,
      );
    }
    return {
      envelope: validation.package.request.payload,
      profilePackage: validation.package,
    };
  }

  const validation = validateWebsitePayload(value);
  if (!validation.envelope) {
    throw new Error(
      `profile envelope failed validation: ${validation.errors.join(" ")}`,
    );
  }
  return { envelope: validation.envelope };
}

async function readIndex(path: string): Promise<PublishedProfileIndex> {
  try {
    const source = await readFile(path, "utf8");
    const result = validatePublishedProfileIndex(JSON.parse(source));
    if (!result.index) {
      throw new Error(result.errors.join(" "));
    }
    return result.index;
  } catch (error) {
    if (isMissingFile(error)) {
      return {
        schema_version: 1,
        publication_mode: "developer-git",
        profiles: [],
      };
    }
    const message = error instanceof Error ? error.message : "unknown index error";
    throw new Error(`could not read the existing profile index: ${message}`);
  }
}

async function atomicWrite(path: string, source: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporaryPath, source, "utf8");
  await rename(temporaryPath, path);
}

function requiredRoute(
  routing: Record<string, string>,
  key: string,
): string {
  const value = routing[key];
  if (!value) throw new Error(`profile routing is missing "${key}".`);
  return value;
}

function normalizedLabel(value: string): string {
  const label = value.trim();
  if (label.length === 0 || label.length > 80) {
    throw new Error("profile label must contain 1-80 characters.");
  }
  return label;
}

function recordAt(
  value: Record<string, JsonValue>,
  key: string,
): Record<string, JsonValue> {
  const child = value[key];
  return typeof child === "object" && child !== null && !Array.isArray(child)
    ? child
    : {};
}

function stringAt(
  value: Record<string, JsonValue>,
  key: string,
): string | undefined {
  const child = value[key];
  return typeof child === "string" ? child : undefined;
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseArguments(arguments_: string[]): PublishProfileOptions {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const valueArguments = new Set(["--input", "--label"]);
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--confirm-public" || argument === "--dry-run") {
      flags.add(argument);
      continue;
    }
    if (!argument.startsWith("--")) {
      throw new Error(`unexpected argument "${argument}".`);
    }
    if (!valueArguments.has(argument)) {
      throw new Error(`unknown argument "${argument}".`);
    }
    const value = arguments_[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value.`);
    }
    values.set(argument, value);
    index += 1;
  }

  const input = values.get("--input");
  if (!input) {
    throw new Error(
      "usage: npm run profile:publish -- --input <sanitized-envelope.json> [--label <name>] --confirm-public",
    );
  }
  return {
    input,
    label: values.get("--label"),
    confirmPublic: flags.has("--confirm-public"),
    dryRun: flags.has("--dry-run"),
  };
}

async function main(): Promise<void> {
  const result = await publishProfilePackage(parseArguments(process.argv.slice(2)));
  const action = result.wroteFiles ? "Published" : "Validated";
  console.log(
    `${action} ${result.entry.label} as UID ${result.entry.profile_id}.`,
  );
  console.log(`Payload: ${result.profilePath}`);
  console.log(`Index:   ${result.indexPath}`);
  console.log(
    `URL:     https://rlogs-app.github.io/profile-lab/?profile=${result.entry.profile_id}`,
  );
  if (result.wroteFiles) {
    console.log("Run npm test, npm run check, and npm run build before committing.");
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
