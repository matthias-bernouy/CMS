import type { IntegrationPackageLimits } from "../../interfaces/envelope";
import type { CanonicalFileSetLimits } from "../../interfaces/fileSet";

export const DEFAULT_CANONICAL_FILE_SET_LIMITS: Readonly<CanonicalFileSetLimits> = Object.freeze({
    maxDepth: 32,
    maxDirectories: 4_096,
    maxFiles: 4_096,
    maxFileBytes: 16 * 1_024 * 1_024,
    maxDecodedBytes: 16 * 1_024 * 1_024,
    maxDocumentBytes: 32 * 1_024 * 1_024,
    maxPathBytes: 4_096,
    maxSegmentBytes: 255,
});

export function resolveCanonicalFileSetLimits(
    overrides: Partial<CanonicalFileSetLimits> = {},
): Readonly<CanonicalFileSetLimits> {
    return resolveLimits(DEFAULT_CANONICAL_FILE_SET_LIMITS, overrides, "Canonical file-set");
}

export const DEFAULT_INTEGRATION_PACKAGE_LIMITS: Readonly<IntegrationPackageLimits> = DEFAULT_CANONICAL_FILE_SET_LIMITS;

export function resolveIntegrationPackageLimits(
    overrides: Partial<IntegrationPackageLimits> = {},
): Readonly<IntegrationPackageLimits> {
    return resolveLimits(DEFAULT_INTEGRATION_PACKAGE_LIMITS, overrides, "Integration package");
}

function resolveLimits<T extends CanonicalFileSetLimits>(
    defaults: Readonly<T>,
    overrides: Partial<T>,
    label: string,
): Readonly<T> {
    const limits = { ...defaults, ...overrides };
    for (const [name, value] of Object.entries(limits)) {
        if (!Number.isSafeInteger(value) || value <= 0) {
            throw new TypeError(`${label} limit ${name} must be a positive safe integer`);
        }
    }
    return limits;
}
