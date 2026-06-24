import type { Provider, Endpoint } from "../interfaces/Gateway";
import { COMPUTED_PARAM_REFS, HTTP_METHODS, PARAM_INS } from "../interfaces/Gateway";
import { isProviderUrn, isEndpointUrn, providerUrnOf } from "./urn";
import { isValidHeaderName, isForbiddenHeaderName, isValidHeaderValue, MAX_ENDPOINT_HEADERS } from "./headerPolicy";
import { isSystemProviderUrn } from "./systemProviders";

/** `true` if the endpoint urn belongs to the given provider. */
export function endpointBelongsToProvider(endpointUrn: string, providerUrn: string): boolean {
    return providerUrnOf(endpointUrn) === providerUrn;
}

export function isParsableUrl(value: string): boolean {
    try {
        new URL(value);
        return true;
    } catch {
        return false;
    }
}

/** An HTTP status code "100".."599", or the OpenAPI fallback literal "default" —
 *  the rule for an `EndpointResponse.status`. */
const RESPONSE_STATUS = /^[1-5][0-9][0-9]$/;
export function isValidResponseStatus(status: string): boolean {
    return status === "default" || RESPONSE_STATUS.test(status);
}

/**
 * Validates a provider before storage. Returns the list of errors ([] = valid).
 * Pure — no I/O. Enforced unbypassably by `ValidatingGatewayRepository`; callers
 * that want to fail a whole batch before writing (seed) call it directly.
 */
export function validateProvider(provider: Provider): string[] {
    const errors: string[] = [];

    if (!isProviderUrn(provider.urn)) {
        errors.push(`invalid provider urn: "${provider.urn}" (expected "urn:<id>")`);
    } else if (isSystemProviderUrn(provider.urn)) {
        errors.push(`reserved system provider urn: "${provider.urn}"`);
    }

    const seen = new Set<string>();
    for (const ep of provider.endpoints) {
        if (!isEndpointUrn(ep.urn)) {
            errors.push(`invalid endpoint urn: "${ep.urn}" (expected "urn:<provider>:<endpoint>")`);
        } else if (!endpointBelongsToProvider(ep.urn, provider.urn)) {
            errors.push(`endpoint "${ep.urn}" does not belong to provider "${provider.urn}"`);
        }

        if (seen.has(ep.urn)) errors.push(`duplicate endpoint urn: "${ep.urn}"`);
        seen.add(ep.urn);

        if (!(HTTP_METHODS as readonly string[]).includes(ep.method)) {
            errors.push(`invalid method for "${ep.urn}": "${ep.method}"`);
        }
        if (!isParsableUrl(ep.targetUrl)) {
            errors.push(`invalid targetUrl for "${ep.urn}": "${ep.targetUrl}"`);
        }

        validateParams(ep, errors);
        validateHeaders(ep, errors);
        validateResponses(ep, errors);
    }

    return errors;
}

function validateParams(ep: Endpoint, errors: string[]): void {
    const seen = new Set<string>();
    for (const p of ep.input?.params ?? []) {
        if (!p.name) {
            errors.push(`param without name for "${ep.urn}"`);
            continue;
        }
        if (seen.has(p.name)) errors.push(`duplicate param for "${ep.urn}": "${p.name}"`);
        seen.add(p.name);
        if (!(PARAM_INS as readonly string[]).includes(p.in)) {
            errors.push(`invalid param location for "${ep.urn}": "${p.in}" (expected ${PARAM_INS.join("|")})`);
        }
        if (p.source?.from === "computed") {
            if (p.in === "path") {
                errors.push(`computed param is not supported for path in "${ep.urn}": "${p.name}"`);
            }
            if (!(COMPUTED_PARAM_REFS as readonly string[]).includes(p.source.ref)) {
                errors.push(`invalid computed ref for "${ep.urn}": "${p.source.ref}"`);
            }
        } else if (p.source && p.source.from !== "request") {
            errors.push(`invalid param source for "${ep.urn}": "${(p.source as { from?: string }).from}"`);
        }
        // A header-param's NAME becomes an upstream header name (`buildUpstreamUrl`)
        // — hold it to the same policy as config headers, else `host`/`cookie`/…
        // could be smuggled in as a param.
        if (p.in === "header" && (!isValidHeaderName(p.name) || isForbiddenHeaderName(p.name))) {
            errors.push(`forbidden or invalid header param for "${ep.urn}": "${p.name}"`);
        }
    }
}

function validateHeaders(ep: Endpoint, errors: string[]): void {
    const headers = ep.headers ?? [];
    if (headers.length > MAX_ENDPOINT_HEADERS) {
        errors.push(`too many headers for "${ep.urn}": ${headers.length} (max ${MAX_ENDPOINT_HEADERS})`);
    }
    const seen = new Set<string>();
    for (const h of headers) {
        if (!isValidHeaderName(h.name) || isForbiddenHeaderName(h.name)) {
            errors.push(`forbidden or invalid header name for "${ep.urn}": "${h.name}"`);
            continue;
        }
        const key = h.name.toLowerCase();
        if (seen.has(key)) errors.push(`duplicate header for "${ep.urn}": "${h.name}"`);
        seen.add(key);
        if (h.source.from === "static" && !isValidHeaderValue(h.source.value)) {
            errors.push(`invalid header value for "${ep.urn}": "${h.name}"`);
        }
        if (h.source.from === "secret" && !h.source.ref) {
            errors.push(`secret header without ref for "${ep.urn}": "${h.name}"`);
        }
        if (h.source.from === "secret") {
            const prefix = (h.source as { prefix?: unknown }).prefix;
            if (prefix !== undefined && (typeof prefix !== "string" || !isValidHeaderValue(prefix))) {
                errors.push(`invalid header prefix for "${ep.urn}": "${h.name}"`);
            }
        }
        if (h.source.from === "computed" && !(COMPUTED_PARAM_REFS as readonly string[]).includes(h.source.ref)) {
            errors.push(`invalid computed ref for "${ep.urn}": "${h.source.ref}"`);
        }
        if (!["static", "secret", "computed"].includes((h.source as { from?: string }).from ?? "")) {
            errors.push(`invalid header source for "${ep.urn}": "${(h.source as { from?: string }).from}"`);
        }
    }
}

function validateResponses(ep: Endpoint, errors: string[]): void {
    const seen = new Set<string>();
    for (const r of ep.output ?? []) {
        if (!isValidResponseStatus(r.status)) {
            errors.push(`invalid response status for "${ep.urn}": "${r.status}" (expected an HTTP code or "default")`);
        }
        if (seen.has(r.status)) errors.push(`duplicate response status for "${ep.urn}": "${r.status}"`);
        seen.add(r.status);
    }
}
