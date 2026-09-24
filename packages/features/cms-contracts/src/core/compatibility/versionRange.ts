import { compileVersionRange } from "./ranges/compile";
import { containsVersion } from "./ranges/intervals";
import { EXACT } from "./ranges/parse";
import { isVersionSetSubset } from "./ranges/sets";

export { parseVersionRange } from "./ranges/parse";

export type VersionRangeChange = "equivalent" | "expanded" | "restricted";

/** Matches stable versions and only the prerelease tuples explicitly admitted by a branch. */
export function satisfiesVersionRange(version: string, range: string): boolean {
    const accepted = compileVersionRange(range);
    if (!EXACT.test(version)) {
        return false;
    }
    const tuple = version.split(/[+-]/, 1)[0]!;
    const intervals = version.split("+", 1)[0]!.includes("-")
        ? (accepted.prereleases.get(tuple) ?? [])
        : accepted.stable;
    return intervals.some((interval) => containsVersion(interval, version));
}

/** True only when every version admitted by source is also admitted by target. */
export function isVersionRangeSubset(source: string, target: string): boolean {
    return isVersionSetSubset(compileVersionRange(source), compileVersionRange(target));
}

/** A restriction includes any lost version, even when other versions were added. */
export function compareVersionRanges(previous: string, next: string): VersionRangeChange {
    if (!isVersionRangeSubset(previous, next)) {
        return "restricted";
    }
    return isVersionRangeSubset(next, previous) ? "equivalent" : "expanded";
}
