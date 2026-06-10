/**
 * Gateway URN helpers. Grammar:
 *   - provider : `urn:<providerId>`            (e.g. "urn:shop")
 *   - endpoint : `urn:<providerId>:<endpointId>` (e.g. "urn:shop:getCart")
 * Pure, zero dependencies.
 */

export type ParsedUrn = { provider: string; endpoint: string | null };

/** Parses a urn. Returns `null` if the form is invalid. */
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

/** The provider urn that an endpoint belongs to. Returns `null` if this is not an endpoint urn. */
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
