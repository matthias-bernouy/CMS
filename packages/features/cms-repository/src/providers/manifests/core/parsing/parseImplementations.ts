import { isReleaseDigest, type ReleaseDigest } from "cms-repository/exports/contracts/index";
import { ProviderManifestValidationError } from "../protocol/errors";
import { expectArray, expectRecord, expectString, compareOrdinal, rejectUnknownKeys, unique } from "../protocol/values";
import type { ProviderContractImplementation } from "../../interfaces/ProviderManifest";
import { parseSemVer } from "../versioning/versionRange";
import { parseRequirements } from "./parseRequirements";
import { parseDelegation } from "../delegation/parseDelegation";
import { parseIdentifier } from "./identifiers";

export function parseImplementations(
    value: unknown,
    path: string,
    maximum: number,
    maximumRequirements: number,
): ProviderContractImplementation[] {
    const implementations = expectArray(value, path, maximum).map((entry, index) =>
        parseImplementation(entry, `${path}[${index}]`, maximumRequirements),
    );
    if (implementations.length === 0) {
        throw new ProviderManifestValidationError("invalid_manifest", "must not be empty", path);
    }
    unique(
        implementations.map((implementation) => `${implementation.contractId}\u0000${implementation.version}`),
        path,
    );
    return implementations.sort(
        (left, right) =>
            compareOrdinal(left.contractId, right.contractId) || compareOrdinal(left.version, right.version),
    );
}

function parseImplementation(
    value: unknown,
    path: string,
    maximumRequirements: number,
): ProviderContractImplementation {
    const record = expectRecord(value, path);
    rejectUnknownKeys(record, ["contractId", "version", "digest", "requires", "delegation"], path);
    const requirements = parseRequirements(record.requires, `${path}.requires`, maximumRequirements);
    const delegation =
        record.delegation === undefined ? undefined : parseDelegation(record.delegation, `${path}.delegation`);
    const digest = expectString(record.digest, `${path}.digest`, 71);
    if (!isReleaseDigest(digest)) {
        throw new ProviderManifestValidationError(
            "invalid_manifest",
            "must be a SHA-256 release digest",
            `${path}.digest`,
        );
    }
    return {
        contractId: parseIdentifier(record.contractId, `${path}.contractId`, 96),
        version: parseSemVer(record.version, `${path}.version`),
        digest: digest as ReleaseDigest,
        requires: requirements,
        ...(delegation ? { delegation } : {}),
    };
}
