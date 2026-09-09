export type MessageValues = Readonly<Record<string, string | number>>;
export type MessageCatalog = Readonly<Record<string, string>>;
export type MessageCatalogs = Readonly<Record<string, MessageCatalog>>;

const enUsMessages: MessageCatalog = {
  "parse.timeline.title": "Combat timeline",
  "parse.timeline.aria": "Combat timeline",
  "parse.timeline.metric_group": "Timeline metric",
  "parse.timeline.metric.damage": "DPS",
  "parse.timeline.metric.healing": "HPS",
  "parse.timeline.metric.taken": "TPS",
  "parse.timeline.metric.taken_title": "Damage taken per second",
  "parse.timeline.metric.rdps_title": "Exact server-published rDPS-adjusted damage per run-elapsed second",
  "parse.timeline.window_group": "Trailing average window",
  "parse.timeline.trailing_average": "Trailing average",
  "parse.timeline.window.one": "1s",
  "parse.timeline.window.five": "5s",
  "parse.timeline.window.ten": "10s",
  "parse.timeline.playback_group": "Timeline playback",
  "parse.timeline.play": "Play",
  "parse.timeline.pause": "Pause",
  "parse.timeline.position": "Timeline position",
  "parse.timeline.inspection.title": "Point inspection",
  "parse.timeline.inspection.hint": "Hover the graph or focus it and use the arrow keys.",
  "parse.timeline.inspection.none": "No participants selected.",
  "parse.timeline.inspection.rate_unavailable": "eDPS/aDPS unavailable",
  "parse.timeline.inspection.rdps_unavailable": "cumulative rDPS unavailable",
  "parse.timeline.inspection.edps_adps": "eDPS {edps} · aDPS {adps}",
  "parse.timeline.inspection.rdps": "rDPS {rdps}",
  "parse.timeline.inspection.run_rate": "run {metric} {value}",
  "parse.timeline.inspection.rates": "1s {one} · 5s {five} · 10s {ten} · {cumulative}",
  "parse.timeline.inspector_aria": "Timeline point inspector",
  "parse.timeline.player": "Player {id}",
  "parse.timeline.participants": "Visible participants",
  "parse.timeline.graph_aria": "Sparse one-second combat rates over {duration}; death and loadout markers use run elapsed time",
  "parse.timeline.marker.death": "Death",
  "parse.timeline.marker.loadout": "Loadout change",
  "parse.timeline.marker_at": "{label} at {time}",
};

export const bundledMessageCatalogs: MessageCatalogs = { "en-US": enUsMessages };

export interface MessageResolver {
  readonly locale: string;
  message(key: string, values?: MessageValues): string;
  number(value: number, options?: Intl.NumberFormatOptions): string;
}

export function localeFallbackChain(locale: string): string[] {
  const canonical = canonicalLocale(locale);
  const base = canonical.split("-")[0];
  return [...new Set([canonical, ...(base !== canonical ? [base] : []), "en-US"])];
}

export function createMessageResolver(
  locale = browserLocale(),
  catalogs: MessageCatalogs = bundledMessageCatalogs,
): MessageResolver {
  const canonical = canonicalLocale(locale);
  const chain = localeFallbackChain(canonical);
  const numberFormatters = new Map<string, Intl.NumberFormat>();
  return {
    locale: canonical,
    message(key, values = {}) {
      const template = chain.map((candidate) => catalogs[candidate]?.[key]).find((value) => value !== undefined) ?? key;
      return template.replace(/\{([a-z0-9_]+)\}/giu, (token, name: string) =>
        Object.hasOwn(values, name) ? String(values[name]) : token);
    },
    number(value, options = {}) {
      const cacheKey = JSON.stringify(options);
      let formatter = numberFormatters.get(cacheKey);
      if (!formatter) {
        formatter = new Intl.NumberFormat(canonical, options);
        numberFormatters.set(cacheKey, formatter);
      }
      return formatter.format(value);
    },
  };
}

function browserLocale(): string {
  return typeof navigator !== "undefined" && navigator.languages?.[0] ? navigator.languages[0] : "en-US";
}

function canonicalLocale(locale: string): string {
  try {
    return Intl.getCanonicalLocales(locale)[0] ?? "en-US";
  } catch {
    return "en-US";
  }
}
