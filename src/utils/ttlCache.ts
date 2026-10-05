interface Entry<V> {
  value: V;
  expiresAt: number;
}

/**
 * In-memory cache with per-entry expiry and a size cap (oldest entries are evicted first).
 * Expired entries stay readable through `getStale` so callers can degrade gracefully when a refresh fails.
 */
export class TtlCache<V> {
  private readonly entries = new Map<string, Entry<V>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 1000,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    return entry && entry.expiresAt > this.now() ? entry.value : undefined;
  }

  getStale(key: string): V | undefined {
    return this.entries.get(key)?.value;
  }

  set(key: string, value: V): void {
    this.entries.delete(key); // re-insert so Map order reflects recency
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    this.evict();
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  get size(): number {
    return this.entries.size;
  }

  /** Enforces capacity only; expired entries are kept (bounded by maxEntries) so stale reads still work. */
  private evict() {
    for (const key of this.entries.keys()) {
      if (this.entries.size <= this.maxEntries) break;
      this.entries.delete(key);
    }
  }
}
