const transientStatuses = new Set([408, 425, 429, 500, 502, 503, 504, 530]);

export interface PublicReadDependencies {
  request?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  delays?: readonly number[];
}

export async function fetchPublicRead(
  input: string | URL,
  init: RequestInit = {},
  dependencies: PublicReadDependencies = {},
): Promise<Response> {
  const method = String(init.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    throw new Error(`Public read retry does not support ${method} requests.`);
  }
  const request = dependencies.request ?? fetch;
  const sleep = dependencies.sleep ?? ((milliseconds) =>
    new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds)));
  const delays = dependencies.delays ?? [0, 500, 1_500, 4_000];
  let lastFailure: unknown;

  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (attempt > 0) await sleep(delays[attempt]);
    if (init.signal?.aborted) throw init.signal.reason;
    try {
      const response = await request(input, init);
      if (!transientStatuses.has(response.status) || attempt === delays.length - 1) return response;
      lastFailure = new Error(`Public API returned HTTP ${response.status}.`);
      await response.body?.cancel().catch(() => undefined);
    } catch (error) {
      if (init.signal?.aborted) throw error;
      lastFailure = error;
      if (attempt === delays.length - 1) throw error;
    }
  }
  throw lastFailure;
}
