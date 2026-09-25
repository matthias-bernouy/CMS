import { isReleaseDigest, type ReleaseDigest } from "cms-repository/exports/contracts/index";
import { ProviderManifestValidationError } from "../errors";
import {
    expectArray,
    expectBoolean,
    expectRecord,
    expectString,
    compareOrdinal,
    rejectUnknownKeys,
    unique,
} from "../values";
import type { ProviderCapabilityRequirement, ProviderContractImplementation } from "../../interfaces/ProviderManifest";
import { parseSemVer, parseVersionRange } from "../versioning/versionRange";
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
    rejectUnknownKeys(record, ["contractId", "version", "digest", "requires"], path);
    const requirements = expectArray(record.requires, `${path}.requires`, maximumRequirements).map(
        (requirement, index) => parseRequirement(requirement, `${path}.requires[${index}]`),
    );
    unique(
        requirements.map((requirement) => `${requirement.contractId}\u0000${requirement.capabilityId}`),
        `${path}.requires`,
    );
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
        requires: requirements.sort((left, right) =>
            compareOrdinal(
                `${left.contractId}\u0000${left.capabilityId}`,
                `${right.contractId}\u0000${right.capabilityId}`,
            ),
        ),
    };
}

function parseRequirement(value: unknown, path: string): ProviderCapabilityRequirement {
    const record = expectRecord(value, path);
    rejectUnknownKeys(record, ["contractId", "versionRange", "capabilityId", "optional"], path);
    return {
        contractId: parseIdentifier(record.contractId, `${path}.contractId`, 96),
        versionRange: parseVersionRange(record.versionRange, `${path}.versionRange`),
        capabilityId: parseIdentifier(record.capabilityId, `${path}.capabilityId`, 128),
        optional: expectBoolean(record.optional, `${path}.optional`),
    };
}
