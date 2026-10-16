/**
 * Fetch wrapper that works in the browser/PWA, inside Capacitor (CapacitorHttp patches
 * window.fetch natively, so CORS is not an issue) and inside Tauri (uses the HTTP plugin).
 */
type FetchFn = typeof fetch;

let tauriFetch: FetchFn | null = null;

export const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function getFetch(): Promise<FetchFn> {
  if (isTauri()) {
    if (!tauriFetch) {
      const mod = await import('@tauri-apps/plugin-http');
      tauriFetch = mod.fetch as unknown as FetchFn;
    }
    return tauriFetch;
  }
  return fetch.bind(globalThis);
}

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function getJson<T>(url: string, opts: { timeoutMs?: number; headers?: Record<string, string> } = {}): Promise<T> {
  const f = await getFetch();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15000);
  try {
    const res = await f(url, { signal: ctrl.signal, headers: { Accept: 'application/json', ...opts.headers } });
    if (!res.ok) throw new HttpError(`HTTP ${res.status}`, res.status);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Run async jobs with limited parallelism. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
