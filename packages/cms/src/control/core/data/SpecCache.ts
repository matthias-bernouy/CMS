import type { ParsedSpec } from "./types";

/**
 * In-memory cache of parsed OpenAPI specs, keyed by provider id with a
 * spec hash to detect external changes. Per-tenant — instantiated by
 * `ControlCms` so a multi-tenant deployment doesn't leak across.
 *
 * Invalidation is explicit: callers call `delete(id)` on sync. There is
 * no TTL — specs only change when the admin re-syncs, so wall-clock
 * eviction would just churn for no benefit.
 */
export class SpecCache {

    private _entries = new Map<string, { hash: string; parsed: ParsedSpec }>();

    /** Returns the cached `ParsedSpec` if hash matches, otherwise null. */
    get(providerId: string, hash: string): ParsedSpec | null {
        const entry = this._entries.get(providerId);
        if (!entry || entry.hash !== hash) return null;
        return entry.parsed;
    }

    set(providerId: string, hash: string, parsed: ParsedSpec): void {
        this._entries.set(providerId, { hash, parsed });
    }

    delete(providerId: string): void {
        this._entries.delete(providerId);
    }

    clear(): void {
        this._entries.clear();
    }

    get size(): number {
        return this._entries.size;
    }
}
