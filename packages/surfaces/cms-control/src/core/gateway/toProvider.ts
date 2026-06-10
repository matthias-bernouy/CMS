import type { Provider, Endpoint } from "@bernouy/cms-gateway";
import { makeProviderUrn, makeEndpointUrn } from "@bernouy/cms-gateway";
import type { ProviderDto } from "../validation/gateway/parseProviderDto";

/**
 * Builds the full `Provider` aggregate from a parsed DTO. Urns are ALWAYS
 * recomputed here from `id` + `endpointId` (never trusted from the body).
 * Declared input params (`in:'query'` etc.) become `input.params`; the proxy
 * reads them in `buildUpstreamUrl` (values are forwarded from the caller).
 */
export function toProvider(dto: ProviderDto): Provider {
    return {
        urn: makeProviderUrn(dto.id),
        meta: dto.meta,
        endpoints: dto.endpoints.map(e => {
            const endpoint: Endpoint = {
                urn: makeEndpointUrn(dto.id, e.endpointId),
                method: e.method,
                targetUrl: e.targetUrl,
            };
            // Build `input` from params AND/OR body — set it when either exists, so
            // a body-only endpoint keeps its `input` and an edit never drops the body.
            if (e.params.length || e.body) {
                endpoint.input = {};
                if (e.params.length) {
                    endpoint.input.params = e.params.map(p => ({
                        name: p.name,
                        in: p.in,
                        required: p.required,
                        schema: { type: p.type },
                        ...(p.description ? { description: p.description } : {}),
                    }));
                }
                if (e.body) endpoint.input.body = e.body;
            }
            // Output (per-status list) + meta have no editor yet but are preserved (B1 round-trip).
            if (e.output?.length) endpoint.output = e.output;
            if (e.meta) endpoint.meta = e.meta;
            if (e.headers?.length) endpoint.headers = e.headers;
            return endpoint;
        }),
    };
}
