import type { Source, SourceEndpoint } from "../interfaces/Source";
import type { SourceRepository, SourceSchemaInvalidationScope } from "../interfaces/SourceRepository";
import type { SourceOverlay, SourceOverlayRepository } from "../interfaces/SourceOverlay";
import type { ExecutorDeps } from "./executeEndpoint";
import {
    DEFAULT_SOURCE_OVERLAY_SCHEMA_CACHE_TTL_MS,
    SourceOverlaySchemaCache,
    type SourceOverlaySchemaCacheSelector,
} from "./SourceOverlaySchemaCache";
import { materializeSourceOverlays } from "./sourceOverlayDynamicFields";
import { applySourceOverlays, overlaysFor, sourceOverlayFieldPath } from "./sourceOverlayProjection";
import { parseUrn, sourceUrnOf } from "./urn";

export type SourceOverlaySourceRepositoryOptions = {
    deps?: ExecutorDeps;
    schemaCache?: SourceOverlaySchemaCache;
    schemaCacheTtlMs?: number;
};

type SourceOverlaySchemaCacheRegistry = {
    byTtl: Map<number, SourceOverlaySchemaCache>;
    caches: Set<SourceOverlaySchemaCache>;
};

const sharedSchemaCaches = new WeakMap<SourceOverlayRepository, SourceOverlaySchemaCacheRegistry>();

export class SourceOverlaySourceRepository implements SourceRepository {
    private readonly schemaCache: SourceOverlaySchemaCache;

    constructor(
        private readonly inner: SourceRepository,
        private readonly overlays: SourceOverlayRepository,
        private readonly options: SourceOverlaySourceRepositoryOptions = {},
    ) {
        this.schemaCache = options.schemaCache ?? sourceOverlaySchemaCacheFor(overlays, options.schemaCacheTtlMs);
        schemaCacheRegistry(overlays).caches.add(this.schemaCache);
    }

    async createSource(source: Source): Promise<Source> {
        const created = await this.inner.createSource(source);
        this.invalidateOverlaySchemas({ sourceId: sourceId(source) });
        return created;
    }

    async updateSource(source: Source): Promise<Source | null> {
        const updated = await this.inner.updateSource(source);
        if (updated) {
            this.invalidateOverlaySchemas({ sourceId: sourceId(source) });
        }
        return updated;
    }

    async deleteSource(urn: string): Promise<boolean> {
        const deleted = await this.inner.deleteSource(urn);
        const sourceId = parseUrn(urn)?.source;
        if (deleted && sourceId) {
            this.invalidateOverlaySchemas({ sourceId });
        }
        return deleted;
    }

    invalidateOverlaySchemas(selector: SourceOverlaySchemaCacheSelector = {}): void {
        for (const cache of schemaCacheRegistry(this.overlays).caches) {
            cache.invalidate(selector);
        }
    }

    invalidateSchema(scope: SourceSchemaInvalidationScope = {}): void {
        this.invalidateOverlaySchemas(scope);
    }

    async getSource(urn: string): Promise<Source | null> {
        const source = await this.inner.getSource(urn);
        if (!source) {
            return null;
        }
        const overlays = await this.overlays.getOverlaysForSource(sourceId(source));
        return applySourceOverlays(
            source,
            await materializeSourceOverlays(source, overlays, this.options.deps, this.schemaCache),
        );
    }

    async getAllSources(): Promise<Source[]> {
        const sources = await this.inner.getAllSources();
        const overlays = await this.overlays.getAllOverlays();
        return Promise.all(
            sources.map(async (source) =>
                applySourceOverlays(
                    source,
                    await materializeSourceOverlays(
                        source,
                        overlaysFor(source, overlays),
                        this.options.deps,
                        this.schemaCache,
                    ),
                ),
            ),
        );
    }

    async getEndpoint(urn: string): Promise<SourceEndpoint | null> {
        const sourceUrn = sourceUrnOf(urn);
        if (!sourceUrn) {
            return this.inner.getEndpoint(urn);
        }
        const source = await this.inner.getSource(sourceUrn);
        if (!source) {
            return null;
        }

        const endpoint = source.endpoints.find((candidate) => candidate.urn === urn);
        if (!endpoint) {
            return null;
        }

        const endpointId = parseUrn(urn)?.endpoint ?? "";
        const overlays = (await this.overlays.getOverlaysForSource(sourceId(source))).filter((overlay) =>
            overlayTargetsEndpoint(overlay, endpointId),
        );
        if (!overlays.length) {
            return structuredClone(endpoint);
        }

        const enriched = applySourceOverlays(
            source,
            await materializeSourceOverlays(source, overlays, this.options.deps, this.schemaCache),
        );
        return enriched.endpoints.find((candidate) => candidate.urn === urn) ?? null;
    }

    async getEndpointForAuthorization(urn: string): Promise<SourceEndpoint | null> {
        if (this.inner.getEndpointForAuthorization) {
            return this.inner.getEndpointForAuthorization(urn);
        }
        return this.inner.getEndpoint(urn);
    }
}

function sourceId(source: Source): string {
    return parseUrn(source.urn)?.source ?? "";
}

export function sourceOverlaySchemaCacheFor(
    overlays: SourceOverlayRepository,
    configuredTtlMs?: number,
): SourceOverlaySchemaCache {
    const ttlMs = configuredTtlMs ?? DEFAULT_SOURCE_OVERLAY_SCHEMA_CACHE_TTL_MS;
    const registry = schemaCacheRegistry(overlays);
    let cache = registry.byTtl.get(ttlMs);
    if (!cache) {
        cache = new SourceOverlaySchemaCache({ ttlMs });
        registry.byTtl.set(ttlMs, cache);
        registry.caches.add(cache);
    }
    return cache;
}

function schemaCacheRegistry(overlays: SourceOverlayRepository): SourceOverlaySchemaCacheRegistry {
    let registry = sharedSchemaCaches.get(overlays);
    if (!registry) {
        registry = { byTtl: new Map(), caches: new Set() };
        sharedSchemaCaches.set(overlays, registry);
    }
    return registry;
}

function overlayTargetsEndpoint(overlay: SourceOverlay, endpointId: string): boolean {
    return [...(overlay.input ?? []), ...(overlay.output ?? [])].some((target) => target.endpointId === endpointId);
}

export { applySourceOverlays, materializeSourceOverlays, sourceOverlayFieldPath };
