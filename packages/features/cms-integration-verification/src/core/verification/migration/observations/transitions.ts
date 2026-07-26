import type {
    MigrationFailureObservationV1,
    MigrationResumptionObservationV1,
} from "../../../../interfaces/verification/migration";
import { boundedArray } from "../../../validation/structure";
import { nonNegativeInteger, oneOf, requiredBoolean, stableIdentifier } from "../../../validation/values";
import {
    assertCanonicalUniqueOrder,
    assertObservationPayload,
    invalid,
    MAX_MIGRATION_OBSERVATIONS,
    optionalDigest,
    parseObservationEvidence,
} from "../shared";

export function parseFailureObservations(value: unknown, field: string): MigrationFailureObservationV1[] {
    const observations = boundedArray(value, field, parseFailure, { maximum: MAX_MIGRATION_OBSERVATIONS });
    assertCanonicalUniqueOrder(observations, field, (entry) => entry.boundary);
    return observations;
}

export function parseResumptionObservations(value: unknown, field: string): MigrationResumptionObservationV1[] {
    const observations = boundedArray(value, field, parseResumption, { maximum: MAX_MIGRATION_OBSERVATIONS });
    assertCanonicalUniqueOrder(observations, field, (entry) => entry.boundary);
    return observations;
}

function parseFailure(value: unknown, field: string): MigrationFailureObservationV1 {
    const { input, evidence } = parseObservationEvidence(value, field, [
        "boundary",
        "injected",
        "recovery",
        "recoveredStateDigest",
    ]);
    const boundary = stableIdentifier(input.boundary, `${field}.boundary`);
    const injected = requiredBoolean(input.injected, `${field}.injected`);
    const recovery = oneOf(input.recovery, `${field}.recovery`, [
        "safe-retry",
        "safe-resume",
        "operator-required",
        "not-observed",
    ] as const);
    const recoveredStateDigest = optionalDigest(input.recoveredStateDigest, `${field}.recoveredStateDigest`);
    if (evidence.status === "passed" || evidence.status === "failed") {
        if (!injected || recovery === "not-observed") {
            invalid(field, `must record an injected recovery when ${evidence.status}`);
        }
        const safe = recovery === "safe-retry" || recovery === "safe-resume";
        if ((evidence.status === "passed") !== safe) {
            invalid(field, "status contradicts the observed recovery class");
        }
    } else if (injected || recovery !== "not-observed" || recoveredStateDigest) {
        invalid(field, `must not claim failure-injection payload when ${evidence.status}`);
    }
    return { ...evidence, boundary, injected, recovery, ...(recoveredStateDigest ? { recoveredStateDigest } : {}) };
}

function parseResumption(value: unknown, field: string): MigrationResumptionObservationV1 {
    const { input, evidence } = parseObservationEvidence(value, field, [
        "boundary",
        "attempts",
        "staleFenceRejected",
        "resumedStateDigest",
        "expectedStateDigest",
        "matched",
    ]);
    const boundary = stableIdentifier(input.boundary, `${field}.boundary`);
    const attempts = nonNegativeInteger(input.attempts, `${field}.attempts`);
    const staleFenceRejected = optionalBoolean(input.staleFenceRejected, `${field}.staleFenceRejected`);
    const resumedStateDigest = optionalDigest(input.resumedStateDigest, `${field}.resumedStateDigest`);
    const expectedStateDigest = optionalDigest(input.expectedStateDigest, `${field}.expectedStateDigest`);
    const matched = optionalBoolean(input.matched, `${field}.matched`);
    const hasPayload = Boolean(
        attempts ||
            staleFenceRejected !== undefined ||
            resumedStateDigest ||
            expectedStateDigest ||
            matched !== undefined,
    );
    assertObservationPayload(evidence.status, field, hasPayload);
    if (evidence.status === "passed" || evidence.status === "failed") {
        if (
            attempts === 0 ||
            staleFenceRejected === undefined ||
            !resumedStateDigest ||
            !expectedStateDigest ||
            matched === undefined
        ) {
            invalid(field, `must contain complete resumption facts when ${evidence.status}`);
        }
        const safe = staleFenceRejected && matched && resumedStateDigest === expectedStateDigest;
        if ((evidence.status === "passed") !== safe) {
            invalid(field, "status contradicts the observed resumption facts");
        }
    }
    return {
        ...evidence,
        boundary,
        attempts,
        ...(staleFenceRejected === undefined ? {} : { staleFenceRejected }),
        ...(resumedStateDigest ? { resumedStateDigest } : {}),
        ...(expectedStateDigest ? { expectedStateDigest } : {}),
        ...(matched === undefined ? {} : { matched }),
    };
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
    return value === undefined ? undefined : requiredBoolean(value, field);
}
