import type {
    CandidateAdmissionJobResultV1,
    IdentifiedCandidateAdmissionJobResultV1,
    MigrationJobAttemptIdentityV1,
} from "../../../interfaces/verification/migration";
import { CANDIDATE_ADMISSION_JOB_RESULT_SCHEMA } from "../../../interfaces/verification/migration";
import { assertContractIJson, boundedArray, strictRecord } from "../../validation/structure";
import { validateAdmissionInputSnapshotForPolicy } from "../admission";
import { identifyReleaseAdmissionPolicySnapshot } from "../policy";
import { validateVerificationJobResult, validateVerificationJobResultForAdmission } from "../result";
import { identifyCanonicalVerificationContract, parseVerificationControlDocument, samePinnedRunner } from "../shared";
import { identifyMigrationVerificationInput } from "./input";
import { validateMigrationJobResult, validateMigrationJobResultForInput } from "./result";
import { assertCanonicalUniqueOrder, invalid, MAX_MIGRATION_OBSERVATIONS } from "./shared";

export async function parseCandidateAdmissionJobResult(
    input: string | Uint8Array,
): Promise<CandidateAdmissionJobResultV1> {
    return await validateCandidateAdmissionJobResult(parseVerificationControlDocument(input));
}

export async function validateCandidateAdmissionJobResult(value: unknown): Promise<CandidateAdmissionJobResultV1> {
    assertContractIJson(value);
    const input = strictRecord(value, "candidateAdmissionJobResult", ["schema", "verification", "migrations"]);
    if (input.schema !== CANDIDATE_ADMISSION_JOB_RESULT_SCHEMA) {
        invalid("candidateAdmissionJobResult.schema", `must be ${CANDIDATE_ADMISSION_JOB_RESULT_SCHEMA}`);
    }
    const verification = await validateVerificationJobResult(input.verification);
    const migrations = await Promise.all(
        boundedArray(
            input.migrations,
            "candidateAdmissionJobResult.migrations",
            async (entry) => {
                return await validateMigrationJobResult(entry);
            },
            { maximum: MAX_MIGRATION_OBSERVATIONS },
        ),
    );
    assertCanonicalUniqueOrder(
        migrations,
        "candidateAdmissionJobResult.migrations",
        (entry) => entry.migrationInputDigest,
    );
    for (const migration of migrations) {
        if (
            migration.jobId !== verification.jobId ||
            migration.attemptId !== verification.attemptId ||
            migration.fencingToken !== verification.fencingToken
        ) {
            invalid("candidateAdmissionJobResult.migrations", "must share the verification fenced attempt");
        }
    }
    return { schema: CANDIDATE_ADMISSION_JOB_RESULT_SCHEMA, verification, migrations };
}

export async function identifyCandidateAdmissionJobResult(
    value: unknown,
): Promise<IdentifiedCandidateAdmissionJobResultV1> {
    const result = await validateCandidateAdmissionJobResult(value);
    const identified = await identifyCanonicalVerificationContract(result);
    return { result, canonicalBytes: identified.canonicalBytes, digest: identified.digest };
}

export async function validateCandidateAdmissionJobResultForPlan(
    value: unknown,
    migrationInputs: readonly unknown[],
    admissionValue: unknown,
    policyValue: unknown,
    attempt: MigrationJobAttemptIdentityV1,
): Promise<IdentifiedCandidateAdmissionJobResultV1> {
    const policy = await identifyReleaseAdmissionPolicySnapshot(policyValue);
    const admission = await validateAdmissionInputSnapshotForPolicy(admissionValue, policy.snapshot);
    const result = await identifyCandidateAdmissionJobResult(value);
    await validateVerificationJobResultForAdmission(
        result.result.verification,
        admission.snapshot,
        policy.snapshot,
        attempt,
    );
    const inputs = await Promise.all(migrationInputs.map(identifyMigrationVerificationInput));
    assertCanonicalUniqueOrder(inputs, "migrationVerificationInputs", (entry) => entry.digest);
    if (
        result.result.migrations.length !== inputs.length ||
        result.result.migrations.some((entry, index) => entry.migrationInputDigest !== inputs[index]?.digest)
    ) {
        invalid("candidateAdmissionJobResult.migrations", "must match the exact planned migration inputs");
    }
    for (const [index, input] of inputs.entries()) {
        assertInputMatchesAdmission(input.input, input.digest, admission.snapshot, policy.digest);
        await validateMigrationJobResultForInput(result.result.migrations[index], input.input, attempt);
    }
    return result;
}

function assertInputMatchesAdmission(
    input: Awaited<ReturnType<typeof identifyMigrationVerificationInput>>["input"],
    inputDigest: string,
    admission: Awaited<ReturnType<typeof validateAdmissionInputSnapshotForPolicy>>["snapshot"],
    policyDigest: string,
): void {
    if (
        input.target.kind !== admission.candidate.kind ||
        input.target.version !== admission.candidate.version ||
        input.target.packageDigest !== admission.candidate.packageDigest ||
        input.policy.digest !== policyDigest ||
        !samePinnedRunner(input.runner.identity, admission.selectedRunner)
    ) {
        invalid("migrationVerificationInputs", `input ${inputDigest} is not bound to the admission snapshot`);
    }
    for (const matrix of input.dependencyMatrices) {
        const expected = admission.dependencies.filter((entry) => entry.selection === matrix.selection);
        const expectedKeys = expected.map(dependencyKey).toSorted();
        const actualKeys = matrix.dependencies.map(dependencyKey).toSorted();
        if (
            expectedKeys.length !== actualKeys.length ||
            expectedKeys.some((entry, index) => entry !== actualKeys[index])
        ) {
            invalid(
                "migrationVerificationInputs",
                `input ${inputDigest} substitutes the ${matrix.selection} dependency graph`,
            );
        }
    }
}

function dependencyKey(value: Readonly<{ kind: string; version: string; packageDigest: string }>): string {
    return `${value.kind}\0${value.version}\0${value.packageDigest}`;
}
