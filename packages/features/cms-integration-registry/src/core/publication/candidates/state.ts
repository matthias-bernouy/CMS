import type {
    CreateIntegrationRegistryCandidateInput,
    IntegrationRegistryCandidateFailure,
    IntegrationRegistryCandidateLease,
    IntegrationRegistryCandidateRecord,
    IntegrationRegistryCandidateStatus,
} from "../../../interfaces/publication";
import { INTEGRATION_REGISTRY_CANDIDATE_RECORD_SCHEMA } from "../../../interfaces/publication";
import { IntegrationRegistryCandidateError } from "./errors";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const ALLOWED_TRANSITIONS: Readonly<
    Record<IntegrationRegistryCandidateStatus, readonly IntegrationRegistryCandidateStatus[]>
> = {
    uploaded: ["validating", "expired"],
    validating: ["queued", "rejected", "expired"],
    queued: ["expired"],
    running: [],
    passed: ["publishing"],
    publishing: ["published", "queued"],
    published: [],
    rejected: [],
    expired: [],
};

export function createIntegrationRegistryCandidateRecord(
    input: CreateIntegrationRegistryCandidateInput,
): IntegrationRegistryCandidateRecord {
    identifier(input.candidateId, "candidateId");
    const createdAt = timestamp(input.createdAt, "createdAt");
    const expiresAt = timestamp(input.expiresAt, "expiresAt");
    if (Date.parse(expiresAt) <= Date.parse(createdAt)) {
        invalid("Candidate expiry must be later than its creation time");
    }
    const envelope = input.candidate.envelope;
    return freezeRecord({
        schema: INTEGRATION_REGISTRY_CANDIDATE_RECORD_SCHEMA,
        candidateId: input.candidateId,
        revision: 0,
        status: "uploaded",
        kind: envelope.package.kind,
        version: envelope.package.version,
        packageDigest: input.candidate.packageDigest,
        verificationDigest: input.candidate.verificationDigest,
        ...(envelope.submission.requestedChannel ? { requestedChannel: envelope.submission.requestedChannel } : {}),
        createdAt,
        updatedAt: createdAt,
        expiresAt,
        attemptCount: 0,
    });
}

export function advanceIntegrationRegistryCandidate(
    record: IntegrationRegistryCandidateRecord,
    input: Readonly<{
        expectedRevision: number;
        status: "validating" | "queued" | "publishing" | "published" | "rejected" | "expired";
        now: string;
        failure?: IntegrationRegistryCandidateFailure;
    }>,
): IntegrationRegistryCandidateRecord {
    assertRevision(record, input.expectedRevision);
    const now = monotonicTimestamp(record, input.now);
    if (!ALLOWED_TRANSITIONS[record.status].includes(input.status)) {
        transition(record.status, input.status);
    }
    if (input.status === "expired" && Date.parse(now) < Date.parse(record.expiresAt)) {
        invalid("Candidate cannot expire before expiresAt");
    }
    if (input.status === "rejected" && !input.failure) {
        invalid("Rejected candidates require a failure reason");
    }
    if (input.status === "queued" && record.status === "publishing" && input.failure?.kind !== "stale") {
        invalid("Publishing candidates return to queued only after a stale-input decision");
    }
    return nextRecord(record, {
        status: input.status,
        updatedAt: now,
        ...(input.failure ? { lastFailure: failure(input.failure, now) } : {}),
    });
}

export function claimIntegrationRegistryCandidate(
    record: IntegrationRegistryCandidateRecord,
    input: Readonly<{
        expectedRevision: number;
        jobId: string;
        attemptId: string;
        fencingToken: number;
        workerId: string;
        now: string;
        leaseExpiresAt: string;
    }>,
): IntegrationRegistryCandidateRecord {
    assertRevision(record, input.expectedRevision);
    if (record.status !== "queued") {
        transition(record.status, "running");
    }
    const now = monotonicTimestamp(record, input.now);
    if (Date.parse(now) >= Date.parse(record.expiresAt)) {
        invalid("Expired candidate cannot be claimed");
    }
    const lease = parseLease(input, now);
    return nextRecord(record, {
        status: "running",
        updatedAt: now,
        attemptCount: record.attemptCount + 1,
        lease,
    });
}

export function renewIntegrationRegistryCandidateLease(
    record: IntegrationRegistryCandidateRecord,
    input: Readonly<{
        expectedRevision: number;
        attemptId: string;
        fencingToken: number;
        now: string;
        leaseExpiresAt: string;
    }>,
): IntegrationRegistryCandidateRecord {
    assertRevision(record, input.expectedRevision);
    const lease = assertLease(record, input.attemptId, input.fencingToken);
    const now = monotonicTimestamp(record, input.now);
    assertLeaseCurrent(lease, now);
    const leaseExpiresAt = timestamp(input.leaseExpiresAt, "leaseExpiresAt");
    if (Date.parse(leaseExpiresAt) <= Date.parse(lease.leaseExpiresAt)) {
        invalid("Renewed candidate lease must extend the current expiry");
    }
    return nextRecord(record, { updatedAt: now, lease: Object.freeze({ ...lease, leaseExpiresAt }) });
}

