import { VerificationProtocolError } from "./error";
import { digest, parseCandidateStatus, record, timestamp } from "./status";
import type { CandidateStatusProjection, ClaimedVerificationJob, ResultCapability } from "./types";
import { parseExactWorkload } from "./workload";

export function parseCandidateList(value: unknown): readonly CandidateStatusProjection[] {
    return safely(() => {
        const input = record(value, ["candidates"]);
        if (!Array.isArray(input.candidates) || input.candidates.length > 100) {
            throw new TypeError("Candidate list is invalid");
        }
        return input.candidates.map((candidate) => {
            const parsed = parseCandidateStatus(candidate);
            if (parsed.status !== "queued" || parsed.lease) {
                throw new TypeError("Claimable candidate is not queued");
            }
            return parsed;
        });
    });
}

export async function parseClaimedJob(
    value: unknown,
    workerId: string,
    requested: CandidateStatusProjection,
): Promise<ClaimedVerificationJob> {
    try {
        const input = record(value, ["candidate", "workload"]);
        const candidate = parseCandidateStatus(input.candidate);
        if (
            candidate.status !== "running" ||
            !candidate.lease ||
            candidate.lease.workerId !== workerId ||
            candidate.candidateId !== requested.candidateId ||
            candidate.candidateDigest !== requested.candidateDigest ||
            candidate.packageDigest !== requested.packageDigest ||
            candidate.verificationDigest !== requested.verificationDigest ||
            candidate.revision <= requested.revision
        ) {
            throw new TypeError("Claim response has no exact worker lease");
        }
        const workload = await parseExactWorkload(input.workload, candidate);
        return { candidate: candidate as ClaimedVerificationJob["candidate"], workload };
    } catch (error) {
        if (error instanceof VerificationProtocolError) {
            throw error;
        }
        throw invalidResponse();
    }
}

export function parseRenewedCandidate(
    value: unknown,
    previous: ClaimedVerificationJob["candidate"],
): ClaimedVerificationJob["candidate"] {
    return safely(() => {
        const input = record(value, ["candidate"]);
        const candidate = parseCandidateStatus(input.candidate);
        if (
            candidate.status !== "running" ||
            !candidate.lease ||
            candidate.candidateId !== previous.candidateId ||
            candidate.revision <= previous.revision ||
            !sameAttempt(candidate.lease, previous.lease)
        ) {
            throw new TypeError("Renewal response changed the fenced attempt");
        }
        return candidate as ClaimedVerificationJob["candidate"];
    });
}

export function parseResultCapability(
    value: unknown,
    expectedDigest: string,
    expectedExpiry: string,
): ResultCapability {
    return safely(() => {
        const input = record(value, ["capability"]);
        const capability = record(input.capability, ["token", "expiresAt", "resultDigest"]);
        if (
            typeof capability.token !== "string" ||
            !capability.token ||
            capability.token.length > 4_096 ||
            /\s/u.test(capability.token) ||
            digest(capability.resultDigest) !== expectedDigest ||
            timestamp(capability.expiresAt) !== expectedExpiry
        ) {
            throw new TypeError("Result capability is not bound to the exact sealed result");
        }
        return {
            token: capability.token,
            expiresAt: capability.expiresAt as string,
            resultDigest: capability.resultDigest as string,
        };
    });
}

export function parseSubmittedCandidate(
    value: unknown,
    previous: ClaimedVerificationJob["candidate"],
): CandidateStatusProjection {
    return safely(() => {
        const input = record(value, ["candidate"]);
        const candidate = parseCandidateStatus(input.candidate);
        if (
            candidate.candidateId !== previous.candidateId ||
            candidate.candidateDigest !== previous.candidateDigest ||
            candidate.packageDigest !== previous.packageDigest ||
            candidate.verificationDigest !== previous.verificationDigest ||
            candidate.kind !== previous.kind ||
            candidate.version !== previous.version ||
            candidate.revision <= previous.revision ||
            (candidate.status !== "queued" && candidate.status !== "passed" && candidate.status !== "rejected") ||
            candidate.lease
        ) {
            throw new TypeError("Result submission did not finish the exact candidate attempt");
        }
        return candidate;
    });
}

function sameAttempt(
    left: ClaimedVerificationJob["candidate"]["lease"],
    right: ClaimedVerificationJob["candidate"]["lease"],
): boolean {
    return (
        left.jobId === right.jobId &&
        left.attemptId === right.attemptId &&
        left.fencingToken === right.fencingToken &&
        left.workerId === right.workerId
    );
}

function safely<T>(operation: () => T): T {
    try {
        return operation();
    } catch (error) {
        if (error instanceof VerificationProtocolError) {
            throw error;
        }
        throw invalidResponse();
    }
}

function invalidResponse(): VerificationProtocolError {
    return new VerificationProtocolError("invalid-response", "Repository returned an invalid worker response", false);
}
