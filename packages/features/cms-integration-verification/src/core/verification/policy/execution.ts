import type {
    MigrationEvidencePolicyV1,
    VerificationCachePolicyV1,
    VerificationRetryPolicyV1,
} from "../../../interfaces/verification";
import { IntegrationVerificationContractError } from "../../validation/errors";
import { assertUnique, boundedArray, strictRecord } from "../../validation/structure";
import { nonNegativeInteger, oneOf, positiveInteger, requiredBoolean } from "../../validation/values";
import { compareText } from "../shared";

const RELEASE_LEVELS = ["patch", "minor", "major"] as const;
const MIGRATION_CHECKS = ["fresh-install", "migrated-state", "equivalence", "failure-injection", "resumption"] as const;

export function parseRetry(value: unknown): VerificationRetryPolicyV1 {
    const input = strictRecord(value, "policy.retry", ["maximumAttempts", "retryableOutcomes"]);
    const maximumAttempts = positiveInteger(input.maximumAttempts, "policy.retry.maximumAttempts");
    const retryableOutcomes = boundedArray(input.retryableOutcomes, "policy.retry.retryableOutcomes", (entry, field) =>
        oneOf(entry, field, ["infrastructure-failure"] as const),
    );
    assertUnique(retryableOutcomes, "policy.retry.retryableOutcomes");
    if ((maximumAttempts === 1) !== (retryableOutcomes.length === 0)) {
        throw invalidPolicy("policy.retry", "must disable retries exactly when maximumAttempts is one");
    }
    return { maximumAttempts, retryableOutcomes };
}

export function parseCache(value: unknown): VerificationCachePolicyV1 {
    const input = strictRecord(value, "policy.cache", ["mode", "minimumConcordantRuns", "maximumAgeSeconds"]);
    const mode = oneOf(input.mode, "policy.cache.mode", ["disabled", "passed-only"] as const);
    const minimumConcordantRuns = positiveInteger(input.minimumConcordantRuns, "policy.cache.minimumConcordantRuns");
    const maximumAgeSeconds = nonNegativeInteger(input.maximumAgeSeconds, "policy.cache.maximumAgeSeconds");
    if (mode === "disabled" && (minimumConcordantRuns !== 1 || maximumAgeSeconds !== 0)) {
        throw invalidPolicy("policy.cache", "disabled mode requires one run and a zero maximum age");
    }
    if (mode === "passed-only" && (minimumConcordantRuns < 2 || maximumAgeSeconds === 0)) {
        throw invalidPolicy("policy.cache", "passed-only mode requires two concordant runs and a positive maximum age");
    }
    return { mode, minimumConcordantRuns, maximumAgeSeconds };
}

export function parseMigrationEvidence(value: unknown): MigrationEvidencePolicyV1 {
    const input = strictRecord(value, "policy.migrationEvidence", [
        "requiredForReleaseLevels",
        "requiredChecks",
        "requireExactSourcePackageDigest",
        "requireExactTargetPackageDigest",
        "requireCmsMediatedCutoverEvidence",
        "requireProviderDirectCutoverEvidence",
        "requireRollbackEvidence",
        "requireDelayedCleanupEvidence",
    ]);
    if (input.requireExactSourcePackageDigest !== true || input.requireExactTargetPackageDigest !== true) {
        throw invalidPolicy("policy.migrationEvidence", "must bind exact source and target package digests");
    }
    const requiredForReleaseLevels = sortedEnum(
        input.requiredForReleaseLevels,
        "requiredForReleaseLevels",
        RELEASE_LEVELS,
    );
    const requiredChecks = sortedEnum(input.requiredChecks, "requiredChecks", MIGRATION_CHECKS);
    if (requiredForReleaseLevels.length > 0) {
        for (const required of ["fresh-install", "migrated-state", "equivalence"] as const) {
            if (!requiredChecks.includes(required)) {
                throw invalidPolicy("policy.migrationEvidence.requiredChecks", `must include ${required}`);
            }
        }
    }
    return {
        requiredForReleaseLevels,
        requiredChecks,
        requireExactSourcePackageDigest: true,
        requireExactTargetPackageDigest: true,
        requireCmsMediatedCutoverEvidence: requiredBoolean(
            input.requireCmsMediatedCutoverEvidence,
            "policy.migrationEvidence.requireCmsMediatedCutoverEvidence",
        ),
        requireProviderDirectCutoverEvidence: requiredBoolean(
            input.requireProviderDirectCutoverEvidence,
            "policy.migrationEvidence.requireProviderDirectCutoverEvidence",
        ),
        requireRollbackEvidence: requiredBoolean(
            input.requireRollbackEvidence,
            "policy.migrationEvidence.requireRollbackEvidence",
        ),
        requireDelayedCleanupEvidence: requiredBoolean(
            input.requireDelayedCleanupEvidence,
            "policy.migrationEvidence.requireDelayedCleanupEvidence",
        ),
    };
}

function sortedEnum<const T extends readonly string[]>(value: unknown, name: string, allowed: T): T[number][] {
    const field = `policy.migrationEvidence.${name}`;
    const result = boundedArray(value, field, (entry, entryField) => oneOf(entry, entryField, allowed)).toSorted(
        compareText,
    );
    assertUnique(result, field);
    return result;
}

function invalidPolicy(field: string, message: string): IntegrationVerificationContractError {
    return new IntegrationVerificationContractError("invalid_contract", `${field} ${message}`, field);
}
