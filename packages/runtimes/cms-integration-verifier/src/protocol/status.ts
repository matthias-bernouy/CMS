import type { CandidateLeaseProjection, CandidateStatusProjection } from "./types";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const STATUSES = new Set([
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
const FAILURE_KINDS = new Set(["validation", "suite", "infrastructure", "stale"]);

export function parseCandidateStatus(value: unknown): CandidateStatusProjection {
    const input = record(
        value,
        [
            "candidateId",
            "revision",
            "status",
            "kind",
            "version",
            "candidateDigest",
            "packageDigest",
            "verificationDigest",
            "createdAt",
            "updatedAt",
            "expiresAt",
            "attemptCount",
        ],
        ["requestedChannel", "lease", "lastFailure"],
    );
    const status = enumeration(input.status, STATUSES, "candidate status") as CandidateStatusProjection["status"];
    const lease = input.lease === undefined ? undefined : parseLease(input.lease);
    if ((status === "running") !== Boolean(lease)) {
        throw new TypeError("Candidate running status and lease must agree");
    }
    if (input.requestedChannel !== undefined && input.requestedChannel !== "latest") {
        throw new TypeError("Candidate requested channel is invalid");
    }
    return {
        candidateId: identifier(input.candidateId),
        revision: nonNegativeInteger(input.revision),
        status,
        kind: identifier(input.kind),
        version: text(input.version, 128),
        candidateDigest: digest(input.candidateDigest),
        packageDigest: digest(input.packageDigest),
        verificationDigest: digest(input.verificationDigest),
        createdAt: timestamp(input.createdAt),
        updatedAt: timestamp(input.updatedAt),
        expiresAt: timestamp(input.expiresAt),
        attemptCount: nonNegativeInteger(input.attemptCount),
        ...(input.requestedChannel === "latest" ? { requestedChannel: "latest" as const } : {}),
        ...(lease ? { lease } : {}),
        ...(input.lastFailure === undefined ? {} : { lastFailure: parseFailure(input.lastFailure) }),
    };
}

function parseLease(value: unknown): CandidateLeaseProjection {
    const input = record(value, ["jobId", "attemptId", "fencingToken", "workerId", "claimedAt", "leaseExpiresAt"]);
    return {
        jobId: identifier(input.jobId),
        attemptId: identifier(input.attemptId),
        fencingToken: positiveInteger(input.fencingToken),
        workerId: identifier(input.workerId),
        claimedAt: timestamp(input.claimedAt),
        leaseExpiresAt: timestamp(input.leaseExpiresAt),
    };
}

function parseFailure(value: unknown): NonNullable<CandidateStatusProjection["lastFailure"]> {
    const input = record(value, ["kind", "code", "occurredAt"]);
    return {
        kind: enumeration(input.kind, FAILURE_KINDS, "failure kind") as NonNullable<
            CandidateStatusProjection["lastFailure"]
        >["kind"],
        code: identifier(input.code),
        occurredAt: timestamp(input.occurredAt),
    };
}

export function record(
    value: unknown,
    required: readonly string[],
    optional: readonly string[] = [],
): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Expected a protocol object");
    }
    const input = value as Record<string, unknown>;
    const keys = Object.keys(input);
    if (
        !required.every((field) => keys.includes(field)) ||
        keys.some((field) => !required.includes(field) && !optional.includes(field))
    ) {
        throw new TypeError("Protocol object fields are invalid");
    }
    return input;
}

export function identifier(value: unknown): string {
    if (typeof value !== "string" || !IDENTIFIER.test(value)) {
        throw new TypeError("Protocol identifier is invalid");
    }
    return value;
}

export function digest(value: unknown): string {
    if (typeof value !== "string" || !DIGEST.test(value)) {
        throw new TypeError("Protocol digest is invalid");
    }
    return value;
}

export function timestamp(value: unknown): string {
    const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
        throw new TypeError("Protocol timestamp is invalid");
    }
    return value as string;
}

function enumeration(value: unknown, values: ReadonlySet<string>, label: string): string {
    if (typeof value !== "string" || !values.has(value)) {
        throw new TypeError(`Protocol ${label} is invalid`);
    }
    return value;
}

function nonNegativeInteger(value: unknown): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw new TypeError("Protocol integer is invalid");
    }
    return value as number;
}

function positiveInteger(value: unknown): number {
    const result = nonNegativeInteger(value);
    if (result < 1) {
        throw new TypeError("Protocol integer is invalid");
    }
    return result;
}

function text(value: unknown, maximum: number): string {
    if (typeof value !== "string" || !value || value.length > maximum) {
        throw new TypeError("Protocol text is invalid");
    }
    return value;
}
