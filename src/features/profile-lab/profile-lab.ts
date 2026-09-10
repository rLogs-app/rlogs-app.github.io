import {
  type LocalProfilePackage,
  validateLocalProfilePackage,
} from "../../contracts/local-profile-package";
import {
  type WebsitePayloadEnvelope,
  validateWebsitePayload,
} from "../../contracts/website-payload";
import { renderSyncedCharacterProfile } from "../account/profile-view";
import {
  loadPublishedProfile,
  type PublishedProfile,
} from "../profiles/published-profile-loader";
import { loadProfileCatalog } from "../profiles/profile-browser";
import { siteDeveloperModeActive } from "../../site-developer-mode";

const emptyDigest = "0".repeat(64);

const demoEnvelope: WebsitePayloadEnvelope = {
  schema_version: 1,
  game_plugin_id: "app.rlogs.game.blue-protocol-star-resonance",
  payload_kind: "character-profile",
  payload_schema_id: "app.rlogs.bpsr.character-profile",
  payload_schema_version: 1,
  routing: {
    "character-id": "1000001",
    deployment: "global",
    region: "north-america",
    realm: "profile-lab",
  },
  body: {
    display_name: "Profile Lab Demo",
    level: 60,
    combat_power: 246879,
    class_id: 12,
    specialization_id: 122,
    current_profession_project_id: 1,
    character: {
      character_id: "1000001",
      region: {
        deployment_id: "global",
        region_id: "north-america",
        realm_id: "profile-lab",
      },
    },
    equipment: [],
    modules: { inventory: [], equipped_slots: {} },
    active_skills: [],
    talents: [],
    owned_imagines: [],
    collection_summary: {},
  },
};

export interface ProfileLabValidation {
  errors: string[];
  profile?: PublishedProfile;
  sourceKind?: "local-package" | "website-payload";
}

export async function mountProfileLab(): Promise<void> {
  const status = requiredElement("profile-lab-status");
  if (!siteDeveloperModeActive()) {
    status.className = "status-chip invalid";
    status.textContent = "Developer access required";
    return;
  }

  const editor = requiredElement<HTMLTextAreaElement>("profile-lab-json");
  const fileInput = requiredElement<HTMLInputElement>("profile-lab-file");
  const publishedReference = requiredElement<HTMLInputElement>("profile-lab-reference");

  requiredElement("profile-lab-validate").addEventListener("click", () => {
    void validateAndRender(editor.value);
  });
  requiredElement("profile-lab-reset").addEventListener("click", () => {
    void resetDemo();
  });
  requiredElement("profile-lab-load-published").addEventListener("click", () => {
    void loadPublishedReference(publishedReference.value);
  });
  publishedReference.addEventListener("keydown", (event) => {
    if (event.key === "Enter") void loadPublishedReference(publishedReference.value);
  });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    void file.text().then(async (source) => {
      editor.value = source;
      await validateAndRender(source);
    });
  });

  const requestedReference = new URLSearchParams(location.search).get("profile")?.trim();
  if (requestedReference) {
    publishedReference.value = requestedReference;
    await loadPublishedReference(requestedReference);
  } else {
    await resetDemo();
  }
}

export async function validateProfileLabSource(
  source: string,
): Promise<ProfileLabValidation> {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    return {
      errors: [
        `Invalid JSON: ${error instanceof Error ? error.message : "could not parse the document"}.`,
      ],
    };
  }

  if (isLocalPackageCandidate(value)) {
    const validation = await validateLocalProfilePackage(value);
    if (!validation.package) return { errors: validation.errors };
    return {
      errors: [],
      profile: previewProfile(validation.package.request.payload, validation.package),
      sourceKind: "local-package",
    };
  }

  const validation = validateWebsitePayload(value);
  if (!validation.envelope) return { errors: validation.errors };
  if (validation.envelope.payload_kind !== "character-profile") {
    return { errors: ['payload_kind must be "character-profile" for the Profile Lab.'] };
  }
  return {
    errors: [],
    profile: previewProfile(validation.envelope),
    sourceKind: "website-payload",
  };
}

