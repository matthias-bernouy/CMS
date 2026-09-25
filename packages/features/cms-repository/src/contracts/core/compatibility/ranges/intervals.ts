import { compareSemVer } from "../semver";

/** Half-open SemVer interval; null is an unbounded upper endpoint. */
export interface VersionInterval {
    readonly start: string;
    readonly end: string | null;
}

export function intersectIntervals(left: VersionInterval, right: VersionInterval): VersionInterval {
    return {
        start: compareSemVer(left.start, right.start) > 0 ? left.start : right.start,
        end: compareEnds(left.end, right.end) < 0 ? left.end : right.end,
    };
}

export function mergeIntervals(intervals: readonly VersionInterval[]): VersionInterval[] {
    const result: VersionInterval[] = [];
    for (const interval of intervals.filter(nonempty).sort((left, right) => compareSemVer(left.start, right.start))) {
        const previous = result.at(-1);
        if (previous && (previous.end === null || compareSemVer(previous.end, interval.start) >= 0)) {
            result[result.length - 1] = {
                start: previous.start,
                end: compareEnds(previous.end, interval.end) > 0 ? previous.end : interval.end,
            };
        } else {
            result.push(interval);
        }
    }
    return result;
}

export function coversIntervals(target: readonly VersionInterval[], source: readonly VersionInterval[]): boolean {
    return source.every((interval) =>
        target.some(
            (candidate) =>
                compareSemVer(candidate.start, interval.start) <= 0 && compareEnds(candidate.end, interval.end) >= 0,
        ),
    );
}

export function containsVersion(interval: VersionInterval, version: string): boolean {
    return (
        compareSemVer(version, interval.start) >= 0 &&
        (interval.end === null || compareSemVer(version, interval.end) < 0)
    );
}

function nonempty(interval: VersionInterval): boolean {
    return interval.end === null || compareSemVer(interval.start, interval.end) < 0;
}

function compareEnds(left: string | null, right: string | null): number {
    if (left === null || right === null) {
        return left === right ? 0 : left === null ? 1 : -1;
    }
    return compareSemVer(left, right);
}
