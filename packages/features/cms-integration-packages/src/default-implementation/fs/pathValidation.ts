import { isAbsolute, relative, sep } from "node:path";
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

export function assertPackagePathBytes(path: string, limits: Readonly<IntegrationPackageLimits>): void {
    if (utf8.encode(path).byteLength > limits.maxPathBytes) {
        throw new Error(`Integration package path exceeds ${limits.maxPathBytes} UTF-8 bytes: ${path}`);
    }
}

export function assertWithinPackageRoot(root: string, target: string, source: string): void {
    const relation = relative(root, target);
    if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
        throw new Error(`Integration package path escapes its root: ${source}`);
    }
}

export function isExcludedPackagePath(path: string, prefixes: ReadonlySet<string>): boolean {
    return [...prefixes].some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
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

export function validatePathPrefixExclusions(
    entries: readonly string[] | undefined,
    limits: Readonly<IntegrationPackageLimits>,
): ReadonlySet<string> {
    const exclusions = new Set<string>();
    for (const entry of entries ?? []) {
        const segments = entry.split("/");
        for (const segment of segments) {
            assertPackagePathSegment(segment, limits);
        }
        const canonical = segments.join("/");
        if (canonical !== entry || utf8.encode(entry).byteLength > limits.maxPathBytes) {
            throw new Error(`Invalid integration package path exclusion: ${entry}`);
        }
        exclusions.add(entry);
    }
    return exclusions;
}
