import type { IntegrationPackageLimits } from "../../interfaces/envelope";
import type { CanonicalFileSetLimits } from "../../interfaces/fileSet";
import {
    DEFAULT_CANONICAL_FILE_SET_LIMITS,
    DEFAULT_INTEGRATION_PACKAGE_LIMITS,
    resolveCanonicalFileSetLimits,
    resolveIntegrationPackageLimits,
} from "./constants";
import { IntegrationPackageValidationError } from "./errors";

const utf8 = new TextEncoder();

export function assertCanonicalFilePath(
    value: string,
    limits: Readonly<CanonicalFileSetLimits> = DEFAULT_CANONICAL_FILE_SET_LIMITS,
): string {
    const resolvedLimits = resolveCanonicalFileSetLimits(limits);
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

export function assertIntegrationPackagePath(
    value: string,
    limits: Readonly<IntegrationPackageLimits> = DEFAULT_INTEGRATION_PACKAGE_LIMITS,
): string {
    return assertCanonicalFilePath(value, resolveIntegrationPackageLimits(limits));
}

export function assertCanonicalFileLayout(
    filePath: string,
    filePaths: ReadonlySet<string>,
    directoryPaths: Set<string>,
    maxDirectories: number,
): void {
    if (directoryPaths.has(filePath)) {
        throw new IntegrationPackageValidationError(
            "invalid_path",
            `file path collides with a directory ${JSON.stringify(filePath)}`,
            filePath,
        );
    }
    const segments = filePath.split("/");
    for (let length = 1; length < segments.length; length += 1) {
        const directory = segments.slice(0, length).join("/");
        if (filePaths.has(directory)) {
            throw new IntegrationPackageValidationError(
                "invalid_path",
                `directory path collides with a file ${JSON.stringify(directory)}`,
                filePath,
            );
        }
        directoryPaths.add(directory);
        if (directoryPaths.size + 1 > maxDirectories) {
            throw new IntegrationPackageValidationError(
                "directory_limit_exceeded",
                `files require more than ${maxDirectories} directories`,
                "files",
            );
        }
    }
}

export function assertIntegrationPackageFileLayout(
    filePath: string,
    filePaths: ReadonlySet<string>,
    directoryPaths: Set<string>,
    maxDirectories: number,
): void {
    assertCanonicalFileLayout(filePath, filePaths, directoryPaths, maxDirectories);
}

function invalidPath(value: string, reason: string): IntegrationPackageValidationError {
    return new IntegrationPackageValidationError("invalid_path", `file path ${JSON.stringify(value)} ${reason}`, value);
}
