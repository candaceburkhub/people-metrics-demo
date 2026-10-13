// Shared HTTP plumbing for every source: retries with backoff that honours
// Retry-After, pagination, and per-source call accounting. This is the part of an
// integration that decides whether it survives a bad Tuesday.

export class ApiError extends Error {
  constructor(
    public status: number,
    public url: string,
    public body: string,
  ) {
    super(`HTTP ${status} from ${url}: ${body.slice(0, 160)}`);
  }
}

export interface Stats {
  calls: number;
  retries: number;
  records: number;
  warnings: string[];
  errors: string[];
}

export const newStats = (): Stats => ({ calls: 0, retries: 0, records: 0, warnings: [], errors: [] });

export interface HttpConfig {
  name: string;
  baseUrl: string;
  headers: Record<string, string>;
  fetchImpl: typeof fetch;
  maxRetries: number;
  backoffMs: number;
  stats: Stats;
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function request<T>(cfg: HttpConfig, pathOrUrl: string, init: RequestInit = {}): Promise<T> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${cfg.baseUrl}${pathOrUrl}`;
  for (let attempt = 0; ; attempt++) {
    cfg.stats.calls++;
    try {
      const res = await cfg.fetchImpl(url, { ...init, headers: { ...cfg.headers, ...(init.headers as Record<string, string>) } });
      if (res.ok) return (await res.json()) as T;
      const body = await res.text();
      if (RETRYABLE.has(res.status) && attempt < cfg.maxRetries) {
        cfg.stats.retries++;
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : cfg.backoffMs * 2 ** attempt;
        await sleep(wait);
        continue;
      }
      throw new ApiError(res.status, url, body);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // network-level failure: retry the same way
      if (attempt < cfg.maxRetries) {
        cfg.stats.retries++;
        await sleep(cfg.backoffMs * 2 ** attempt);
        continue;
      }
      throw err;
    }
  }
}

/** next_link style (Rippling and the ops sources). Accepts full URLs or paths. */
export async function paginateLinks<T>(cfg: HttpConfig, path: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = `${path}${path.includes("?") ? "&" : "?"}limit=100`;
  let guard = 0;
  while (next && guard++ < 500) {
    const page: { results?: T[]; next_link?: string | null } | T[] = await request(cfg, next);
    const rows = Array.isArray(page) ? page : (page.results ?? []);
    out.push(...rows);
    next = Array.isArray(page) ? null : (page.next_link ?? null);
  }
  cfg.stats.records += out.length;
  return out;
}

/** Cursor style (Ashby). POST body carries the cursor. */
export async function paginateCursor<T>(cfg: HttpConfig, endpoint: string, body: Record<string, unknown> = {}): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null = null;
  let guard = 0;
  while (guard++ < 1000) {
    const page: { success: boolean; results: T[]; moreDataAvailable: boolean; nextCursor: string | null; errors?: string[] } = await request(cfg, `/${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, limit: 100, ...(cursor ? { cursor } : {}) }),
    });
    if (!page.success) throw new Error(`Ashby ${endpoint} failed: ${(page.errors ?? []).join(", ")}`);
    out.push(...page.results);
    if (!page.moreDataAvailable || !page.nextCursor) break;
    cursor = page.nextCursor;
  }
  cfg.stats.records += out.length;
  return out;
}
