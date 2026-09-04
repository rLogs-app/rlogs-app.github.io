export function optimizerProfileHref(profileId: string, projectId?: number): string {
  const search = new URLSearchParams({ profile: profileId });
  if (projectId != null) search.set("loadout", String(projectId));
  return `/optimizer/?${search.toString()}`;
}

export function requestedOptimizerProfile(search: string): string | undefined {
  const profileId = new URLSearchParams(search).get("profile")?.trim();
  return profileId || undefined;
}

export function requestedOptimizerLoadout(search: string): number | undefined {
  const value = new URLSearchParams(search).get("loadout")?.trim();
  if (!value || !/^\d+$/u.test(value)) return undefined;
  const projectId = Number(value);
  return Number.isSafeInteger(projectId) && projectId > 0 ? projectId : undefined;
}
