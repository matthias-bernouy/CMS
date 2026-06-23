import type { Provider, Endpoint } from "../interfaces/Gateway";
import { HTTP_METHODS, PARAM_INS } from "../interfaces/Gateway";
import { isProviderUrn, isEndpointUrn, providerUrnOf } from "./urn";
import { isValidHeaderName, isForbiddenHeaderName, isValidHeaderValue, MAX_ENDPOINT_HEADERS } from "./headerPolicy";

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
        errors.push(`urn de provider invalide : "${provider.urn}" (attendu "urn:<id>")`);
    }

    const seen = new Set<string>();
    for (const ep of provider.endpoints) {
        if (!isEndpointUrn(ep.urn)) {
            errors.push(`urn d'endpoint invalide : "${ep.urn}" (attendu "urn:<provider>:<endpoint>")`);
        } else if (!endpointBelongsToProvider(ep.urn, provider.urn)) {
            errors.push(`l'endpoint "${ep.urn}" n'appartient pas au provider "${provider.urn}"`);
        }

        if (seen.has(ep.urn)) errors.push(`urn d'endpoint dupliqué : "${ep.urn}"`);
        seen.add(ep.urn);

        if (!(HTTP_METHODS as readonly string[]).includes(ep.method)) {
            errors.push(`méthode invalide pour "${ep.urn}" : "${ep.method}"`);
        }
        if (!isParsableUrl(ep.targetUrl)) {
            errors.push(`targetUrl invalide pour "${ep.urn}" : "${ep.targetUrl}"`);
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
            errors.push(`paramètre sans nom pour "${ep.urn}"`);
            continue;
        }
        if (seen.has(p.name)) errors.push(`paramètre dupliqué pour "${ep.urn}" : "${p.name}"`);
        seen.add(p.name);
        if (!(PARAM_INS as readonly string[]).includes(p.in)) {
            errors.push(`emplacement de paramètre invalide pour "${ep.urn}" : "${p.in}" (attendu ${PARAM_INS.join("|")})`);
        }
        // A header-param's NAME becomes an upstream header name (`buildUpstreamUrl`)
        // — hold it to the same policy as config headers, else `host`/`cookie`/…
        // could be smuggled in as a param.
        if (p.in === "header" && (!isValidHeaderName(p.name) || isForbiddenHeaderName(p.name))) {
            errors.push(`paramètre header interdit ou invalide pour "${ep.urn}" : "${p.name}"`);
        }
    }
}

function validateHeaders(ep: Endpoint, errors: string[]): void {
    const headers = ep.headers ?? [];
    if (headers.length > MAX_ENDPOINT_HEADERS) {
        errors.push(`trop de headers pour "${ep.urn}" : ${headers.length} (max ${MAX_ENDPOINT_HEADERS})`);
    }
    const seen = new Set<string>();
    for (const h of headers) {
        if (!isValidHeaderName(h.name) || isForbiddenHeaderName(h.name)) {
            errors.push(`nom de header interdit ou invalide pour "${ep.urn}" : "${h.name}"`);
            continue;
        }
        const key = h.name.toLowerCase();
        if (seen.has(key)) errors.push(`header dupliqué pour "${ep.urn}" : "${h.name}"`);
        seen.add(key);
        if (h.source.from === "static" && !isValidHeaderValue(h.source.value)) {
            errors.push(`valeur de header invalide pour "${ep.urn}" : "${h.name}"`);
        }
        if (h.source.from === "secret" && !h.source.ref) {
            errors.push(`header secret sans ref pour "${ep.urn}" : "${h.name}"`);
        }
    }
}

function validateResponses(ep: Endpoint, errors: string[]): void {
    const seen = new Set<string>();
    for (const r of ep.output ?? []) {
        if (!isValidResponseStatus(r.status)) {
            errors.push(`status de réponse invalide pour "${ep.urn}" : "${r.status}" (attendu un code HTTP ou "default")`);
        }
        if (seen.has(r.status)) errors.push(`status de réponse dupliqué pour "${ep.urn}" : "${r.status}"`);
        seen.add(r.status);
    }
}
