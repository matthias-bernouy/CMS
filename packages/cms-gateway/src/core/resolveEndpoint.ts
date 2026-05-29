import type { Endpoint } from "../interfaces/Gateway";
import type { GatewayRepository } from "../interfaces/GatewayRepository";
import { makeEndpointUrn } from "./urn";

export type ResolveResult =
    | { ok: true;  endpoint: Endpoint }
    | { ok: false; reason: "not_found" | "method_not_allowed" };

/**
 * Résout une requête entrante vers un endpoint déclaré (adressage B :
 * `<provider>/<endpoint>`). Utilise l'INTERFACE `GatewayRepository` par injection
 * — jamais une implémentation concrète.
 *
 * @param segments  le path après le préfixe gateway, ex. `["shop", "getCart"]`
 *                  (le préfixe public est géré par la couche Delivery, pas ici).
 * @returns `not_found` si segments mal formés ou endpoint inconnu ;
 *          `method_not_allowed` si l'endpoint existe mais que sa `method` diffère.
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
