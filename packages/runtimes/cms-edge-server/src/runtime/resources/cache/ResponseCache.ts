import { cacheKey, unconditional } from "./policy";
import { loadCacheResource } from "./load";
import { cachedResponse, streamingResponse } from "./representation";
import type { CachedResource, CacheLoad, CacheOptions } from "./types";
type Fill = { startedAt: number; generation: number; waiters: number; result: Promise<CachedResource | Response> };

/** Ephemeral per-Edge-instance cache. Provider authority still owns every miss and private request. */
export class ResponseCache {
    private readonly entries = new Map<string, CachedResource>();
    private readonly pending = new Map<string, Fill>();
    private generation = 0;
    private bytes = 0;
    private active = 0;
    private readonly now: () => number;
    constructor(private readonly options: CacheOptions = {}) {
        this.now = options.now ?? Date.now;
        for (const key of ["maxEntries", "maxBytes", "maxEntryBytes", "maxPending", "maxWaiters"] as const) {
            if (options[key] !== undefined && (!Number.isSafeInteger(options[key]) || options[key]! < 1)) {
                throw new TypeError(`Invalid resource cache ${key}`);
            }
        }
    }
    purge(tags?: readonly string[]): void {
        this.generation++;
        for (const [key, value] of this.entries) {
            if (!tags || !value.tags.length || value.tags.some((tag) => tags.includes(tag))) {
                this.remove(key);
            }
        }
        this.pending.clear();
    }
    snapshot() {
        return { entries: this.entries.size, bytes: this.bytes, fills: this.active, generation: this.generation };
    }
    async handle(request: Request, load: CacheLoad, eligible = true): Promise<Response> {
        const key = this.options.enabled === false || !eligible ? null : cacheKey(request);
        if (key === null) {
            const result = await load(request);
            result.response.headers.set("x-cache", "BYPASS");
            return result.response;
        }
        const entry = this.entries.get(key);
        if (entry) {
            const age = (this.now() - entry.storedAt) / 1000;
            if (age < entry.policy.fresh) {
                this.entries.delete(key);
                this.entries.set(key, entry);
                this.event("HIT");
                return cachedResponse(entry, request, this.now(), "HIT");
            }
            if (age < entry.policy.fresh + entry.policy.staleWhileRevalidate) {
                if (!this.pending.has(key) && this.active < (this.options.maxPending ?? 16)) {
                    void this.fill(key, unconditional(request), load)
                        .then(async (value) => {
                            if (value instanceof Response) {
                                await value.body?.cancel();
                            }
                        })
                        .catch(() => undefined);
                }
                this.event("STALE");
                return cachedResponse(entry, request, this.now(), "STALE");
            }
        }
        if (request.method === "HEAD") {
            const result = await load(request);
            result.response.headers.set("x-cache", "BYPASS");
            return result.response;
        }
        let existing = this.pending.get(key);
        if (existing && this.now() - existing.startedAt >= 15_000) {
            this.pending.delete(key);
            existing = undefined;
        }
        if (
            (existing?.waiters ?? 0) >= (this.options.maxWaiters ?? 64) ||
            (!existing && this.active >= (this.options.maxPending ?? 16))
        ) {
            return new Response("Resource cache capacity exceeded", {
                status: 503,
                headers: { "cache-control": "no-store", "retry-after": "1" },
            });
        }
        try {
            if (existing) {
                existing.waiters++;
            }
            let value: CachedResource | Response;
            try {
                value = await (existing ? existing.result : this.fill(key, unconditional(request), load));
            } finally {
                if (existing) {
                    existing.waiters--;
                }
            }
            if (value instanceof Response) {
                if (
                    value.status >= 500 &&
                    entry &&
                    this.entries.get(key) === entry &&
                    (this.now() - entry.storedAt) / 1000 < entry.policy.fresh + entry.policy.staleIfError
                ) {
                    if (!existing) {
                        await value.body?.cancel();
                    }
                    return cachedResponse(entry, request, this.now(), "STALE");
                }
                if (existing) {
                    const direct = await load(request);
                    direct.response.headers.set("x-cache", "BYPASS");
                    return direct.response;
                }
                return streamingResponse(value, request, "MISS");
            }
            this.event(existing ? "COALESCED" : "MISS");
            return cachedResponse(value, request, this.now(), existing ? "COALESCED" : "MISS");
        } catch (error) {
            if (
                entry &&
                this.entries.get(key) === entry &&
                (this.now() - entry.storedAt) / 1000 < entry.policy.fresh + entry.policy.staleIfError
            ) {
                this.event("STALE");
                return cachedResponse(entry, request, this.now(), "STALE");
            }
            throw error;
        }
    }
    private async fill(key: string, request: Request, load: CacheLoad): Promise<CachedResource | Response> {
        const generation = this.generation;
        this.active++;
        const fill: Fill = {
            startedAt: this.now(),
            generation,
            waiters: 1,
            result: Promise.resolve()
                .then(async () => {
                    const entry = await loadCacheResource(key, request, load, this.options, this.now);
                    if (entry instanceof Response) {
                        if (entry.status < 500 && generation === this.generation) {
                            this.remove(key);
                        }
                        return entry;
                    }
                    const bytes = entry.bytes;
                    const maximum = this.options.maxEntryBytes ?? 1024 * 1024;
                    if (
                        generation === this.generation &&
                        this.pending.get(key) === fill &&
                        bytes <= maximum &&
                        bytes <= (this.options.maxBytes ?? 16 * 1024 * 1024)
                    ) {
                        this.remove(key);
                        while (
                            this.entries.size >= (this.options.maxEntries ?? 256) ||
                            this.bytes + bytes > (this.options.maxBytes ?? 16 * 1024 * 1024)
                        ) {
                            this.remove(this.entries.keys().next().value!);
                        }
                        this.entries.set(key, entry);
                        this.bytes += bytes;
                    }
                    return entry;
                })
                .finally(() => {
                    this.active--;
                    if (this.pending.get(key) === fill) {
                        this.pending.delete(key);
                    }
                }),
        };
        this.pending.set(key, fill);
        return fill.result;
    }
    private remove(key: string): void {
        const entry = this.entries.get(key);
        if (entry) {
            this.bytes -= entry.bytes;
            this.entries.delete(key);
        }
    }
    private event(outcome: string) {
        try {
            this.options.event?.(outcome);
        } catch {
            /* Diagnostics never change delivery. */
        }
    }
}
