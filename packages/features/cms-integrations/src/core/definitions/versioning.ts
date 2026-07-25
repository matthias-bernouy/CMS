import {
    diff,
    gt,
    major,
    minVersion,
    parse,
    prerelease,
    satisfies as semverSatisfies,
    subset,
    validRange,
} from "semver";

const CARET_OR_TILDE_RANGE = /^(\^|~)(\S+)$/;
const BOUNDED_RANGE = /^>=(\S+)\s+<(\S+)$/;

export function isExactIntegrationVersion(value: string): boolean {
    const parsed = parse(value);
    if (!parsed) {
        return false;
    }
    const canonical = `${parsed.version}${parsed.build.length ? `+${parsed.build.join(".")}` : ""}`;
    return canonical === value;
}

export function assertExactIntegrationVersion(value: string, source: string): string {
    if (!isExactIntegrationVersion(value)) {
        throw new Error(`${source} must be an exact SemVer 2.0 version`);
    }
    return value;
}

export function isIntegrationPrerelease(value: string): boolean {
    return isExactIntegrationVersion(value) && prerelease(value) !== null;
}

export function isSupportedIntegrationVersionRange(value: string): boolean {
    if (isExactIntegrationVersion(value)) {
        return true;
    }
    const prefixed = CARET_OR_TILDE_RANGE.exec(value);
    if (prefixed) {
        return isExactIntegrationVersion(prefixed[2]!);
    }
    const bounded = BOUNDED_RANGE.exec(value);
    if (!bounded || !isExactIntegrationVersion(bounded[1]!) || !isExactIntegrationVersion(bounded[2]!)) {
        return false;
    }
    return validRange(value) !== null && minVersion(value) !== null;
}

export function assertSupportedIntegrationVersionRange(value: string, source: string): string {
    if (!isSupportedIntegrationVersionRange(value)) {
        throw new Error(`${source} must be an exact, caret, tilde, or bounded comparator range such as >=1.2.0 <2.0.0`);
    }
    return value;
}

export function integrationVersionSatisfies(version: string, range: string): boolean {
    return (
        isExactIntegrationVersion(version) &&
        isSupportedIntegrationVersionRange(range) &&
        semverSatisfies(version, range)
    );
}

export type IntegrationVersionReleaseLevel = "patch" | "minor" | "major";

export function integrationVersionReleaseLevel(
    previousVersion: string,
    nextVersion: string,
): IntegrationVersionReleaseLevel | null {
    if (
        !isExactIntegrationVersion(previousVersion) ||
        !isExactIntegrationVersion(nextVersion) ||
        !gt(nextVersion, previousVersion)
    ) {
        return null;
    }
    const difference = diff(previousVersion, nextVersion);
    if (difference === "major" || difference === "premajor") {
        return "major";
    }
    if (difference === "minor" || difference === "preminor") {
        return "minor";
    }
    return "patch";
}

export function integrationVersionsShareMajor(left: string, right: string): boolean {
    return isExactIntegrationVersion(left) && isExactIntegrationVersion(right) && major(left) === major(right);
}

export function integrationVersionRangeContainsRange(container: string, candidate: string): boolean {
    return (
        isSupportedIntegrationVersionRange(container) &&
        isSupportedIntegrationVersionRange(candidate) &&
        subset(candidate, container)
    );
}