function previewProfile(
  envelope: WebsitePayloadEnvelope,
  localPackage?: LocalProfilePackage,
): PublishedProfile {
  const displayName = textValue(envelope.body.display_name) ?? "Unnamed character";
  const characterId = envelope.routing["character-id"] ?? "not-observed";
  const encodedBytes = new TextEncoder().encode(JSON.stringify(envelope)).byteLength;
  return {
    envelope,
    loadouts: [],
    entry: {
      profile_id: `profile-lab-${characterId}`,
      label: displayName,
      game_plugin_id: envelope.game_plugin_id,
      payload_schema_id: envelope.payload_schema_id,
      payload_schema_version: envelope.payload_schema_version,
      deployment: envelope.routing.deployment ?? "unresolved",
      region: envelope.routing.region ?? "unresolved",
      ...(envelope.routing.realm ? { realm: envelope.routing.realm } : {}),
      ...(envelope.routing.world ? { world: envelope.routing.world } : {}),
      character_id: characterId,
      payload_path: "profile-lab/profile.v1.json",
      payload_sha256: emptyDigest,
      payload_bytes: encodedBytes,
      ...(localPackage
        ? {
            source_package_id: localPackage.package_id,
            source_created_unix_millis: localPackage.created_unix_millis,
            source_updated_unix_millis: localPackage.created_unix_millis,
            source_observation_count: localPackage.source.observation_count,
            source_client_build: localPackage.source.client_build,
          }
        : {}),
    },
  };
}

async function resetDemo(): Promise<void> {
  const source = JSON.stringify(demoEnvelope, null, 2);
  requiredElement<HTMLTextAreaElement>("profile-lab-json").value = source;
  await validateAndRender(source);
}

async function validateAndRender(source: string): Promise<void> {
  setStatus("neutral", "Validating locally…");
  const validation = await validateProfileLabSource(source);
  showErrors(validation.errors);
  if (!validation.profile) {
    clearPreview("Fix the validation errors to render this profile.");
    setStatus(
      "invalid",
      `${validation.errors.length} validation issue${validation.errors.length === 1 ? "" : "s"}`,
    );
    return;
  }
  try {
    await renderProfile(validation.profile);
  } catch (error) {
    showErrors([error instanceof Error ? error.message : String(error)]);
    setStatus("invalid", "Profile rendering failed");
    return;
  }
  setStatus(
    "valid",
    validation.sourceKind === "local-package"
      ? "Verified local profile package"
      : "Valid WebsitePayload envelope",
  );
}

async function loadPublishedReference(referenceSource: string): Promise<void> {
  const reference = referenceSource.trim();
  if (!reference) {
    showErrors(["Enter a published profile ID or character UID."]);
    clearPreview("Enter a published profile reference to load it.");
    setStatus("invalid", "Reference required");
    return;
  }
  setStatus("neutral", "Loading published profile…");
  showErrors([]);
  try {
    const profile = await loadPublishedProfile(await resolvePublishedProfileId(reference));
    requiredElement<HTMLTextAreaElement>("profile-lab-json").value = JSON.stringify(
      profile.envelope,
      null,
      2,
    );
    await renderProfile(profile);
    setStatus(
      "valid",
      profile.entry.source_package_id
        ? "Published from verified package"
        : "Validated published envelope",
    );
    const url = new URL(location.href);
    url.searchParams.set("profile", reference);
    history.replaceState(null, "", `${url.pathname}${url.search}`);
  } catch (error) {
    showErrors([error instanceof Error ? error.message : String(error)]);
    clearPreview("That published profile could not be loaded.");
    setStatus("invalid", "Published profile failed");
  }
}

async function resolvePublishedProfileId(reference: string): Promise<string> {
  if (reference.startsWith("prf_")) return reference;
  const catalog = await loadProfileCatalog();
  const entry = catalog.profiles.find(
    (candidate) =>
      candidate.profile_id === reference || candidate.character_id === reference,
  );
  if (!entry) throw new Error(`Published profile "${reference}" was not found.`);
  return entry.profile_id;
}

async function renderProfile(profile: PublishedProfile): Promise<void> {
  const preview = requiredElement("profile-lab-preview");
  preview.replaceChildren(message("Rendering the current profile presentation…"));
  try {
    preview.replaceChildren(
      await renderSyncedCharacterProfile(profile, { publishedActions: false }),
    );
  } catch (error) {
    clearPreview(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

function isLocalPackageCandidate(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    ("package_id" in value || "request" in value)
  );
}

function showErrors(errors: string[]): void {
  const list = requiredElement("profile-lab-errors");
  list.replaceChildren(...errors.map((error) => element("li", "", error)));
  list.hidden = errors.length === 0;
}

function clearPreview(copy: string): void {
  requiredElement("profile-lab-preview").replaceChildren(message(copy));
}

function setStatus(state: "neutral" | "valid" | "invalid", copy: string): void {
  const status = requiredElement("profile-lab-status");
  status.className = `status-chip ${state}`;
  status.textContent = copy;
}

function requiredElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing Profile Lab element #${id}.`);
  return value as T;
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function message(copy: string): HTMLParagraphElement {
  return element("p", "empty-state", copy);
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  copy: string,
): HTMLElementTagNameMap[K] {
  const value = document.createElement(tag);
  value.className = className;
  value.textContent = copy;
  return value;
}
