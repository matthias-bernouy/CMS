import type { ConformanceDependencyProfile, ConformanceDependencyRelease } from "../../../interfaces/Conformance";
import type { AdmittedContractRelease } from "../../admission/admitContractRelease";
import { isReleaseDigest } from "../../admission/digest";
import { parseIdentifier, parseSemVer } from "../../parsing/identifiers";
import { ReleaseValidationError } from "../../protocol/errors";
import type { ReleaseLimits } from "../../protocol/limits";
import { expectArray, expectRecord, rejectUnknownKeys } from "../../protocol/values";

export function parseDependencyProfiles(
    value: unknown,
    limits: Readonly<ReleaseLimits>,
): readonly ConformanceDependencyProfile[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    const path = "$.dependencyProfiles";
    const source = expectArray(value, path, "invalid_contract");
    if (!source.length || source.length > limits.maxConformanceDependencyProfiles) {
        throw new ReleaseValidationError("invalid_contract", "dependency profiles must be nonempty and bounded", path);
    }
    const profiles = source.map((item, index) => {
        const itemPath = `${path}[${index}]`;
        const record = expectRecord(item, itemPath, "invalid_contract");
        rejectUnknownKeys(record, ["id", "releases"], itemPath, "invalid_contract");
        const entries = expectArray(record.releases, `${itemPath}.releases`, "invalid_contract");
        if (!entries.length || entries.length > limits.maxConformanceDependenciesPerProfile) {
            throw new ReleaseValidationError(
                "invalid_contract",
                "dependency releases must be nonempty and bounded",
                itemPath,
            );
        }
        const releases = entries.map((entry, releaseIndex) =>
            parseReference(entry, `${itemPath}.releases[${releaseIndex}]`),
        );
        if (new Set(releases.map((release) => release.contractId)).size !== releases.length) {
            throw new ReleaseValidationError(
                "invalid_contract",
                "a profile selects one release per dependency contract",
                itemPath,
            );
        }
        return {
            id: parseIdentifier(record.id, `${itemPath}.id`),
            releases: releases.sort((a, b) => ordinal(a.contractId, b.contractId)),
        };
    });
    if (new Set(profiles.map((profile) => profile.id)).size !== profiles.length) {
        throw new ReleaseValidationError("invalid_contract", "duplicate dependency profile IDs", path);
    }
    const selections = profiles.map((profile) => profile.releases.map((release) => release.digest).join("\u0000"));
    if (new Set(selections).size !== selections.length) {
        throw new ReleaseValidationError("invalid_contract", "duplicate dependency profile selections", path);
    }
    return profiles.sort((a, b) => ordinal(a.id, b.id));
}

/** The caller supplies admitted artifacts; asynchronous suite admission verifies their integrity again. */
export function indexDependencyContext(
    dependencies: readonly AdmittedContractRelease[],
    limits: Readonly<ReleaseLimits>,
): ReadonlyMap<string, AdmittedContractRelease> {
    if (dependencies.length > limits.maxConformanceDependencyProfiles * limits.maxConformanceDependenciesPerProfile) {
        throw new ReleaseValidationError("invalid_contract", "too many conformance dependency artifacts");
    }
    const byDigest = new Map<string, AdmittedContractRelease>();
    for (const dependency of dependencies) {
        if (byDigest.has(dependency.digest)) {
            throw new ReleaseValidationError("invalid_contract", "duplicate conformance dependency artifact");
        }
        byDigest.set(dependency.digest, dependency);
    }
    return byDigest;
}

function parseReference(value: unknown, path: string): ConformanceDependencyRelease {
    const record = expectRecord(value, path, "invalid_contract");
    rejectUnknownKeys(record, ["contractId", "version", "digest"], path, "invalid_contract");
    if (typeof record.digest !== "string" || !isReleaseDigest(record.digest)) {
        throw new ReleaseValidationError("invalid_contract", "invalid dependency release digest", `${path}.digest`);
    }
    return {
        contractId: parseIdentifier(record.contractId, `${path}.contractId`, 96),
        version: parseSemVer(record.version, `${path}.version`),
        digest: record.digest,
    };
}

function ordinal(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
