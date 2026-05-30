import type { Provider, Endpoint } from "@bernouy/cms-gateway";
import { makeProviderUrn, makeEndpointUrn } from "@bernouy/cms-gateway";
import type { ProviderDto } from "../validation/gateway/parseProviderDto";

/**
 * Builds the full `Provider` aggregate from a parsed DTO. Urns are ALWAYS
 * recomputed here from `id` + `endpointId` (never trusted from the body), and
 * every endpoint ships with `rules: []` — V1 stores no outbound rules, so the
 * step-0 executor never rejects a provider authored in the admin. Declared input
 * params (`in:'query'` etc.) become `input.params`; the proxy reads them in
 * `buildUpstreamUrl` (no rules needed — values are forwarded from the caller).
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
                rules: [],
            };
            if (e.params.length) {
                endpoint.input = {
                    params: e.params.map(p => ({
                        name: p.name,
                        in: p.in,
                        required: p.required,
                        schema: { type: p.type },
                    })),
                };
            }
            return endpoint;
        }),
    };
}
