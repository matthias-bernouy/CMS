import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import type {
    IntegrationRegistryCandidateFailure,
    IntegrationRegistryCandidateLease,
    IntegrationRegistryCandidateStatus,
} from "cms-integration-registry/interfaces/publication";
import { assertCandidateId, assertCandidateRevision } from "../layout";
import { digest, identifier, invalid, safeInteger, strictRecord, text, timestamp } from "./values";

const STATUSES = new Set<IntegrationRegistryCandidateStatus>([
    "uploaded",
    "validating",
    "queued",
    "running",
    "passed",
    "publishing",
    "published",
    "rejected",
    "expired",
]);

export function parseCandidateSharedFields(input: Record<string, unknown>) {
    const candidateId = text(input.candidateId, "candidateId");
    const kind = text(input.kind, "kind");
    const version = text(input.version, "version");
    const packageDigest = digest(input.packageDigest, "packageDigest");
    const verificationDigest = digest(input.verificationDigest, "verificationDigest");
    assertCandidateId(candidateId);
    assertIntegrationPackageKind(kind);
    assertIntegrationPackageVersion(version);
    const revision = safeInteger(input.revision, "revision");
    const attemptCount = safeInteger(input.attemptCount, "attemptCount");
    assertCandidateRevision(revision);
    const status = candidateStatus(input.status);
    const createdAt = timestamp(input.createdAt, "createdAt");
    const updatedAt = timestamp(input.updatedAt, "updatedAt");
    const expiresAt = timestamp(input.expiresAt, "expiresAt");
    if (Date.parse(expiresAt) <= Date.parse(createdAt) || Date.parse(updatedAt) < Date.parse(createdAt)) {
        invalid("Candidate record timestamps are not monotonic");
    }
    const lease = input.lease === undefined ? undefined : parseLease(input.lease);
    const lastFailure = input.lastFailure === undefined ? undefined : parseFailure(input.lastFailure);
    if ((status === "running") !== Boolean(lease)) {
        invalid("Candidate running status and lease must be present together");
    }
    if (lease) {
        if (
            lease.fencingToken !== attemptCount ||
            Date.parse(lease.claimedAt) < Date.parse(createdAt) ||
            Date.parse(lease.claimedAt) > Date.parse(updatedAt) ||
            Date.parse(lease.leaseExpiresAt) <= Date.parse(updatedAt)
        ) {
            invalid("Candidate lease is inconsistent with its record");
        }
    }
    if (lastFailure && Date.parse(lastFailure.occurredAt) > Date.parse(updatedAt)) {
        invalid("Candidate failure cannot occur after the record update");
    }
    if (input.requestedChannel !== undefined && input.requestedChannel !== "latest") {
        invalid("Candidate requestedChannel must be latest when present");
    }
    return {
        candidateId,
        revision,
        status,
        kind,
        version,
        packageDigest,
        verificationDigest,
        ...(input.requestedChannel === "latest" ? { requestedChannel: "latest" as const } : {}),
        createdAt,
        updatedAt,
        expiresAt,
        attemptCount,
        ...(lease ? { lease } : {}),
        ...(lastFailure ? { lastFailure } : {}),
    };
}

function parseLease(value: unknown): IntegrationRegistryCandidateLease {
    const input = strictRecord(value, "candidate lease", [
        "jobId",
        "attemptId",
        "fencingToken",
        "workerId",
        "claimedAt",
        "leaseExpiresAt",
    ]);
    const fencingToken = safeInteger(input.fencingToken, "lease.fencingToken");
    if (fencingToken < 1) {
        invalid("Candidate lease fencingToken must be positive");
    }
    return Object.freeze({
        jobId: identifier(input.jobId, "lease.jobId"),
        attemptId: identifier(input.attemptId, "lease.attemptId"),
        fencingToken,
        workerId: identifier(input.workerId, "lease.workerId"),
        claimedAt: timestamp(input.claimedAt, "lease.claimedAt"),
        leaseExpiresAt: timestamp(input.leaseExpiresAt, "lease.leaseExpiresAt"),
    });
}

function parseFailure(value: unknown): IntegrationRegistryCandidateFailure {
    const input = strictRecord(value, "candidate failure", ["kind", "code", "message", "occurredAt"]);
    if (!new Set(["validation", "suite", "infrastructure", "stale"]).has(String(input.kind))) {
        invalid("Candidate failure kind is invalid");
    }
    const message = text(input.message, "failure.message");
    if (!message.trim() || message.length > 4_096) {
        invalid("Candidate failure message must contain at most 4096 characters");
    }
    return Object.freeze({
        kind: input.kind as IntegrationRegistryCandidateFailure["kind"],
        code: identifier(input.code, "failure.code"),
        message,
        occurredAt: timestamp(input.occurredAt, "failure.occurredAt"),
    });
}

function candidateStatus(value: unknown): IntegrationRegistryCandidateStatus {
    if (typeof value !== "string" || !STATUSES.has(value as IntegrationRegistryCandidateStatus)) {
        invalid("Candidate record status is invalid");
    }
    return value as IntegrationRegistryCandidateStatus;
}

export { digest, invalid, strictRecord } from "./values";
