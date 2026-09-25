import type { VersionSet } from "./compile";
import { coversIntervals, mergeIntervals, type VersionInterval } from "./intervals";

export function isVersionSetSubset(source: VersionSet, target: VersionSet): boolean {
    return (
        coversIntervals(target.stable, source.stable) &&
        [...source.prereleases].every(([tuple, intervals]) =>
            coversIntervals(target.prereleases.get(tuple) ?? [], intervals),
        )
    );
}

export function isVersionSetEmpty(set: VersionSet): boolean {
    return set.stable.length === 0 && [...set.prereleases.values()].every((intervals) => intervals.length === 0);
}

/** Union already compiled sets, without imposing one authored range's syntax limits on the combined result. */
export function unionVersionSets(sets: readonly VersionSet[]): VersionSet {
    const prereleases = new Map<string, VersionInterval[]>();
    for (const set of sets) {
        for (const [tuple, intervals] of set.prereleases) {
            prereleases.set(tuple, [...(prereleases.get(tuple) ?? []), ...intervals]);
        }
    }
    return {
        stable: mergeIntervals(sets.flatMap((set) => set.stable)),
        prereleases: new Map([...prereleases].map(([tuple, intervals]) => [tuple, mergeIntervals(intervals)])),
    };
}
