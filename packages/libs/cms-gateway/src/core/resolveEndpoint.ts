import type { Endpoint } from "../interfaces/Gateway";
import type { GatewayRepository } from "../interfaces/GatewayRepository";
import { makeEndpointUrn } from "./urn";

export type ResolveResult =
    | { ok: true;  endpoint: Endpoint }
    | { ok: false; reason: "not_found" | "method_not_allowed" };

/**
 * Resolves an incoming request to a declared endpoint (B addressing:
 * `<provider>/<endpoint>`). Uses the `GatewayRepository` INTERFACE via injection
 * — never a concrete implementation.
 *
 * @param segments  the path after the gateway prefix, e.g. `["shop", "getCart"]`
 *                  (the public prefix is handled by the Delivery layer, not here).
 * @returns `not_found` if segments are malformed or the endpoint is unknown;
 *          `method_not_allowed` if the endpoint exists but its `method` differs.
 */
export async function resolveEndpoint(
    repo: GatewayRepository,
    segments: string[],
    method: string,
): Promise<ResolveResult> {
    if (segments.length !== 2 || !segments[0] || !segments[1]) {
        return { ok: false, reason: "not_found" };
    }

    const urn = makeEndpointUrn(segments[0], segments[1]);
    const endpoint = await repo.getEndpoint(urn);
    if (!endpoint) return { ok: false, reason: "not_found" };

    if (endpoint.method !== method.toUpperCase()) {
        return { ok: false, reason: "method_not_allowed" };
    }

    return { ok: true, endpoint };
}