export function completeIntegrationRegistryCandidateAttempt(
    record: IntegrationRegistryCandidateRecord,
    input: Readonly<{
        expectedRevision: number;
        attemptId: string;
        fencingToken: number;
        now: string;
        outcome: "passed" | "rejected" | "infrastructure-failure";
        failure?: IntegrationRegistryCandidateFailure;
    }>,
): IntegrationRegistryCandidateRecord {
    assertRevision(record, input.expectedRevision);
    const lease = assertLease(record, input.attemptId, input.fencingToken);
    const now = monotonicTimestamp(record, input.now);
    assertLeaseCurrent(lease, now);
    if (input.outcome !== "passed" && !input.failure) {
        invalid("Failed candidate attempts require a failure reason");
    }
    if (input.outcome === "rejected" && input.failure?.kind !== "suite" && input.failure?.kind !== "validation") {
        invalid("Rejected candidate attempts require a suite or validation failure");
    }
    if (input.outcome === "infrastructure-failure" && input.failure?.kind !== "infrastructure") {
        invalid("Retried candidate attempts require an infrastructure failure");
    }
    return nextRecord(record, {
        status: input.outcome === "passed" ? "passed" : input.outcome === "rejected" ? "rejected" : "queued",
        updatedAt: now,
        ...(input.failure ? { lastFailure: failure(input.failure, now) } : {}),
        lease: undefined,
    });
}

function nextRecord(
    record: IntegrationRegistryCandidateRecord,
    changes: Partial<IntegrationRegistryCandidateRecord>,
): IntegrationRegistryCandidateRecord {
    const next = { ...record, ...changes, revision: record.revision + 1 };
    if (changes.lease === undefined) {
        delete next.lease;
    }
    return freezeRecord(next);
}

function parseLease(
    input: Readonly<{
        jobId: string;
        attemptId: string;
        fencingToken: number;
        workerId: string;
        leaseExpiresAt: string;
    }>,
    now: string,
): IntegrationRegistryCandidateLease {
    identifier(input.jobId, "jobId");
    identifier(input.attemptId, "attemptId");
    identifier(input.workerId, "workerId");
    if (!Number.isSafeInteger(input.fencingToken) || input.fencingToken < 1) {
        invalid("Candidate fencingToken must be a positive safe integer");
    }
    const leaseExpiresAt = timestamp(input.leaseExpiresAt, "leaseExpiresAt");
    if (Date.parse(leaseExpiresAt) <= Date.parse(now)) {
        invalid("Candidate lease expiry must be later than claim time");
    }
    return Object.freeze({
        jobId: input.jobId,
        attemptId: input.attemptId,
        fencingToken: input.fencingToken,
        workerId: input.workerId,
        claimedAt: now,
        leaseExpiresAt,
    });
}

function assertLease(
    record: IntegrationRegistryCandidateRecord,
    attemptId: string,
    fencingToken: number,
): IntegrationRegistryCandidateLease {
    if (
        record.status !== "running" ||
        !record.lease ||
        record.lease.attemptId !== attemptId ||
        record.lease.fencingToken !== fencingToken
    ) {
        throw new IntegrationRegistryCandidateError("lease_conflict", "Candidate attempt lease is no longer current");
    }
    return record.lease;
}

function assertLeaseCurrent(lease: IntegrationRegistryCandidateLease, now: string): void {
    if (Date.parse(now) >= Date.parse(lease.leaseExpiresAt)) {
        throw new IntegrationRegistryCandidateError("lease_expired", "Candidate attempt lease has expired");
    }
}

function assertRevision(record: IntegrationRegistryCandidateRecord, expected: number): void {
    if (record.revision !== expected) {
        throw new IntegrationRegistryCandidateError(
            "revision_conflict",
            `Candidate revision changed from expected ${expected} to ${record.revision}`,
        );
    }
}

function monotonicTimestamp(record: IntegrationRegistryCandidateRecord, value: string): string {
    const parsed = timestamp(value, "now");
    if (Date.parse(parsed) < Date.parse(record.updatedAt)) {
        invalid("Candidate update time must not move backwards");
    }
    return parsed;
}

function failure(value: IntegrationRegistryCandidateFailure, now: string): IntegrationRegistryCandidateFailure {
    if (timestamp(value.occurredAt, "failure.occurredAt") !== now) {
        invalid("Candidate failure time must equal the state transition time");
    }
    identifier(value.code, "failure.code");
    if (!value.message.trim() || value.message.length > 4_096) {
        invalid("Candidate failure message must contain at most 4096 characters");
    }
    return Object.freeze({ ...value });
}

function freezeRecord(record: IntegrationRegistryCandidateRecord): IntegrationRegistryCandidateRecord {
    return Object.freeze({
        ...record,
        ...(record.lease ? { lease: Object.freeze({ ...record.lease }) } : {}),
        ...(record.lastFailure ? { lastFailure: Object.freeze({ ...record.lastFailure }) } : {}),
    });
}

function identifier(value: string, field: string): void {
    if (!IDENTIFIER.test(value)) {
        invalid(`Candidate ${field} must be a path-safe identifier`);
    }
}

function timestamp(value: string, field: string): string {
    const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
        invalid(`Candidate ${field} must be an ISO timestamp`);
    }
    return value;
}

function invalid(message: string): never {
    throw new IntegrationRegistryCandidateError("invalid_candidate", message);
}

function transition(from: IntegrationRegistryCandidateStatus, to: IntegrationRegistryCandidateStatus): never {
    throw new IntegrationRegistryCandidateError(
        "invalid_transition",
        `Candidate cannot transition from ${from} to ${to}`,
    );
}
