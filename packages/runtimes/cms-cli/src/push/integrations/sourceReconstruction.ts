import { sourceDtoToSource, type Source, type SourceDto } from "@bernouy/cms-sources";

type EnrichedEndpoint = Omit<SourceDto["endpoints"][number], "params"> & {
    params?: SourceDto["endpoints"][number]["params"];
};

type EnrichedSource = {
    urn: string;
    id: string;
    identityAuthority?: SourceDto["identityAuthority"];
    meta?: SourceDto["meta"];
    endpoints?: EnrichedEndpoint[];
    indexing?: SourceDto["indexing"];
};

/**
 * Rebuild the canonical `Source` from the enriched edit-form response.
 * This is the inverse of `sources.get`'s endpoint/param flattening.
 */
export function reconstructSource(value: unknown): Source {
    const r = value as EnrichedSource;
    return sourceDtoToSource({
        id: r.id,
        ...(r.identityAuthority ? { identityAuthority: r.identityAuthority } : {}),
        meta: r.meta ?? { name: r.id },
        ...(r.indexing ? { indexing: r.indexing } : {}),
        endpoints: (r.endpoints ?? []).map((endpoint) => ({
            ...endpoint,
            params: (endpoint.params ?? []).map(({ required, ...param }) => ({
                ...param,
                ...(required ? { required: true } : {}),
            })),
        })),
    });
}
