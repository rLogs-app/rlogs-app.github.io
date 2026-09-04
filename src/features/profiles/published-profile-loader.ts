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
  loadouts: PublishedProfileLoadoutSummary[];
}

export interface PublishedProfileLoadoutSummary {
  project_id: number;
  project_name?: string;
  profession_id?: number;
  snapshot_available: boolean;
  updated_unix_millis: number;
  source_client_build: string;
  class_id?: number;
  specialization_id?: number;
  module_inventory_count: number;
  equipped_module_count: number;
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

  return {
    entry,
    envelope: result.envelope,
    loadouts: currentEnvelopeLoadout(result.envelope),
  };
}

export async function loadPublishedProfileLoadout(
  profile: PublishedProfile,
  projectId: number,
): Promise<WebsitePayloadEnvelope> {
  if (!Number.isSafeInteger(projectId) || projectId <= 0) {
    throw new Error("The selected loadout ID is invalid.");
  }
  const currentProject = currentProjectId(profile.envelope);
  if (currentProject === projectId) return profile.envelope;
  if (configuredApi && profile.entry.profile_id.startsWith("prf_")) {
    const response = await fetch(
      `${configuredApi}/v1/profiles/${encodeURIComponent(profile.entry.profile_id)}/loadouts/${projectId}`,
    );
    if (!response.ok) {
      throw new Error(`Published loadout request failed with HTTP ${response.status}.`);
    }
    const value: unknown = await response.json();
    if (
      !isRecord(value) ||
      value.schema_version !== 1 ||
      value.profile_id !== profile.entry.profile_id ||
      value.project_id !== projectId
    ) {
      throw new Error("Published loadout response is invalid.");
    }
    const validation = validateWebsitePayload(value.envelope);
    if (!validation.envelope) {
      throw new Error(`Published loadout failed validation: ${validation.errors.join(" ")}`);
    }
    return validation.envelope;
  }
  throw new Error("That saved loadout has not been published yet.");
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
  return { entry, envelope, loadouts: loadoutSummaries(value, envelope) };
}

function loadoutSummaries(
  value: Record<string, unknown>,
  envelope: WebsitePayloadEnvelope,
): PublishedProfileLoadoutSummary[] {
  const summaries = Array.isArray(value.loadouts)
    ? value.loadouts.flatMap((candidate) => {
      if (!isRecord(candidate)) return [];
      const projectId = candidate.project_id;
      const updated = candidate.updated_unix_millis;
      const sourceBuild = candidate.source_client_build;
      const inventoryCount = candidate.module_inventory_count;
      const equippedCount = candidate.equipped_module_count;
      if (
        typeof projectId !== "number" || !Number.isSafeInteger(projectId) || projectId <= 0 ||
        typeof updated !== "number" || !Number.isSafeInteger(updated) || updated <= 0 ||
        typeof sourceBuild !== "string" || sourceBuild.length === 0 ||
        typeof inventoryCount !== "number" || !Number.isSafeInteger(inventoryCount) || inventoryCount < 0 ||
        typeof equippedCount !== "number" || !Number.isSafeInteger(equippedCount) || equippedCount < 0
      ) return [];
      return [{
        project_id: projectId,
        ...(optionalTextField(candidate, "project_name") == null ? {} : { project_name: optionalTextField(candidate, "project_name") }),
        ...(optionalIntegerField(candidate, "profession_id") == null ? {} : { profession_id: optionalIntegerField(candidate, "profession_id") }),
        snapshot_available: typeof candidate.snapshot_available === "boolean" ? candidate.snapshot_available : true,
        updated_unix_millis: updated,
        source_client_build: sourceBuild,
        ...(optionalIntegerField(candidate, "class_id") == null ? {} : { class_id: optionalIntegerField(candidate, "class_id") }),
        ...(optionalIntegerField(candidate, "specialization_id") == null ? {} : { specialization_id: optionalIntegerField(candidate, "specialization_id") }),
        module_inventory_count: inventoryCount,
        equipped_module_count: equippedCount,
      } satisfies PublishedProfileLoadoutSummary];
    })
    : [];
  return summaries.length ? summaries.sort((left, right) => left.project_id - right.project_id) : currentEnvelopeLoadout(envelope);
}

function currentEnvelopeLoadout(envelope: WebsitePayloadEnvelope): PublishedProfileLoadoutSummary[] {
  const projectId = currentProjectId(envelope);
  const modules = isRecord(envelope.body.modules) ? envelope.body.modules : undefined;
  const inventory = Array.isArray(modules?.inventory) ? modules.inventory : [];
  const slots = isRecord(modules?.equipped_slots) ? modules.equipped_slots : {};
  const directory = Array.isArray(envelope.body.profession_projects)
    ? envelope.body.profession_projects.flatMap((candidate) => {
      if (!isRecord(candidate)) return [];
      const candidateId = optionalIntegerField(candidate, "project_id");
      if (candidateId == null || candidateId <= 0) return [];
      const isCurrent = candidateId === projectId;
      return [{
        project_id: candidateId,
        ...(optionalTextField(candidate, "project_name") == null ? {} : { project_name: optionalTextField(candidate, "project_name") }),
        ...(optionalIntegerField(candidate, "profession_id") == null ? {} : { profession_id: optionalIntegerField(candidate, "profession_id") }),
        snapshot_available: isCurrent,
        updated_unix_millis: Date.now(),
        source_client_build: "published-snapshot",
        ...(isCurrent && optionalIntegerField(envelope.body, "class_id") != null ? { class_id: optionalIntegerField(envelope.body, "class_id") } : {}),
        ...(isCurrent && optionalIntegerField(envelope.body, "specialization_id") != null ? { specialization_id: optionalIntegerField(envelope.body, "specialization_id") } : {}),
        module_inventory_count: isCurrent ? inventory.length : 0,
        equipped_module_count: isCurrent ? Object.keys(slots).length : 0,
      } satisfies PublishedProfileLoadoutSummary];
    })
    : [];
  if (directory.length) return directory.sort((left, right) => left.project_id - right.project_id);
  if (projectId == null) return [];
  return [{
    project_id: projectId,
    snapshot_available: true,
    updated_unix_millis: Date.now(),
    source_client_build: "published-snapshot",
    ...(optionalIntegerField(envelope.body, "class_id") == null ? {} : { class_id: optionalIntegerField(envelope.body, "class_id") }),
    ...(optionalIntegerField(envelope.body, "specialization_id") == null ? {} : { specialization_id: optionalIntegerField(envelope.body, "specialization_id") }),
    module_inventory_count: inventory.length,
    equipped_module_count: Object.keys(slots).length,
  }];
}

function currentProjectId(envelope: WebsitePayloadEnvelope): number | undefined {
  const value = envelope.body.current_profession_project_id;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
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

function optionalIntegerField(
  value: Record<string, unknown>,
  key: string,
): number | undefined {
  const field = value[key];
  return typeof field === "number" && Number.isSafeInteger(field) ? field : undefined;
}

function positiveIntegerField(value: Record<string, unknown>, key: string): number {
  const field = value[key];
  if (typeof field !== "number" || !Number.isSafeInteger(field) || field <= 0) {
    throw new Error(`Submitted profile ${key} is invalid.`);
  }
  return field;
}
