import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    validateIntegrationCandidateEnvelope,
    validateVerificationJobResult,
    type ValidatedIntegrationCandidateEnvelopeV1,
    type VerificationJobResultV1,
} from "@bernouy/cms-integration-verification";
import {
    readRepositoryManagementJsonDocument,
    RepositoryManagementJsonBodyError,
} from "cms-repository-management/operations/jsonBody";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

export class RepositoryCandidateRequestError extends Error {
    override readonly name = "RepositoryCandidateRequestError";
}

export async function readCanonicalCandidate(
    request: Request,
    maxBytes: number,
): Promise<ValidatedIntegrationCandidateEnvelopeV1> {
    const document = await readRepositoryManagementJsonDocument(request, maxBytes);
    const candidate = await validateIntegrationCandidateEnvelope(document.value);
    assertCanonicalDocument(document.bytes, candidate.envelope);
    return candidate;
}

export async function readCanonicalClaimRequest(request: Request, maxBytes: number) {
    const document = await readRepositoryManagementJsonDocument(request, maxBytes);
    const input = strictRecord(document.value, ["candidateId", "expectedRevision", "workerId"]);
    const result = {
        candidateId: identifier(input.candidateId),
        expectedRevision: nonNegativeInteger(input.expectedRevision),
        workerId: identifier(input.workerId),
    };
    assertCanonicalDocument(document.bytes, result);
    return result;
}

export async function readCanonicalRenewRequest(request: Request, maxBytes: number) {
    const document = await readRepositoryManagementJsonDocument(request, maxBytes);
    const input = strictRecord(document.value, [
        "candidateId",
        "expectedRevision",
        "jobId",
        "attemptId",
        "fencingToken",
        "workerId",
    ]);
    const result = {
        candidateId: identifier(input.candidateId),
        expectedRevision: nonNegativeInteger(input.expectedRevision),
        jobId: identifier(input.jobId),
        attemptId: identifier(input.attemptId),
        fencingToken: positiveInteger(input.fencingToken),
        workerId: identifier(input.workerId),
    };
    assertCanonicalDocument(document.bytes, result);
    return result;
}

export async function readCanonicalResultCapabilityRequest(request: Request, maxBytes: number) {
    const document = await readRepositoryManagementJsonDocument(request, maxBytes);
    const input = strictRecord(document.value, [
        "candidateId",
        "jobId",
        "attemptId",
        "fencingToken",
        "workerId",
        "resultDigest",
    ]);
    const result = {
        candidateId: identifier(input.candidateId),
        jobId: identifier(input.jobId),
        attemptId: identifier(input.attemptId),
        fencingToken: positiveInteger(input.fencingToken),
        workerId: identifier(input.workerId),
        resultDigest: sha256Digest(input.resultDigest),
    };
    assertCanonicalDocument(document.bytes, result);
    return result;
}

export async function readCanonicalResultRequest(
    request: Request,
    maxBytes: number,
): Promise<Readonly<{ expectedRevision: number; result: VerificationJobResultV1 }>> {
    const document = await readRepositoryManagementJsonDocument(request, maxBytes);
    const input = strictRecord(document.value, ["expectedRevision", "result"]);
    const result = {
        expectedRevision: nonNegativeInteger(input.expectedRevision),
        result: await validateVerificationJobResult(input.result),
    };
    assertCanonicalDocument(document.bytes, result);
    return result;
}

function assertCanonicalDocument(bytes: Uint8Array, value: unknown): void {
    const canonical = canonicalJsonBytes(value);
    if (bytes.byteLength !== canonical.byteLength || bytes.some((byte, index) => byte !== canonical[index])) {
        throw new RepositoryCandidateRequestError("Candidate protocol request must use canonical JSON");
    }
}

function strictRecord(value: unknown, fields: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw invalid();
    }
    const input = value as Record<string, unknown>;
    const keys = Object.keys(input);
    if (keys.length !== fields.length || !fields.every((field) => keys.includes(field))) {
        throw invalid();
    }
    return input;
}

function identifier(value: unknown): string {
    if (typeof value !== "string" || !IDENTIFIER.test(value)) {
        throw invalid();
    }
    return value;
}

function nonNegativeInteger(value: unknown): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw invalid();
    }
    return value as number;
}

function positiveInteger(value: unknown): number {
    const result = nonNegativeInteger(value);
    if (result < 1) {
        throw invalid();
    }
    return result;
}

function sha256Digest(value: unknown): string {
    if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
        throw invalid();
    }
    return value;
}

function invalid(): RepositoryCandidateRequestError {
    return new RepositoryCandidateRequestError("Candidate protocol request is invalid");
}

export function candidateBodyStatus(error: unknown): 400 | 413 | null {
    if (error instanceof RepositoryManagementJsonBodyError) {
        return error.status;
    }
    return error instanceof RepositoryCandidateRequestError ? 400 : null;
}
