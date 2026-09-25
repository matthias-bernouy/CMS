import {
    parseVersionRange as parseContractVersionRange,
    satisfiesVersionRange as satisfiesContractVersionRange,
} from "cms-repository/exports/contracts/compatibility";
import { translateContractError } from "../contractErrors";
import { ProviderManifestValidationError } from "../errors";

declare const versionRangeBrand: unique symbol;
export type VersionRange = string & { readonly [versionRangeBrand]: true };

const SEMVER_SOURCE =
    "(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\\+([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?";
const SEMVER_PATTERN = new RegExp(`^${SEMVER_SOURCE}$`);

export function parseSemVer(value: unknown, path: string): string {
    if (typeof value !== "string" || value.length > 128 || !SEMVER_PATTERN.test(value)) {
        throw new ProviderManifestValidationError("invalid_manifest", "must be canonical SemVer", path);
    }
    return value;
}

/** Providers use the same bounded range grammar and prerelease policy as contracts. */
export function parseVersionRange(value: unknown, path: string): VersionRange {
    try {
        return parseContractVersionRange(value, path) as VersionRange;
    } catch (error) {
        return translateContractError(error);
    }
}

export function satisfiesVersionRange(version: string, range: VersionRange): boolean {
    try {
        return satisfiesContractVersionRange(version, range);
    } catch (error) {
        return translateContractError(error);
    }
}
