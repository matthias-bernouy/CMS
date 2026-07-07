import { sourceDtoToSource, type Source, type SourceDto } from "@bernouy/cms-sources";

type EnrichedEndpoint = Omit<SourceDto["endpoints"][number], "params"> & {
    params?: SourceDto["endpoints"][number]["params"];
};

type EnrichedSource = {
    urn: string;
    id: string;
    meta?: SourceDto["meta"];
    endpoints?: EnrichedEndpoint[];
};

/**
 * Rebuild the canonical `Source` from the enriched edit-form response.
 * This is the inverse of `sources.get`'s endpoint/param flattening.
 */
export function reconstructSource(value: unknown): Source {
    const r = value as EnrichedSource;
    return sourceDtoToSource({
        id: r.id,
        meta: r.meta ?? { name: r.id },
        endpoints: (r.endpoints ?? []).map(e => ({
            endpointId: e.endpointId,
            method: e.method,
            targetUrl: e.targetUrl,
            params: (e.params ?? []).map(p => ({
                name: p.name,
                in: p.in,
                ...(p.type ? { type: p.type } : {}),
                ...(p.required ? { required: true } : {}),
                ...(p.description ? { description: p.description } : {}),
            })),
            ...(e.body !== undefined ? { body: e.body } : {}),
            ...(e.output !== undefined ? { output: e.output } : {}),
            ...(e.meta !== undefined ? { meta: e.meta } : {}),
            ...(e.headers !== undefined ? { headers: e.headers } : {}),
        })),
    });
}
