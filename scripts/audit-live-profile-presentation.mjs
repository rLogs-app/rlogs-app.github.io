import { readFile, stat } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = resolve(root, "public");
const apiBase = String(process.env.RLOGS_API_BASE_URL || "https://rlogs-submissions.pages.dev").replace(/\/$/u, "");
const siteBase = String(process.env.RLOGS_SITE_BASE_URL || "https://rlogs-app.github.io").replace(/\/$/u, "");
const catalog = JSON.parse(await readFile(resolve(publicRoot, "data/bpsr/profile-presentation.en-US.v1.json"), "utf8"));

const failures = [];
const warnings = [];
const iconPaths = new Set();
const coveredClasses = new Set();
const coveredSpecializations = new Set();
let equipmentCount = 0;
let skillCount = 0;

const profileCatalog = await getJson(`${apiBase}/v1/profiles`);
if (profileCatalog?.schema_version !== 1 || !Array.isArray(profileCatalog.profiles)) {
  throw new Error("The production profile catalog has an unsupported contract.");
}

for (const entry of profileCatalog.profiles) {
  const profileId = string(entry?.profile_id);
  if (!profileId) {
    failures.push("profile catalog entry has no profile_id");
    continue;
  }
  const profile = await getJson(`${apiBase}/v1/profiles/${encodeURIComponent(profileId)}`);
  const body = record(profile?.envelope)?.body;
  if (!record(body)) {
    failures.push(`${profileId}: character-profile envelope body is missing`);
    continue;
  }
  const uid = string(profile.character_id) || profileId;
  const sourceBuild = string(profile.source_client_build);
  if (!sourceBuild || sourceBuild === "unverified") {
    warnings.push(`${uid}: source client build is unverified`);
  } else if (String(catalog.game_build ?? "") !== sourceBuild) {
    warnings.push(`${uid}: source build ${sourceBuild} differs from presentation build ${catalog.game_build}`);
  }
  if (integer(body.class_id) !== null) coveredClasses.add(body.class_id);
  if (integer(body.specialization_id) !== null) coveredSpecializations.add(body.specialization_id);

  for (const equipment of array(body.equipment)) {
    const itemId = integer(record(equipment)?.item_id);
    if (itemId === null) {
      failures.push(`${uid}: observed equipment has no numeric item_id`);
      continue;
    }
    equipmentCount += 1;
    checkPresentation(uid, "equipment", itemId, catalog.items);
  }

  for (const skill of array(body.active_skills)) {
    const row = record(skill);
    const skillId = integer(row?.skill_id) ?? integer(row?.base_skill_id);
    if (skillId === null) {
      failures.push(`${uid}: observed active skill has no numeric skill identity`);
      continue;
    }
    skillCount += 1;
    checkPresentation(uid, "skill", skillId, catalog.skills);
  }
}

await parallel([...iconPaths], 8, async (iconPath) => {
  const relative = iconPath.replace(/^\/+/, "");
  const localPath = resolve(publicRoot, relative);
  if (localPath !== publicRoot && !localPath.startsWith(`${publicRoot}${sep}`)) {
    failures.push(`asset path escapes public root: ${iconPath}`);
    return;
  }
  try {
    const metadata = await stat(localPath);
    if (!metadata.isFile() || metadata.size === 0) failures.push(`empty local asset: ${iconPath}`);
  } catch {
    failures.push(`missing local asset: ${iconPath}`);
    return;
  }
  const response = await fetchWithRetry(`${siteBase}/${relative}`, { method: "HEAD" });
  if (!response.ok) failures.push(`published asset returned HTTP ${response.status}: ${iconPath}`);
});

if (failures.length) {
  throw new Error(`Live profile presentation audit failed:\n- ${failures.join("\n- ")}`);
}

console.log(JSON.stringify({
  schema_version: 1,
  profiles: profileCatalog.profiles.length,
  equipment_records: equipmentCount,
  skill_records: skillCount,
  unique_assets: iconPaths.size,
  covered_classes: [...coveredClasses].sort((a, b) => a - b),
  covered_specializations: [...coveredSpecializations].sort((a, b) => a - b),
  warnings,
  result: "passed",
}));

function checkPresentation(uid, kind, id, collection) {
  const presentation = record(collection)?.[String(id)];
  if (!record(presentation)) {
    failures.push(`${uid}: ${kind} ${id} is absent from the current presentation catalog`);
    return;
  }
  const name = string(presentation.name);
  const icon = string(presentation.icon);
  if (!name) failures.push(`${uid}: ${kind} ${id} has no localized name`);
  if (!icon) failures.push(`${uid}: ${kind} ${id} has no icon`);
  else iconPaths.add(icon);
}

async function getJson(url) {
  const response = await fetchWithRetry(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`);
  return response.json();
}

async function fetchWithRetry(url, init) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (response.ok || response.status < 500) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((accept) => setTimeout(accept, 250 * 2 ** attempt));
  }
  throw lastError instanceof Error ? lastError : new Error(`Could not fetch ${url}.`);
}

async function parallel(values, width, task) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(width, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      await task(values[index]);
    }
  }));
}

function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function string(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function integer(value) {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}
