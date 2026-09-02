import type { SourceEndpoint } from "cms-sources/interfaces/Source";
import { HTTP_METHODS, MAX_SOURCE_ENDPOINT_TIMEOUT_MS, RESPONSE_KINDS } from "cms-sources/interfaces/Source";
import { isSourceEndpointAccessMode } from "cms-sources/core/execution/access";
import { dataShapeAtPath } from "cms-sources/core/validation/parseDataShape";
import { validateTriggerResponse } from "cms-sources/core/response-projection/validateTriggerResponse";
import {
    type SourceTargetUrlValidationOptions,
    validateSourceTargetUrl,
} from "cms-sources/core/upstream/sourceTargetUrl";
import { validateHeaders, validateParams } from "cms-sources/core/validation/sourceRequestValidation";

const RESPONSE_STATUS = /^[1-5][0-9][0-9]$/;

export function isValidResponseStatus(status: string): boolean {
    return status === "default" || RESPONSE_STATUS.test(status);
}

export function validateEndpoint(
    endpoint: SourceEndpoint,
    errors: string[],
    targetOptions: SourceTargetUrlValidationOptions = {},
): void {
    if (!(HTTP_METHODS as readonly string[]).includes(endpoint.method)) {
        errors.push(`invalid method for "${endpoint.urn}": "${endpoint.method}"`);
    }
    validateTimeout(endpoint, errors);
    validateAccess(endpoint, errors);
    const target = validateSourceTargetUrl(endpoint.targetUrl, targetOptions);
    if (!target.ok) {
        errors.push(`invalid targetUrl for "${endpoint.urn}": ${target.reason}`);
    }
    validateParams(endpoint, errors);
    validateResponseKind(endpoint, errors);
    validateHeaders(endpoint, errors);
    validateResponses(endpoint, errors);
    validateIdentityBindings(endpoint, errors);
}

function validateTimeout(endpoint: SourceEndpoint, errors: string[]): void {
    if (endpoint.timeoutMs === undefined) {
        return;
    }
    if (
        !Number.isSafeInteger(endpoint.timeoutMs) ||
        endpoint.timeoutMs < 1 ||
        endpoint.timeoutMs > MAX_SOURCE_ENDPOINT_TIMEOUT_MS
    ) {
        errors.push(
            `invalid timeoutMs for "${endpoint.urn}": expected an integer between 1 and ${MAX_SOURCE_ENDPOINT_TIMEOUT_MS}`,
        );
    }
}

function validateIdentityBindings(endpoint: SourceEndpoint, errors: string[]): void {
    for (const binding of endpoint.effects?.identityBindings ?? []) {
        if (!binding.responsePath.trim()) {
            errors.push(`empty identity binding path for "${endpoint.urn}"`);
            continue;
        }
        const shapes = (endpoint.output ?? []).map((output) => dataShapeAtPath(output.body, binding.responsePath));
        if (!shapes.some((shape) => shape?.semantic?.kind === "user-id" && shape.semantic.authority)) {
            errors.push(
                `identity binding path is not a qualified user-id for "${endpoint.urn}": "${binding.responsePath}"`,
            );
        }
    }
}

function validateAccess(endpoint: SourceEndpoint, errors: string[]): void {
    if (endpoint.access === undefined) {
        return;
    }
    if (!isSourceEndpointAccessMode(endpoint.access.mode)) {
        errors.push(`invalid access mode for "${endpoint.urn}": "${(endpoint.access as { mode?: unknown }).mode}"`);
    }
}

function validateResponseKind(endpoint: SourceEndpoint, errors: string[]): void {
    if (endpoint.responseKind !== undefined && !(RESPONSE_KINDS as readonly string[]).includes(endpoint.responseKind)) {
        errors.push(`invalid responseKind for "${endpoint.urn}": "${endpoint.responseKind}"`);
    }
    if (endpoint.mediaType !== undefined && !endpoint.mediaType.trim()) {
        errors.push(`empty mediaType for "${endpoint.urn}"`);
    }
}

function validateResponses(endpoint: SourceEndpoint, errors: string[]): void {
    if (!endpoint.output?.length) {
        errors.push(`missing response contract for "${endpoint.urn}"`);
        return;
    }
    const seen = new Set<string>();
    for (const response of endpoint.output) {
        if (!isValidResponseStatus(response.status)) {
            errors.push(
                `invalid response status for "${endpoint.urn}": "${response.status}" (expected an HTTP code or "default")`,
            );
        }
        if (seen.has(response.status)) {
            errors.push(`duplicate response status for "${endpoint.urn}": "${response.status}"`);
        }
        validateTriggerResponse(endpoint, response, errors);
        seen.add(response.status);
    }
}
