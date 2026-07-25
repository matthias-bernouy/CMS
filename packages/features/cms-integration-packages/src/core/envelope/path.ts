import type { IntegrationPackageLimits } from "../../interfaces/envelope";
import { DEFAULT_INTEGRATION_PACKAGE_LIMITS, resolveIntegrationPackageLimits } from "./constants";
import { IntegrationPackageValidationError } from "./errors";

const utf8 = new TextEncoder();

export function assertIntegrationPackagePath(
    value: string,
    limits: Readonly<IntegrationPackageLimits> = DEFAULT_INTEGRATION_PACKAGE_LIMITS,
): string {
    const resolvedLimits = resolveIntegrationPackageLimits(limits);
    if (!value || value.includes("\\") || value.includes("\0") || value.startsWith("/") || /^[A-Za-z]:/.test(value)) {
        throw invalidPath(value, "must be a non-empty relative path using forward slashes");
    }
    const segments = value.split("/");
    if (segments.length > resolvedLimits.maxDepth) {
        throw invalidPath(value, `exceeds the maximum depth of ${resolvedLimits.maxDepth}`);
    }
    for (const segment of segments) {
        if (!segment || segment === "." || segment === "..") {
            throw invalidPath(value, "must not contain empty, dot, or dot-dot segments");
        }
        if (utf8.encode(segment).byteLength > resolvedLimits.maxSegmentBytes) {
            throw invalidPath(value, `contains a segment larger than ${resolvedLimits.maxSegmentBytes} bytes`);
        }
    }
    if (utf8.encode(value).byteLength > resolvedLimits.maxPathBytes) {
        throw invalidPath(value, `is larger than ${resolvedLimits.maxPathBytes} bytes`);
    }
    return value;
}

function invalidPath(value: string, reason: string): IntegrationPackageValidationError {
    return new IntegrationPackageValidationError("invalid_path", `file path ${JSON.stringify(value)} ${reason}`, value);
}
