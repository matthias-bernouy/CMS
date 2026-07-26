import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import {
    INTEGRATION_REGISTRY_CANDIDATE_RECORD_SCHEMA,
    type IntegrationRegistryCandidateFailure,
    type IntegrationRegistryCandidateLease,
    type IntegrationRegistryCandidateRecord,
    type IntegrationRegistryCandidateStatus,
} from "cms-integration-registry/interfaces/publication";
import { IntegrationRegistryCandidateError } from "cms-integration-registry/core/publication/candidates/errors";
import { readCanonicalJsonFile } from "../persistence/canonicalFile";
import {
    assertCandidateId,
    assertCandidateRevision,
    assertSha256Digest,
    FS_INTEGRATION_REGISTRY_CANDIDATE_DOCUMENT_LIMIT,
} from "./layout";

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

export async function readIntegrationRegistryCandidateRecord(
    path: string,
): Promise<IntegrationRegistryCandidateRecord | null> {
    const value = await readCanonicalJsonFile(path, FS_INTEGRATION_REGISTRY_CANDIDATE_DOCUMENT_LIMIT);
    return value === null ? null : parseIntegrationRegistryCandidateRecord(value);
}

export function parseIntegrationRegistryCandidateRecord(value: unknown): IntegrationRegistryCandidateRecord {
    const input = strictRecord(value, "candidate record", [
        "schema",
        "candidateId",
        "revision",
        "status",
        "kind",
        "version",
        "packageDigest",
        "verificationDigest",
        "requestedChannel",
        "createdAt",
        "updatedAt",
        "expiresAt",
        "attemptCount",
        "lease",
        "lastFailure",
    ]);
    if (input.schema !== INTEGRATION_REGISTRY_CANDIDATE_RECORD_SCHEMA) {
        invalid(`Candidate record schema must be ${INTEGRATION_REGISTRY_CANDIDATE_RECORD_SCHEMA}`);
    }
    const candidateId = text(input.candidateId, "candidateId");
    const kind = text(input.kind, "kind");
    const version = text(input.version, "version");
    const packageDigest = text(input.packageDigest, "packageDigest");
    const verificationDigest = text(input.verificationDigest, "verificationDigest");
    assertCandidateId(candidateId);
    assertIntegrationPackageKind(kind);
    assertIntegrationPackageVersion(version);
    assertSha256Digest(packageDigest);
    assertSha256Digest(verificationDigest);
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
    return Object.freeze({
        schema: INTEGRATION_REGISTRY_CANDIDATE_RECORD_SCHEMA,
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
    });
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

function strictRecord(value: unknown, source: string, fields: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        invalid(`${source} must be an object`);
    }
    const input = value as Record<string, unknown>;
    const unknown = Object.keys(input).filter((field) => !fields.includes(field));
    if (unknown.length > 0) {
        invalid(`${source} contains unknown field ${unknown[0]}`);
    }
    return input;
}

function identifier(value: unknown, field: string): string {
    const parsed = text(value, field);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(parsed)) {
        invalid(`Candidate ${field} must be a path-safe identifier`);
    }
    return parsed;
}

function text(value: unknown, field: string): string {
    if (typeof value !== "string") {
        invalid(`Candidate ${field} must be text`);
    }
    return value;
}

function safeInteger(value: unknown, field: string): number {
    if (!Number.isSafeInteger(value) || Number(value) < 0) {
        invalid(`Candidate ${field} must be a non-negative safe integer`);
    }
    return Number(value);
}

function timestamp(value: unknown, field: string): string {
    const parsed = text(value, field);
    const milliseconds = Date.parse(parsed);
    if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== parsed) {
        invalid(`Candidate ${field} must be an ISO timestamp`);
    }
    return parsed;
}

function invalid(message: string): never {
    throw new IntegrationRegistryCandidateError("invalid_candidate", message);
}
