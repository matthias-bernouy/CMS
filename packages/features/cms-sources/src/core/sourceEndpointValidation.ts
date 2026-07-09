import type { EndpointParam, SourceEndpoint } from "../interfaces/Source";
import { COMPUTED_PARAM_REFS, HTTP_METHODS, PARAM_INS, RESPONSE_KINDS } from "../interfaces/Source";
import { isSourceEndpointAccessMode } from "./access";
import { isForbiddenHeaderName, isValidHeaderName, isValidHeaderValue, MAX_ENDPOINT_HEADERS } from "./headerPolicy";
import { validateSourceTargetUrl } from "./sourceTargetUrl";

const RESPONSE_STATUS = /^[1-5][0-9][0-9]$/;

export function isValidResponseStatus(status: string): boolean {
    return status === "default" || RESPONSE_STATUS.test(status);
}

export function validateEndpoint(endpoint: SourceEndpoint, errors: string[]): void {
    if (!(HTTP_METHODS as readonly string[]).includes(endpoint.method)) {
        errors.push(`invalid method for "${endpoint.urn}": "${endpoint.method}"`);
    }
    validateAccess(endpoint, errors);
    const target = validateSourceTargetUrl(endpoint.targetUrl);
    if (!target.ok) errors.push(`invalid targetUrl for "${endpoint.urn}": "${endpoint.targetUrl}" (${target.reason})`);
    validateParams(endpoint, errors);
    validateResponseKind(endpoint, errors);
    validateHeaders(endpoint, errors);
    validateResponses(endpoint, errors);
}

function validateAccess(endpoint: SourceEndpoint, errors: string[]): void {
    if (endpoint.access === undefined) return;
    if (!isSourceEndpointAccessMode(endpoint.access.mode)) {
        errors.push(`invalid access mode for "${endpoint.urn}": "${(endpoint.access as { mode?: unknown }).mode}"`);
    }
}

function validateParams(endpoint: SourceEndpoint, errors: string[]): void {
    const seen = new Set<string>();
    for (const param of endpoint.input?.params ?? []) {
        if (!param.name) {
            errors.push(`param without name for "${endpoint.urn}"`);
            continue;
        }
        if (seen.has(param.name)) errors.push(`duplicate param for "${endpoint.urn}": "${param.name}"`);
        seen.add(param.name);
        if (!(PARAM_INS as readonly string[]).includes(param.in)) {
            errors.push(`invalid param location for "${endpoint.urn}": "${param.in}" (expected ${PARAM_INS.join("|")})`);
        }
        validateParamSource(endpoint, param, errors);
        if (param.in === "header" && (!isValidHeaderName(param.name) || isForbiddenHeaderName(param.name))) {
            errors.push(`forbidden or invalid header param for "${endpoint.urn}": "${param.name}"`);
        }
    }
}

function validateParamSource(endpoint: SourceEndpoint, param: EndpointParam, errors: string[]): void {
    if (param.source?.from === "computed") {
        if (param.in === "path") errors.push(`computed param is not supported for path in "${endpoint.urn}": "${param.name}"`);
        if (!(COMPUTED_PARAM_REFS as readonly string[]).includes(param.source.ref)) {
            errors.push(`invalid computed ref for "${endpoint.urn}": "${param.source.ref}"`);
        }
    } else if (param.source && param.source.from !== "request") {
        errors.push(`invalid param source for "${endpoint.urn}": "${(param.source as { from?: string }).from}"`);
    }
}

function validateResponseKind(endpoint: SourceEndpoint, errors: string[]): void {
    if (endpoint.responseKind !== undefined && !(RESPONSE_KINDS as readonly string[]).includes(endpoint.responseKind)) {
        errors.push(`invalid responseKind for "${endpoint.urn}": "${endpoint.responseKind}"`);
    }
    if (endpoint.mediaType !== undefined && !endpoint.mediaType.trim()) errors.push(`empty mediaType for "${endpoint.urn}"`);
}

function validateHeaders(endpoint: SourceEndpoint, errors: string[]): void {
    const headers = endpoint.headers ?? [];
    if (headers.length > MAX_ENDPOINT_HEADERS) {
        errors.push(`too many headers for "${endpoint.urn}": ${headers.length} (max ${MAX_ENDPOINT_HEADERS})`);
    }
    const seen = new Set<string>();
    for (const header of headers) {
        if (!isValidHeaderName(header.name) || isForbiddenHeaderName(header.name)) {
            errors.push(`forbidden or invalid header name for "${endpoint.urn}": "${header.name}"`);
            continue;
        }
        const key = header.name.toLowerCase();
        if (seen.has(key)) errors.push(`duplicate header for "${endpoint.urn}": "${header.name}"`);
        seen.add(key);
        validateHeaderSource(endpoint, header, errors);
    }
}

function validateHeaderSource(endpoint: SourceEndpoint, header: NonNullable<SourceEndpoint["headers"]>[number], errors: string[]): void {
    if (header.source.from === "static" && !isValidHeaderValue(header.source.value)) errors.push(`invalid header value for "${endpoint.urn}": "${header.name}"`);
    if (header.source.from === "secret" && !header.source.ref) errors.push(`secret header without ref for "${endpoint.urn}": "${header.name}"`);
    if (header.source.from === "secret") {
        const prefix = (header.source as { prefix?: unknown }).prefix;
        if (prefix !== undefined && (typeof prefix !== "string" || !isValidHeaderValue(prefix))) errors.push(`invalid header prefix for "${endpoint.urn}": "${header.name}"`);
    }
    if (header.source.from === "computed" && !(COMPUTED_PARAM_REFS as readonly string[]).includes(header.source.ref)) {
        errors.push(`invalid computed ref for "${endpoint.urn}": "${header.source.ref}"`);
    }
    if (!["static", "secret", "computed"].includes((header.source as { from?: string }).from ?? "")) {
        errors.push(`invalid header source for "${endpoint.urn}": "${(header.source as { from?: string }).from}"`);
    }
}

function validateResponses(endpoint: SourceEndpoint, errors: string[]): void {
    const seen = new Set<string>();
    for (const response of endpoint.output ?? []) {
        if (!isValidResponseStatus(response.status)) errors.push(`invalid response status for "${endpoint.urn}": "${response.status}" (expected an HTTP code or "default")`);
        if (seen.has(response.status)) errors.push(`duplicate response status for "${endpoint.urn}": "${response.status}"`);
        seen.add(response.status);
    }
}
