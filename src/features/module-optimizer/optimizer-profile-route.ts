export function optimizerProfileHref(profileId: string): string {
  const search = new URLSearchParams({ profile: profileId });
  return `/optimizer/?${search.toString()}`;
}

export function requestedOptimizerProfile(search: string): string | undefined {
  const profileId = new URLSearchParams(search).get("profile")?.trim();
  return profileId || undefined;
}
