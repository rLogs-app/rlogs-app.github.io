export interface PublishedProfileEntry {
  profile_id: string;
  label: string;
  game_plugin_id: string;
  payload_schema_id: string;
  payload_schema_version: number;
  deployment: string;
  region: string;
  realm?: string;
  world?: string;
  character_id: string;
  payload_path: string;
  payload_sha256: string;
  payload_bytes: number;
  source_package_id?: string;
  source_created_unix_millis?: number;
  source_updated_unix_millis?: number;
  source_observation_count?: number;
  source_client_build?: string;
}

export interface PublishedProfileIndex {
  schema_version: 1;
  publication_mode: "developer-git";
  profiles: PublishedProfileEntry[];
}

export interface PublishedProfileIndexValidation {
  index?: PublishedProfileIndex;
  errors: string[];
}

const PROFILE_INDEX_SCHEMA_VERSION = 1;
const MAX_PROFILE_PAYLOAD_BYTES = 8 * 1024 * 1024;
const profileIdPattern = /^[A-Za-z0-9_-]{1,128}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const payloadPathPattern =
  /^[A-Za-z0-9_-]{1,128}\/profile\.v[1-9][0-9]*\.json$/;

export function validatePublishedProfileId(
  profileId: string,
): string | undefined {
  return profileIdPattern.test(profileId)
    ? undefined
    : "profile ID must contain 1-128 URL-safe letters, numbers, underscores, or hyphens";
}

export function validatePublishedProfileIndex(
  value: unknown,
): PublishedProfileIndexValidation {
  if (!isRecord(value)) {
    return { errors: ["The published profile index must be a JSON object."] };
  }

  const errors: string[] = [];
  if (value.schema_version !== PROFILE_INDEX_SCHEMA_VERSION) {
    errors.push(`schema_version must be ${PROFILE_INDEX_SCHEMA_VERSION}.`);
  }
  if (value.publication_mode !== "developer-git") {
    errors.push('publication_mode must be "developer-git".');
  }
  if (!Array.isArray(value.profiles)) {
    errors.push("profiles must be an array.");
    return { errors };
  }

  const profileIds = new Set<string>();
  const paths = new Set<string>();
  value.profiles.forEach((candidate, index) => {
    const path = `profiles[${index}]`;
    if (!isRecord(candidate)) {
      errors.push(`${path} must be an object.`);
      return;
    }

    const profileId =
      typeof candidate.profile_id === "string" ? candidate.profile_id : "";
    const profileIdError = validatePublishedProfileId(profileId);
    if (profileIdError) errors.push(`${path}.profile_id ${profileIdError}.`);
    if (profileIds.has(profileId)) {
      errors.push(`${path}.profile_id duplicates "${profileId}".`);
    }
    profileIds.add(profileId);

    validateText(errors, candidate.label, `${path}.label`, 1, 80);
    validateText(errors, candidate.game_plugin_id, `${path}.game_plugin_id`, 3, 192);
    validateText(
      errors,
      candidate.payload_schema_id,
      `${path}.payload_schema_id`,
      3,
      192,
    );
    if (
      !Number.isInteger(candidate.payload_schema_version) ||
      Number(candidate.payload_schema_version) <= 0
    ) {
      errors.push(`${path}.payload_schema_version must be a positive integer.`);
    }
    validateText(errors, candidate.deployment, `${path}.deployment`, 1, 96);
    validateText(errors, candidate.region, `${path}.region`, 1, 96);
    validateOptionalText(errors, candidate.realm, `${path}.realm`, 1, 96);
    validateOptionalText(errors, candidate.world, `${path}.world`, 1, 96);
    validateText(errors, candidate.character_id, `${path}.character_id`, 1, 256);

    const payloadPath =
      typeof candidate.payload_path === "string"
        ? candidate.payload_path
        : "";
    if (
      !payloadPathPattern.test(payloadPath) ||
      !payloadPath.startsWith(`${profileId}/`)
    ) {
      errors.push(
        `${path}.payload_path must be a versioned JSON file inside the profile ID folder.`,
      );
    }
    if (paths.has(payloadPath)) {
      errors.push(`${path}.payload_path duplicates "${payloadPath}".`);
    }
    paths.add(payloadPath);

    if (
      typeof candidate.payload_sha256 !== "string" ||
      !digestPattern.test(candidate.payload_sha256)
    ) {
      errors.push(`${path}.payload_sha256 must be a lowercase SHA-256 digest.`);
    }
    if (
      !Number.isInteger(candidate.payload_bytes) ||
      Number(candidate.payload_bytes) <= 0 ||
      Number(candidate.payload_bytes) > MAX_PROFILE_PAYLOAD_BYTES
    ) {
      errors.push(
        `${path}.payload_bytes must be between 1 and ${MAX_PROFILE_PAYLOAD_BYTES}.`,
      );
    }

    const sourceFields = [
      candidate.source_package_id,
      candidate.source_created_unix_millis,
      candidate.source_observation_count,
      candidate.source_client_build,
    ];
    const sourceFieldCount = sourceFields.filter(
      (value) => value !== undefined,
    ).length;
    if (sourceFieldCount !== 0 && sourceFieldCount !== sourceFields.length) {
      errors.push(
        `${path} local-package provenance fields must either all be present or all be absent.`,
      );
    } else if (sourceFieldCount === sourceFields.length) {
      if (
        typeof candidate.source_package_id !== "string" ||
        !digestPattern.test(candidate.source_package_id)
      ) {
        errors.push(`${path}.source_package_id must be a lowercase SHA-256 digest.`);
      }
      validatePositiveSafeInteger(
        errors,
        candidate.source_created_unix_millis,
        `${path}.source_created_unix_millis`,
      );
      validatePositiveSafeInteger(
        errors,
        candidate.source_observation_count,
        `${path}.source_observation_count`,
      );
      validateText(
        errors,
        candidate.source_client_build,
        `${path}.source_client_build`,
        1,
        256,
      );
    }
  });

  if (errors.length > 0) return { errors };
  return {
    index: value as unknown as PublishedProfileIndex,
    errors,
  };
}

function validateOptionalText(
  errors: string[],
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): void {
  if (value !== undefined) {
    validateText(errors, value, path, minimum, maximum);
  }
}

function validatePositiveSafeInteger(
  errors: string[],
  value: unknown,
  path: string,
): void {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    errors.push(`${path} must be a positive safe integer.`);
  }
}

function validateText(
  errors: string[],
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): void {
  if (
    typeof value !== "string" ||
    value.trim().length < minimum ||
    value.length > maximum
  ) {
    errors.push(`${path} must contain ${minimum}-${maximum} characters.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
