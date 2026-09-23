export type VersionBump = "major" | "minor" | "patch";

interface ParsedSemVer {
    major: string;
    minor: string;
    patch: string;
    prerelease: readonly string[];
}

export function compareSemVer(left: string, right: string): number {
    const leftVersion = parse(left);
    const rightVersion = parse(right);
    for (const key of ["major", "minor", "patch"] as const) {
        const comparison = compareNumericIdentifier(leftVersion[key], rightVersion[key]);
        if (comparison !== 0) {
            return comparison;
        }
    }
    return comparePrerelease(leftVersion.prerelease, rightVersion.prerelease);
}

export function semVerMajor(version: string): string {
    return parse(version).major;
}

export function isSemVerPrerelease(version: string): boolean {
    return parse(version).prerelease.length > 0;
}

export function versionBump(previous: string, next: string): VersionBump | null {
    if (compareSemVer(next, previous) <= 0) {
        return null;
    }
    const before = parse(previous);
    const after = parse(next);
    if (after.major !== before.major) {
        return "major";
    }
    if (after.minor !== before.minor) {
        return "minor";
    }
    return "patch";
}

function parse(value: string): ParsedSemVer {
    const [withoutBuild] = value.split("+", 1);
    const separator = withoutBuild!.indexOf("-");
    const core = separator < 0 ? withoutBuild! : withoutBuild!.slice(0, separator);
    const prerelease = separator < 0 ? "" : withoutBuild!.slice(separator + 1);
    const [major, minor, patch] = core!.split(".");
    return { major: major!, minor: minor!, patch: patch!, prerelease: prerelease ? prerelease.split(".") : [] };
}

function comparePrerelease(left: readonly string[], right: readonly string[]): number {
    if (left.length === 0 || right.length === 0) {
        return left.length === right.length ? 0 : left.length === 0 ? 1 : -1;
    }
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
        const leftPart = left[index];
        const rightPart = right[index];
        if (leftPart === undefined || rightPart === undefined) {
            return leftPart === rightPart ? 0 : leftPart === undefined ? -1 : 1;
        }
        if (leftPart === rightPart) {
            continue;
        }
        const leftIsNumber = /^\d+$/.test(leftPart);
        const rightIsNumber = /^\d+$/.test(rightPart);
        if (leftIsNumber && rightIsNumber) {
            return compareNumericIdentifier(leftPart, rightPart);
        }
        if (leftIsNumber || rightIsNumber) {
            return leftIsNumber ? -1 : 1;
        }
        return leftPart < rightPart ? -1 : 1;
    }
    return 0;
}

function compareNumericIdentifier(left: string, right: string): number {
    if (left.length !== right.length) {
        return left.length < right.length ? -1 : 1;
    }
    return left === right ? 0 : left < right ? -1 : 1;
}
