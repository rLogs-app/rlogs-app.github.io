import {
  type PublishedProfileEntry,
  type PublishedProfileIndex,
  validatePublishedProfileIndex,
  validatePublishedProfileId,
} from "../../contracts/published-profiles";
import {
  type WebsitePayloadEnvelope,
  validateWebsitePayload,
} from "../../contracts/website-payload";

const publishedProfilesUrl = `${import.meta.env.BASE_URL}profiles/`;
const configuredApi = String(import.meta.env.VITE_RLOGS_API_BASE_URL ?? "").replace(/\/$/u, "");
let indexRequest: Promise<PublishedProfileIndex> | undefined;

export interface PublishedProfile {
  entry: PublishedProfileEntry;
  envelope: WebsitePayloadEnvelope;
}

export function loadPublishedProfileIndex(): Promise<PublishedProfileIndex> {
  indexRequest ??= fetchProfileIndex();
  return indexRequest;
}

export async function loadPublishedProfile(
  profileId: string,
): Promise<PublishedProfile> {
  const profileIdError = validatePublishedProfileId(profileId);
  if (profileIdError) {
    throw new Error(`Invalid published profile ID: ${profileIdError}.`);
  }

  if (configuredApi && profileId.startsWith("prf_")) {
    return loadSubmittedProfile(profileId);
  }

  const index = await loadPublishedProfileIndex();
  const entry = index.profiles.find(
    (candidate) => candidate.profile_id === profileId,
  );
  if (!entry) throw new Error(`Published profile "${profileId}" was not found.`);

  const response = await fetch(`${publishedProfilesUrl}${entry.payload_path}`);
  if (!response.ok) {
    throw new Error(`Published profile request failed with HTTP ${response.status}.`);
  }
  const source = await response.text();
  const encoded = new TextEncoder().encode(source);
  if (encoded.byteLength !== entry.payload_bytes) {
    throw new Error(
      `Published profile size mismatch: expected ${entry.payload_bytes}, received ${encoded.byteLength}.`,
    );
  }

  const digest = await sha256(encoded);
  if (digest !== entry.payload_sha256) {
    throw new Error("Published profile digest does not match its package index.");
  }

  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("Published profile contains invalid JSON.");
  }
  const result = validateWebsitePayload(value);
  if (!result.envelope) {
    throw new Error(`Published profile failed validation: ${result.errors.join(" ")}`);
  }
  verifyManifestMatchesEnvelope(entry, result.envelope);

  return { entry, envelope: result.envelope };
}

async function loadSubmittedProfile(profileId: string): Promise<PublishedProfile> {
  const response = await fetch(
    `${configuredApi}/v1/profiles/${encodeURIComponent(profileId)}`,
  );
  if (!response.ok) {
    throw new Error(`Submitted profile request failed with HTTP ${response.status}.`);
  }
  const value: unknown = await response.json();
  if (!isRecord(value) || value.schema_version !== 1 || value.profile_id !== profileId) {
    throw new Error("Submitted profile response is invalid.");
  }
  const validation = validateWebsitePayload(value.envelope);
  if (!validation.envelope) {
    throw new Error(
      `Submitted profile failed validation: ${validation.errors.join(" ")}`,
    );
  }
  const envelope = validation.envelope;
  const packageId = textField(value, "package_id");
  const created = positiveIntegerField(value, "created_unix_millis");
  const updated = positiveIntegerField(value, "updated_unix_millis");
  const observations = positiveIntegerField(value, "source_observation_count");
  const clientBuild = textField(value, "source_client_build");
  const characterId = textField(value, "character_id");
  const encoded = new TextEncoder().encode(JSON.stringify(envelope));
  const entry: PublishedProfileEntry = {
    profile_id: profileId,
    label: optionalTextField(value, "display_name") ?? `UID ${characterId}`,
    game_plugin_id: envelope.game_plugin_id,
    payload_schema_id: envelope.payload_schema_id,
    payload_schema_version: envelope.payload_schema_version,
    deployment: textField(value, "deployment"),
    region: textField(value, "region"),
    ...(optionalTextField(value, "realm") ? { realm: optionalTextField(value, "realm") } : {}),
    ...(optionalTextField(value, "world") ? { world: optionalTextField(value, "world") } : {}),
    character_id: characterId,
    payload_path: `${profileId}/profile.v1.json`,
    payload_sha256: await sha256(encoded),
    payload_bytes: encoded.byteLength,
    source_package_id: packageId,
    source_created_unix_millis: created,
    source_updated_unix_millis: updated,
    source_observation_count: observations,
    source_client_build: clientBuild,
  };
  verifyManifestMatchesEnvelope(entry, envelope);
  return { entry, envelope };
}

async function fetchProfileIndex(): Promise<PublishedProfileIndex> {
  const response = await fetch(`${publishedProfilesUrl}index.v1.json`);
  if (!response.ok) {
    throw new Error(`Published profile index failed with HTTP ${response.status}.`);
  }
  const result = validatePublishedProfileIndex(await response.json());
  if (!result.index) {
    throw new Error(`Published profile index is invalid: ${result.errors.join(" ")}`);
  }
  return result.index;
}

function verifyManifestMatchesEnvelope(
  entry: PublishedProfileEntry,
  envelope: WebsitePayloadEnvelope,
): void {
  const pairs: Array<
    [string, string | number | undefined, string | number | undefined]
  > = [
    ["game plug-in", envelope.game_plugin_id, entry.game_plugin_id],
    ["payload schema", envelope.payload_schema_id, entry.payload_schema_id],
    [
      "payload schema version",
      envelope.payload_schema_version,
      entry.payload_schema_version,
    ],
    ["deployment", envelope.routing.deployment, entry.deployment],
    ["region", envelope.routing.region, entry.region],
    ["realm", envelope.routing.realm, entry.realm],
    ["world", envelope.routing.world, entry.world],
    ["character ID", envelope.routing["character-id"], entry.character_id],
  ];
  const mismatch = pairs.find(([, actual, expected]) => actual !== expected);
  if (mismatch) {
    throw new Error(
      `Published profile ${mismatch[0]} does not match its package index.`,
    );
  }
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digestInput = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  digestInput.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", digestInput);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textField(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) {
    throw new Error(`Submitted profile ${key} is invalid.`);
  }
  return field;
}

function optionalTextField(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const field = value[key];
  if (field === null || field === undefined) return undefined;
  if (typeof field !== "string" || field.length === 0) {
    throw new Error(`Submitted profile ${key} is invalid.`);
  }
  return field;
}

function positiveIntegerField(value: Record<string, unknown>, key: string): number {
  const field = value[key];
  if (typeof field !== "number" || !Number.isSafeInteger(field) || field <= 0) {
    throw new Error(`Submitted profile ${key} is invalid.`);
  }
  return field;
}
