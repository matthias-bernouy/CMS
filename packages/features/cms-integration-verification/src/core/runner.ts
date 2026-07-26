import { integrationVersionSatisfies } from "@bernouy/cms-integrations";
import type {
    PinnedVerificationRunnerIdentity,
    VerificationPolicyIdentity,
    VerificationRunnerRequirement,
} from "../interfaces/runner";
import { assertContractIJson, strictRecord } from "./validation/structure";
import {
    exactVersion,
    imageDigest,
    stableIdentifier,
    supportedVersionRange,
    versionedIdentity,
} from "./validation/values";

export function parsePinnedVerificationRunnerIdentity(value: unknown): PinnedVerificationRunnerIdentity {
    assertContractIJson(value);
    return pinnedRunner(value, "runner");
}

export function pinnedRunner(value: unknown, field: string): PinnedVerificationRunnerIdentity {
    const record = strictRecord(value, field, ["name", "version", "imageDigest"]);
    return {
        name: stableIdentifier(record.name, `${field}.name`),
        version: exactVersion(record.version, `${field}.version`),
        imageDigest: imageDigest(record.imageDigest, `${field}.imageDigest`),
    };
}

export function parseVerificationRunnerRequirement(
    value: unknown,
    field = "runnerRequirement",
): VerificationRunnerRequirement {
    const record = strictRecord(value, field, ["name", "versionRange"]);
    return {
        name: stableIdentifier(record.name, `${field}.name`),
        versionRange: supportedVersionRange(record.versionRange, `${field}.versionRange`),
    };
}

export function parseVerificationPolicyIdentity(value: unknown, field = "policy"): VerificationPolicyIdentity {
    return versionedIdentity(value, field);
}

export function runnerSatisfiesRequirement(
    runner: PinnedVerificationRunnerIdentity,
    requirement: VerificationRunnerRequirement,
): boolean {
    return runner.name === requirement.name && integrationVersionSatisfies(runner.version, requirement.versionRange);
}
