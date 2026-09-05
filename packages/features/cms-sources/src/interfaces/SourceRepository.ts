import type { Source, SourceEndpoint } from "./Source";

export type SourceSchemaInvalidationScope = {
    sourceId?: string;
};

/**
 * Persistence of sources. Aggregate: a `Source` is stored in full
 * (with its endpoints), keyed by its `urn`. Writes are whole-aggregate: the admin
 * UI submits the complete source (all endpoints), so there are no endpoint-level
 * mutators — `updateSource` replaces the document in full.
 */
export interface SourceRepository {
    /** Persists a source (key = `source.urn`). Rejects if the urn already exists. */
    createSource(source: Source): Promise<Source>;

    /** Replaces a source in full (key = `source.urn`, immutable). `null` if the urn does not exist. */
    updateSource(source: Source): Promise<Source | null>;

    /** Removes a source by urn (its endpoints live in the aggregate, so they go with it). `false` if absent. */
    deleteSource(urn: string): Promise<boolean>;

    /** A source by its urn, e.g. "urn:shop". `null` if not found. */
    getSource(urn: string): Promise<Source | null>;

    /**
     * The stored aggregate before decorators add projections such as Source overlays.
     * Every repository must choose and expose its storage-authoritative read explicitly.
     */
    getPersistedSource(urn: string): Promise<Source | null>;

    /** All sources. */
    getAllSources(): Promise<Source[]>;

    /**
     * An endpoint by its urn, e.g. "urn:shop:getCart" — the lookup the proxy
     * uses to resolve an incoming request. `null` if not found.
     */
    getEndpoint(urn: string): Promise<SourceEndpoint | null>;

    /**
     * Optional side-effect-free endpoint lookup used before authorization.
     * Decorators that enrich endpoint contracts through network, secret, or
     * other privileged work must return the underlying endpoint descriptor
     * here and defer enrichment until after authorization succeeds.
     */
    getEndpointForAuthorization?(urn: string): Promise<SourceEndpoint | null>;

    /** Invalidates derived endpoint schemas after a successful schema-changing operation. */
    invalidateSchema?(scope?: SourceSchemaInvalidationScope): void;
}
