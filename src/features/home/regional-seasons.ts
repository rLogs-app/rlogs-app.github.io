export const regionalSeasonSource = "https://bpevents.poofcakes.com/regions";

export interface RegionalSeasonContext {
  cohort: string;
  regionLabel: string;
  seasonId: number | null;
  seasonLabel: string;
}

interface SeasonBoundary {
  seasonId: number;
  startsAt: string;
}

const timelines: Record<string, SeasonBoundary[]> = {
  china: [
    { seasonId: 3, startsAt: "2026-03-18T21:00:00Z" },
    { seasonId: 4, startsAt: "2026-07-15T21:00:00Z" },
    { seasonId: 5, startsAt: "2026-12-10T21:00:00Z" },
  ],
  global: [
    { seasonId: 3, startsAt: "2026-05-28T07:00:00Z" },
    { seasonId: 4, startsAt: "2026-10-08T07:00:00Z" },
  ],
  taiwan: [
    { seasonId: 3, startsAt: "2026-06-17T21:00:00Z" },
    { seasonId: 4, startsAt: "2026-11-05T21:00:00Z" },
  ],
  japan: [
    { seasonId: 3, startsAt: "2026-07-15T20:00:00Z" },
    { seasonId: 4, startsAt: "2026-12-03T20:00:00Z" },
  ],
  korea: [
    { seasonId: 3, startsAt: "2026-07-15T20:00:00Z" },
    { seasonId: 4, startsAt: "2026-12-03T20:00:00Z" },
  ],
  sea: [
    { seasonId: 3, startsAt: "2026-07-15T22:00:00Z" },
    { seasonId: 4, startsAt: "2026-12-03T22:00:00Z" },
  ],
};

const labels: Record<string, string> = {
  china: "China",
  global: "Global (NA / EU)",
  taiwan: "Taiwan",
  japan: "Japan",
  korea: "Korea",
  sea: "SEA",
};

export function regionalSeason(
  deployment: string,
  region: string,
  unixMillis: number,
): RegionalSeasonContext {
  const cohort = seasonCohort(deployment, region);
  const timeline = timelines[cohort] ?? [];
  const timestamp = Number.isSafeInteger(unixMillis) ? unixMillis : 0;
  const active = [...timeline]
    .reverse()
    .find((boundary) => timestamp >= Date.parse(boundary.startsAt));
  return {
    cohort,
    regionLabel: labels[cohort] ?? humanize(cohort),
    seasonId: active?.seasonId ?? null,
    seasonLabel: active ? `Season ${active.seasonId}` : "Season unknown",
  };
}

function seasonCohort(deployment: string, region: string): string {
  const normalizedRegion = region.toLowerCase().replaceAll("_", "-");
  const normalizedDeployment = deployment.toLowerCase().replaceAll("_", "-");
  if (/^(?:cn|china)$/u.test(normalizedRegion)) return "china";
  if (/^(?:tw|taiwan)$/u.test(normalizedRegion)) return "taiwan";
  if (/^(?:jp|japan)$/u.test(normalizedRegion)) return "japan";
  if (/^(?:kr|korea)$/u.test(normalizedRegion)) return "korea";
  if (/^(?:sea|southeast-asia)$/u.test(normalizedRegion)) return "sea";
  if (/^(?:global|north-america|europe|na|eu)$/u.test(normalizedRegion)) return "global";
  if (/^starsea(?:-steam)?$/u.test(normalizedDeployment)) return "sea";
  if (/^(?:global|bpsr(?:-steam|-epic)?)$/u.test(normalizedDeployment)) return "global";
  if (normalizedDeployment === "star") return "china";
  return region || deployment || "unknown";
}

function humanize(value: string): string {
  return value
    .split(/[-_\s]+/u)
    .filter(Boolean)
    .map((part) => `${part[0]?.toLocaleUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}
