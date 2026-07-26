import type {
    IdentifiedVerificationJobResultV1,
    VerificationJobAttemptIdentityV1,
    VerificationJobResultV1,
} from "../../../interfaces/verification";
import { VERIFICATION_JOB_RESULT_SCHEMA } from "../../../interfaces/verification";
import { pinnedRunner } from "../../runner";
import { IntegrationVerificationContractError } from "../../validation/errors";
import { assertContractIJson, assertUnique, boundedArray, strictRecord } from "../../validation/structure";
import { positiveInteger, stableIdentifier } from "../../validation/values";
import { validateAdmissionInputSnapshotForPolicy } from "../admission";
import { validateReleaseAdmissionPolicySnapshot } from "../policy";
import {
    compareText,
    identifyCanonicalVerificationContract,
    invalidReference,
    parseVerificationControlDocument,
} from "../shared";
import { assertAttempt, assertBindings, assertRunnerAndSuites } from "./assertions";
import { parseBindings, parseEnvironment } from "./fields";
import { assertTotalDiagnosticLimit, parseSuiteResult } from "./suites";

export async function parseVerificationJobResult(input: string | Uint8Array): Promise<VerificationJobResultV1> {
    return await validateVerificationJobResult(parseVerificationControlDocument(input));
}

export async function validateVerificationJobResult(value: unknown): Promise<VerificationJobResultV1> {
    assertContractIJson(value);
    const input = strictRecord(value, "jobResult", [
        "schema",
        "candidateId",
        "jobId",
        "attemptId",
        "fencingToken",
        "bindings",
        "runner",
        "environment",
        "results",
    ]);
    if (input.schema !== VERIFICATION_JOB_RESULT_SCHEMA) {
        throw new IntegrationVerificationContractError(
            "invalid_schema",
            `jobResult.schema must be ${VERIFICATION_JOB_RESULT_SCHEMA}`,
            "jobResult.schema",
        );
    }
    const results = boundedArray(input.results, "jobResult.results", parseSuiteResult, { minimum: 1 }).toSorted(
        (left, right) => compareText(left.suiteId, right.suiteId),
    );
    assertUnique(
        results.map((entry) => entry.suiteId),
        "jobResult.results.suiteId",
    );
    assertTotalDiagnosticLimit(results);
    return {
        schema: VERIFICATION_JOB_RESULT_SCHEMA,
        candidateId: stableIdentifier(input.candidateId, "jobResult.candidateId"),
        jobId: stableIdentifier(input.jobId, "jobResult.jobId"),
        attemptId: stableIdentifier(input.attemptId, "jobResult.attemptId"),
        fencingToken: positiveInteger(input.fencingToken, "jobResult.fencingToken"),
        bindings: parseBindings(input.bindings),
        runner: pinnedRunner(input.runner, "jobResult.runner"),
        environment: await parseEnvironment(input.environment),
        results,
    };
}

export async function identifyVerificationJobResult(value: unknown): Promise<IdentifiedVerificationJobResultV1> {
    const result = await validateVerificationJobResult(value);
    const identified = await identifyCanonicalVerificationContract(result);
    return { result, canonicalBytes: identified.canonicalBytes, digest: identified.digest };
}

export async function validateVerificationJobResultForAdmission(
    value: unknown,
    admissionValue: unknown,
    policyValue: unknown,
    attempt: VerificationJobAttemptIdentityV1,
): Promise<IdentifiedVerificationJobResultV1> {
    const policy = await validateReleaseAdmissionPolicySnapshot(policyValue);
    const admission = await validateAdmissionInputSnapshotForPolicy(admissionValue, policy);
    const identified = await identifyVerificationJobResult(value);
    assertAttempt(identified.result, admission.snapshot, attempt);
    assertBindings(identified.result, admission.snapshot, admission.digest);
    assertRunnerAndSuites(identified.result, admission.snapshot, policy);
    return identified;
}

export async function assertVerificationJobResultReplay(
    existingValue: unknown,
    replayValue: unknown,
): Promise<IdentifiedVerificationJobResultV1> {
    const existing = await identifyVerificationJobResult(existingValue);
    const replay = await identifyVerificationJobResult(replayValue);
    if (
        existing.result.candidateId !== replay.result.candidateId ||
        existing.result.jobId !== replay.result.jobId ||
        existing.result.attemptId !== replay.result.attemptId ||
        existing.result.fencingToken !== replay.result.fencingToken
    ) {
        invalidReference("jobResult", "is not a replay of the same fenced attempt");
    }
    if (existing.digest !== replay.digest) {
        invalidReference("jobResult", "diverges from the result already accepted for this fenced attempt");
    }
    return existing;
}
