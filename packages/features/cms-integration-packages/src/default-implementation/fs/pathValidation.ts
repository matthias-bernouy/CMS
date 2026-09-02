import type { IntegrationPackageLimits } from "../../interfaces/envelope";

const utf8 = new TextEncoder();

export function assertPackagePathSegment(segment: string, limits: Readonly<IntegrationPackageLimits>): void {
    if (!segment || segment === "." || segment === ".." || segment.includes("\\") || segment.includes("\0")) {
        throw new Error(`Invalid integration package path segment: ${JSON.stringify(segment)}`);
    }
    if (utf8.encode(segment).byteLength > limits.maxSegmentBytes) {
        throw new Error(`Integration package path segment exceeds ${limits.maxSegmentBytes} UTF-8 bytes: ${segment}`);
    }
}

export function validateRootExclusions(
    entries: readonly string[] | undefined,
    limits: Readonly<IntegrationPackageLimits>,
): ReadonlySet<string> {
    const exclusions = new Set<string>();
    for (const entry of entries ?? []) {
        assertPackagePathSegment(entry, limits);
        if (entry.includes("/")) {
            throw new Error(`Integration package root exclusion must be a single path segment: ${entry}`);
        }
        exclusions.add(entry);
    }
    return exclusions;
}
