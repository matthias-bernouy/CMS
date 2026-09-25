import { intersectIntervals, mergeIntervals, type VersionInterval } from "./intervals";
import { COMPARATOR, EXACT, parseVersionRange, PREFIX } from "./parse";

export interface VersionSet {
    readonly stable: readonly VersionInterval[];
    readonly prereleases: ReadonlyMap<string, readonly VersionInterval[]>;
}

export function compileVersionRange(range: string): VersionSet {
    const stable: VersionInterval[] = [];
    const prereleases = new Map<string, VersionInterval[]>();
    for (const branch of parseVersionRange(range, "$.versionRange").split(" || ")) {
        const { interval, versions } = compileBranch(branch);
        // Rounding a half-open bound up to its stable core preserves precisely the stable members.
        stable.push({ start: core(interval.start), end: interval.end === null ? null : core(interval.end) });
        for (const version of versions.filter((value) => value.includes("-"))) {
            const tuple = core(version);
            const accepted = intersectIntervals(interval, { start: `${tuple}-0`, end: tuple });
            prereleases.set(tuple, [...(prereleases.get(tuple) ?? []), accepted]);
        }
    }
    return {
        stable: mergeIntervals(stable),
        prereleases: new Map([...prereleases].map(([tuple, intervals]) => [tuple, mergeIntervals(intervals)])),
    };
}

function compileBranch(branch: string): { interval: VersionInterval; versions: string[] } {
    if (EXACT.test(branch)) {
        const version = withoutBuild(branch);
        return { interval: { start: version, end: successor(version) }, versions: [version] };
    }
    const prefix = branch.match(PREFIX);
    if (prefix) {
        const version = withoutBuild(prefix[2]!);
        return { interval: { start: version, end: maximum(version, prefix[1]!) }, versions: [version] };
    }
    let interval: VersionInterval = { start: "0.0.0-0", end: null };
    const versions: string[] = [];
    for (const part of branch.split(" ")) {
        const match = part.match(COMPARATOR)!;
        const version = withoutBuild(match[2]!);
        versions.push(version);
        interval = intersectIntervals(interval, comparatorInterval(match[1]!, version));
    }
    return { interval, versions };
}

function comparatorInterval(operator: string, version: string): VersionInterval {
    switch (operator) {
        case ">=":
            return { start: version, end: null };
        case ">":
            return { start: successor(version), end: null };
        case "<=":
            return { start: "0.0.0-0", end: successor(version) };
        case "<":
            return { start: "0.0.0-0", end: version };
        default:
            return { start: version, end: successor(version) };
    }
}

/** The smallest greater SemVer: prerelease extension .0 or the next patch's first prerelease. */
function successor(version: string): string {
    if (version.includes("-")) {
        return `${version}.0`;
    }
    const [major, minor, patch] = version.split(".");
    return `${major}.${minor}.${increment(patch!)}-0`;
}

function maximum(version: string, prefix: string): string {
    const [major, minor, patch] = core(version).split(".");
    if (prefix === "~") {
        return `${major}.${increment(minor!)}.0`;
    }
    if (major !== "0") {
        return `${increment(major!)}.0.0`;
    }
    return minor !== "0" ? `0.${increment(minor!)}.0` : `0.0.${increment(patch!)}`;
}

function increment(value: string): string {
    return (BigInt(value) + 1n).toString();
}

function core(version: string): string {
    return version.split("-", 1)[0]!;
}

function withoutBuild(version: string): string {
    return version.split("+", 1)[0]!;
}
