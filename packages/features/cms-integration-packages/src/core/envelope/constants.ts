import type { IntegrationPackageLimits } from "../../interfaces/envelope";

export const DEFAULT_INTEGRATION_PACKAGE_LIMITS: Readonly<IntegrationPackageLimits> = Object.freeze({
    maxDepth: 32,
    maxDirectories: 4_096,
    maxFiles: 4_096,
    maxFileBytes: 16 * 1_024 * 1_024,
    maxDecodedBytes: 16 * 1_024 * 1_024,
    maxDocumentBytes: 32 * 1_024 * 1_024,
    maxPathBytes: 4_096,
    maxSegmentBytes: 255,
});

export function resolveIntegrationPackageLimits(
    overrides: Partial<IntegrationPackageLimits> = {},
): Readonly<IntegrationPackageLimits> {
    const limits = { ...DEFAULT_INTEGRATION_PACKAGE_LIMITS, ...overrides };
    for (const [name, value] of Object.entries(limits)) {
        if (!Number.isSafeInteger(value) || value <= 0) {
            throw new TypeError(`Integration package limit ${name} must be a positive safe integer`);
        }
    }
    return limits;
}
