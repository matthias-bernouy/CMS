/**
 * Helpers d'URN du gateway. Grammaire :
 *   - provider : `urn:<providerId>`            (ex: "urn:shop")
 *   - endpoint : `urn:<providerId>:<endpointId>` (ex: "urn:shop:getCart")
 * Pur, zéro dépendance.
 */

export type ParsedUrn = { provider: string; endpoint: string | null };

/** Parse une urn. `null` si la forme est invalide. */
export function parseUrn(urn: string): ParsedUrn | null {
    const parts = urn.split(":");
    if (parts[0] !== "urn") return null;
    if (parts.length === 2 && parts[1]) return { provider: parts[1], endpoint: null };
    if (parts.length === 3 && parts[1] && parts[2]) return { provider: parts[1], endpoint: parts[2] };
    return null;
}

export function makeProviderUrn(providerId: string): string {
    return `urn:${providerId}`;
}

export function makeEndpointUrn(providerId: string, endpointId: string): string {
    return `urn:${providerId}:${endpointId}`;
}

/** L'urn du provider auquel appartient un endpoint. `null` si ce n'est pas une urn d'endpoint. */
export function providerUrnOf(endpointUrn: string): string | null {
    const parsed = parseUrn(endpointUrn);
    return parsed?.endpoint ? makeProviderUrn(parsed.provider) : null;
}

export function isProviderUrn(urn: string): boolean {
    const parsed = parseUrn(urn);
    return parsed !== null && parsed.endpoint === null;
}

export function isEndpointUrn(urn: string): boolean {
    return parseUrn(urn)?.endpoint != null;
}
