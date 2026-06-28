/**
 * Source URN helpers. Grammar:
 *   - source : `urn:<sourceId>`            (e.g. "urn:shop")
 *   - endpoint : `urn:<sourceId>:<endpointId>` (e.g. "urn:shop:getCart")
 * Pure, zero dependencies.
 */

export type ParsedUrn = { source: string; endpoint: string | null };

/** Parses a urn. Returns `null` if the form is invalid. */
export function parseUrn(urn: string): ParsedUrn | null {
    const parts = urn.split(":");
    if (parts[0] !== "urn") return null;
    if (parts.length === 2 && parts[1]) return { source: parts[1], endpoint: null };
    if (parts.length === 3 && parts[1] && parts[2]) return { source: parts[1], endpoint: parts[2] };
    return null;
}

export function makeSourceUrn(sourceId: string): string {
    return `urn:${sourceId}`;
}

export function makeEndpointUrn(sourceId: string, endpointId: string): string {
    return `urn:${sourceId}:${endpointId}`;
}

/** The source urn that an endpoint belongs to. Returns `null` if this is not an endpoint urn. */
export function sourceUrnOf(endpointUrn: string): string | null {
    const parsed = parseUrn(endpointUrn);
    return parsed?.endpoint ? makeSourceUrn(parsed.source) : null;
}

export function isSourceUrn(urn: string): boolean {
    const parsed = parseUrn(urn);
    return parsed !== null && parsed.endpoint === null;
}

export function isEndpointUrn(urn: string): boolean {
    return parseUrn(urn)?.endpoint != null;
}
