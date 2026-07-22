import type { Source } from "cms-sources/interfaces/Source";
import type { SourceOverlay, SourceOverlayField } from "cms-sources/interfaces/SourceOverlay";
import { hasComputedHeaders, hasComputedParams } from "cms-sources/core/upstream/endpointHeaders";
import { parseUrn } from "cms-sources/core/system/urn";

export const DEFAULT_SOURCE_OVERLAY_SCHEMA_CACHE_TTL_MS = 60_000;

export type SourceOverlaySchemaCacheOptions = {
    ttlMs?: number;
    now?: () => number;
};

export type SourceOverlaySchemaCacheSelector = {
    sourceId?: string;
    overlayId?: string;
};

type CacheEntry = SourceOverlaySchemaCacheSelector & {
    expiresAt: number;
    fields: SourceOverlayField[];
};

type PendingEntry = SourceOverlaySchemaCacheSelector & {
    promise: Promise<SourceOverlayField[] | null>;
};

export class SourceOverlaySchemaCache {
    private readonly entries = new Map<string, CacheEntry>();
    private readonly pending = new Map<string, PendingEntry>();
    private readonly ttlMs: number;
    private readonly now: () => number;
    private invalidationRevision = 0;

    constructor(options: SourceOverlaySchemaCacheOptions = {}) {
        const ttlMs = options.ttlMs ?? DEFAULT_SOURCE_OVERLAY_SCHEMA_CACHE_TTL_MS;
        if (!Number.isFinite(ttlMs) || ttlMs < 0) {
            throw new RangeError("source overlay schema cache ttlMs must be a finite non-negative number");
        }
        this.ttlMs = ttlMs;
        this.now = options.now ?? Date.now;
    }

    async getOrLoad(
        source: Source,
        overlay: SourceOverlay,
        load: () => Promise<SourceOverlayField[] | null>,
    ): Promise<SourceOverlayField[] | null> {
        const fingerprint = await schemaFingerprint(source, overlay);
        if (!fingerprint) {
            return await load();
        }

        const key = `${overlay.sourceId}:${overlay.id}:${fingerprint}`;
        const now = this.now();
        this.purgeExpired(now);
        const cached = this.entries.get(key);
        if (cached) {
            return structuredClone(cached.fields);
        }

        const active = this.pending.get(key);
        if (active) {
            return cloneNullableFields(await active.promise);
        }

        const invalidationRevision = this.invalidationRevision;
        const promise = load();
        const pending = { sourceId: overlay.sourceId, overlayId: overlay.id, promise };
        this.pending.set(key, pending);
        try {
            const fields = await promise;
            if (fields !== null && this.ttlMs > 0 && invalidationRevision === this.invalidationRevision) {
                this.entries.set(key, {
                    sourceId: overlay.sourceId,
                    overlayId: overlay.id,
                    expiresAt: this.now() + this.ttlMs,
                    fields: structuredClone(fields),
                });
            }
            return cloneNullableFields(fields);
        } finally {
            if (this.pending.get(key) === pending) {
                this.pending.delete(key);
            }
        }
    }

    invalidate(selector: SourceOverlaySchemaCacheSelector = {}): void {
        this.invalidationRevision += 1;
        deleteMatching(this.entries, selector);
        deleteMatching(this.pending, selector);
    }

    private purgeExpired(now: number): void {
        for (const [key, entry] of this.entries) {
            if (entry.expiresAt <= now) {
                this.entries.delete(key);
            }
        }
    }
}

async function schemaFingerprint(source: Source, overlay: SourceOverlay): Promise<string | null> {
    const endpointId = overlay.fieldSource?.endpointId;
    if (!endpointId) {
        return null;
    }
    const endpoint = source.endpoints.find((candidate) => parseUrn(candidate.urn)?.endpoint === endpointId);
    // Contextual or effectful endpoints remain execution-scoped and must never cross callers.
    if (
        !endpoint ||
        endpoint.method !== "GET" ||
        endpoint.effects !== undefined ||
        hasComputedParams(endpoint) ||
        hasComputedHeaders(endpoint)
    ) {
        return null;
    }
    const revision = canonicalJson({
        source: { urn: source.urn, fieldSourceEndpoint: endpoint },
        overlay,
    });
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(revision));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalJson(value: unknown): string {
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value) ?? "null";
    }
    if (Array.isArray(value)) {
        return `[${value.map(canonicalJson).join(",")}]`;
    }
    const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}

function cloneNullableFields(fields: SourceOverlayField[] | null): SourceOverlayField[] | null {
    return fields === null ? null : structuredClone(fields);
}

function deleteMatching<T extends SourceOverlaySchemaCacheSelector>(
    entries: Map<string, T>,
    selector: SourceOverlaySchemaCacheSelector,
): void {
    for (const [key, entry] of entries) {
        if (selector.sourceId !== undefined && selector.sourceId !== entry.sourceId) {
            continue;
        }
        if (selector.overlayId !== undefined && selector.overlayId !== entry.overlayId) {
            continue;
        }
        entries.delete(key);
    }
}
