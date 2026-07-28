import type {
    IdentifiedReleaseAdmissionPolicySnapshotV1,
    ReleaseAdmissionPolicySnapshotV1,
} from "../../../interfaces/verification";
import { RELEASE_ADMISSION_POLICY_SNAPSHOT_SCHEMA } from "../../../interfaces/verification";
import { pinnedRunner, parseVerificationPolicyIdentity } from "../../runner";
import { IntegrationVerificationContractError } from "../../validation/errors";
import { assertContractIJson, assertUnique, boundedArray, strictRecord } from "../../validation/structure";
import {
    compareText,
    identifyCanonicalVerificationContract,
    invalidReference,
    parseVerificationControlDocument,
    samePinnedRunner,
} from "../shared";
import { parseCache, parseMigrationEvidence, parseRetry } from "./execution";
import {
    assertFindingRunnersApproved,
    compareFindingRule,
    compareRunner,
    parseFindingRule,
    parsePlatformSuite,
} from "./rules";

export async function parseReleaseAdmissionPolicySnapshot(
    input: string | Uint8Array,
): Promise<ReleaseAdmissionPolicySnapshotV1> {
    return await validateReleaseAdmissionPolicySnapshot(parseVerificationControlDocument(input));
}

export async function validateReleaseAdmissionPolicySnapshot(
    value: unknown,
): Promise<ReleaseAdmissionPolicySnapshotV1> {
    assertContractIJson(value);
    const input = strictRecord(value, "policy", [
        "schema",
        "identity",
        "staticEvaluator",
        "verificationPolicy",
        "migrationPolicy",
        "approvedRunners",
        "platformRequiredSuites",
        "findingResolutionRules",
        "retry",
        "cache",
        "migrationEvidence",
    ]);
    if (input.schema !== RELEASE_ADMISSION_POLICY_SNAPSHOT_SCHEMA) {
        throw new IntegrationVerificationContractError(
            "invalid_schema",
            `policy.schema must be ${RELEASE_ADMISSION_POLICY_SNAPSHOT_SCHEMA}`,
            "policy.schema",
        );
    }
    const approvedRunners = boundedArray(input.approvedRunners, "policy.approvedRunners", pinnedRunner, {
        minimum: 1,
    }).toSorted(compareRunner);
    assertUnique(
        approvedRunners.map((runner) => `${runner.name}@${runner.version}`),
        "policy.approvedRunners identity",
    );
    const platformRequiredSuites = boundedArray(
        input.platformRequiredSuites,
        "policy.platformRequiredSuites",
        parsePlatformSuite,
        { minimum: 1 },
    ).toSorted((left, right) => compareText(left.suiteId, right.suiteId));
    assertUnique(
        platformRequiredSuites.map((suite) => suite.suiteId),
        "policy.platformRequiredSuites.suiteId",
    );
    for (const suite of platformRequiredSuites) {
        if (!approvedRunners.some((runner) => samePinnedRunner(runner, suite.runner))) {
            invalidReference("policy.platformRequiredSuites.runner", "must be an exact approved runner");
        }
    }
    const findingResolutionRules = boundedArray(
        input.findingResolutionRules,
        "policy.findingResolutionRules",
        parseFindingRule,
    ).toSorted(compareFindingRule);
    assertUnique(
        findingResolutionRules.map((rule) => `${rule.surface}\0${rule.code}`),
        "policy.findingResolutionRules identity",
    );
    await assertFindingRunnersApproved(findingResolutionRules, approvedRunners);
    return {
        schema: RELEASE_ADMISSION_POLICY_SNAPSHOT_SCHEMA,
        identity: parseVerificationPolicyIdentity(input.identity, "policy.identity"),
        staticEvaluator: parseVerificationPolicyIdentity(input.staticEvaluator, "policy.staticEvaluator"),
        verificationPolicy: parseVerificationPolicyIdentity(input.verificationPolicy, "policy.verificationPolicy"),
        migrationPolicy: parseVerificationPolicyIdentity(input.migrationPolicy, "policy.migrationPolicy"),
        approvedRunners,
        platformRequiredSuites,
        findingResolutionRules,
        retry: parseRetry(input.retry),
        cache: parseCache(input.cache),
        migrationEvidence: parseMigrationEvidence(input.migrationEvidence),
    };
}

export async function identifyReleaseAdmissionPolicySnapshot(
    value: unknown,
): Promise<IdentifiedReleaseAdmissionPolicySnapshotV1> {
    const snapshot = await validateReleaseAdmissionPolicySnapshot(value);
    const identified = await identifyCanonicalVerificationContract(snapshot);
    return { snapshot, canonicalBytes: identified.canonicalBytes, digest: identified.digest };
}
