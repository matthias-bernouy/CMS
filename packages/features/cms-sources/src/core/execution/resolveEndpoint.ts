import type { SourceEndpoint } from "cms-sources/interfaces/Source";
import type { SourceRepository } from "cms-sources/interfaces/SourceRepository";
import { makeEndpointUrn } from "cms-sources/core/system/urn";

export type ResolveResult =
    | { ok: true; endpoint: SourceEndpoint }
    | { ok: false; reason: "not_found" | "method_not_allowed" };

export type ResolveEndpointOptions = {
    forAuthorization?: boolean;
};

/**
 * Resolves an incoming request to a declared endpoint (B addressing:
 * `<source>/<endpoint>`). Uses the `SourceRepository` INTERFACE via injection
 * — never a concrete implementation.
 *
 * @param segments  the path after the source prefix, e.g. `["shop", "getCart"]`
 *                  (the public prefix is handled by the Delivery layer, not here).
 * @returns `not_found` if segments are malformed or the endpoint is unknown;
 *          `method_not_allowed` if the endpoint exists but its `method` differs.
 */
export async function resolveEndpoint(
    repo: SourceRepository,
    segments: string[],
    method: string,
    options: ResolveEndpointOptions = {},
): Promise<ResolveResult> {
    if (segments.length !== 2 || !segments[0] || !segments[1]) {
        return { ok: false, reason: "not_found" };
    }

    const urn = makeEndpointUrn(segments[0], segments[1]);
    const endpoint =
        options.forAuthorization && repo.getEndpointForAuthorization
            ? await repo.getEndpointForAuthorization(urn)
            : await repo.getEndpoint(urn);
    if (!endpoint) {
        return { ok: false, reason: "not_found" };
    }

    if (endpoint.method.toUpperCase() !== method.toUpperCase()) {
        return { ok: false, reason: "method_not_allowed" };
    }

    return { ok: true, endpoint };
}
