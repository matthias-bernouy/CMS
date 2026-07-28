import type {
    IdentifiedMigrationJobResultV1,
    MigrationJobAttemptIdentityV1,
    MigrationJobResultV1,
} from "../../../../interfaces/verification/migration";
import { MIGRATION_JOB_RESULT_SCHEMA } from "../../../../interfaces/verification/migration";
import { assertContractIJson, strictRecord } from "../../../validation/structure";
import { positiveInteger, sha256Digest, stableIdentifier } from "../../../validation/values";
import { identifyCanonicalVerificationContract, parseVerificationControlDocument } from "../../shared";
import { identifyMigrationVerificationInput } from "../input";
import {
    parseCutoverObservation,
    parseEquivalenceObservation,
    parseFailureObservations,
    parseLedgerObservation,
    parseReplayObservation,
    parseResumptionObservations,
    parseTargetObservation,
} from "../observations";
import { invalid } from "../shared";
import { assertRawObservationsMatchInput } from "./join";

export async function parseMigrationJobResult(input: string | Uint8Array): Promise<MigrationJobResultV1> {
    return validateMigrationJobResult(parseVerificationControlDocument(input));
}

export async function validateMigrationJobResult(value: unknown): Promise<MigrationJobResultV1> {
    assertContractIJson(value);
    const input = strictRecord(value, "migrationJobResult", [
        "schema",
        "jobId",
        "attemptId",
        "fencingToken",
        "migrationInputDigest",
        "runnerDigest",
        "environmentDigest",
        "observations",
    ]);
    if (input.schema !== MIGRATION_JOB_RESULT_SCHEMA) {
        invalid("migrationJobResult.schema", `must be ${MIGRATION_JOB_RESULT_SCHEMA}`);
    }
    const observations = strictRecord(input.observations, "migrationJobResult.observations", [
        "freshTarget",
        "migratedTarget",
        "equivalence",
        "ledger",
        "replay",
        "failureInjections",
        "resumptions",
        "cutover",
    ]);
    return {
        schema: MIGRATION_JOB_RESULT_SCHEMA,
        jobId: stableIdentifier(input.jobId, "migrationJobResult.jobId"),
        attemptId: stableIdentifier(input.attemptId, "migrationJobResult.attemptId"),
        fencingToken: positiveInteger(input.fencingToken, "migrationJobResult.fencingToken"),
        migrationInputDigest: sha256Digest(input.migrationInputDigest, "migrationJobResult.migrationInputDigest"),
        runnerDigest: sha256Digest(input.runnerDigest, "migrationJobResult.runnerDigest"),
        environmentDigest: sha256Digest(input.environmentDigest, "migrationJobResult.environmentDigest"),
        observations: {
            freshTarget: parseTargetObservation(
                observations.freshTarget,
                "migrationJobResult.observations.freshTarget",
            ),
            migratedTarget: parseTargetObservation(
                observations.migratedTarget,
                "migrationJobResult.observations.migratedTarget",
            ),
            equivalence: parseEquivalenceObservation(
                observations.equivalence,
                "migrationJobResult.observations.equivalence",
            ),
            ledger: parseLedgerObservation(observations.ledger, "migrationJobResult.observations.ledger"),
            replay: parseReplayObservation(observations.replay, "migrationJobResult.observations.replay"),
            failureInjections: parseFailureObservations(
                observations.failureInjections,
                "migrationJobResult.observations.failureInjections",
            ),
            resumptions: parseResumptionObservations(
                observations.resumptions,
                "migrationJobResult.observations.resumptions",
            ),
            cutover: parseCutoverObservation(observations.cutover, "migrationJobResult.observations.cutover"),
        },
    };
}

export async function identifyMigrationJobResult(value: unknown): Promise<IdentifiedMigrationJobResultV1> {
    const result = await validateMigrationJobResult(value);
    const identified = await identifyCanonicalVerificationContract(result);
    return { result, canonicalBytes: identified.canonicalBytes, digest: identified.digest };
}

export async function validateMigrationJobResultForInput(
    value: unknown,
    inputValue: unknown,
    attempt: MigrationJobAttemptIdentityV1,
): Promise<IdentifiedMigrationJobResultV1> {
    const input = await identifyMigrationVerificationInput(inputValue);
    const identified = await identifyMigrationJobResult(value);
    const result = identified.result;
    if (
        result.jobId !== attempt.jobId ||
        result.attemptId !== attempt.attemptId ||
        result.fencingToken !== attempt.fencingToken
    ) {
        invalid("migrationJobResult", "does not belong to the expected fenced attempt");
    }
    if (
        result.migrationInputDigest !== input.digest ||
        result.runnerDigest !== input.input.runner.digest ||
        result.environmentDigest !== input.input.environment.digest
    ) {
        invalid("migrationJobResult", "does not bind the exact migration input, runner, and environment");
    }
    assertRawObservationsMatchInput(result, input.input, attempt);
    return identified;
}
