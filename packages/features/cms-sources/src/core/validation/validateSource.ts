import type { Source } from "cms-sources/interfaces/Source";
import { isEndpointUrn, isSourceUrn, sourceUrnOf } from "cms-sources/core/system/urn";
import { isSystemSourceUrn } from "cms-sources/core/system/systemSources";
import { isValidResponseStatus, validateEndpoint } from "./sourceEndpointValidation";
import { validateSourceMediaEffects } from "./sourceMediaEffectValidation";
export {
    isAllowedSourceTargetUrl,
    validateSourceTargetUrl,
    type SourceTargetUrlValidationOptions,
} from "cms-sources/core/upstream/sourceTargetUrl";
export { isValidResponseStatus } from "./sourceEndpointValidation";

/** `true` if the endpoint urn belongs to the given source. */
export function endpointBelongsToSource(endpointUrn: string, sourceUrn: string): boolean {
    return sourceUrnOf(endpointUrn) === sourceUrn;
}

export function isParsableUrl(value: string): boolean {
    try {
        new URL(value);
        return true;
    } catch {
        return false;
    }
}

/**
 * Validates a source before storage. Returns the list of errors ([] = valid).
 * Pure — no I/O. Enforced unbypassably by `ValidatingSourceRepository`; callers
 * that want to fail a whole batch before writing (seed) call it directly.
 */
export function validateSource(source: Source): string[] {
    const errors: string[] = [];

    if (!isSourceUrn(source.urn)) {
        errors.push(`invalid source urn: "${source.urn}" (expected "urn:<id>")`);
    } else if (isSystemSourceUrn(source.urn)) {
        errors.push(`reserved system source urn: "${source.urn}"`);
    }

    const seen = new Set<string>();
    for (const endpoint of source.endpoints) {
        validateEndpointIdentity(endpoint, source.urn, seen, errors);
        validateEndpoint(endpoint, errors);
    }
    validateSourceMediaEffects(source, errors);

    return errors;
}

function validateEndpointIdentity(
    endpoint: { urn: string },
    sourceUrn: string,
    seen: Set<string>,
    errors: string[],
): void {
    if (!isEndpointUrn(endpoint.urn)) {
        errors.push(`invalid endpoint urn: "${endpoint.urn}" (expected "urn:<source>:<endpoint>")`);
    } else if (!endpointBelongsToSource(endpoint.urn, sourceUrn)) {
        errors.push(`endpoint "${endpoint.urn}" does not belong to source "${sourceUrn}"`);
    }

    if (seen.has(endpoint.urn)) {
        errors.push(`duplicate endpoint urn: "${endpoint.urn}"`);
    }
    seen.add(endpoint.urn);
}
