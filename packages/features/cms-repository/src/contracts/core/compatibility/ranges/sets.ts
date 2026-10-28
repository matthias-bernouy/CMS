import type { VersionSet } from "./compile";
import { coversIntervals } from "./intervals";

export function isVersionSetSubset(source: VersionSet, target: VersionSet): boolean {
    return (
        coversIntervals(target.stable, source.stable) &&
        [...source.prereleases].every(([tuple, intervals]) =>
            coversIntervals(target.prereleases.get(tuple) ?? [], intervals),
        )
    );
}
