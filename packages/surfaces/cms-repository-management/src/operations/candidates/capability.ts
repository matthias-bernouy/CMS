import { createHmac, timingSafeEqual } from "node:crypto";
import { canonicalJsonBytes, parseStrictJsonDocument } from "@bernouy/cms-integration-packages";
import type { RepositoryCandidateCapabilityAuthority, RepositoryCandidateCapabilityIdentity } from "./contracts";

const CAPABILITY_SCHEMA = "cms.repository.verification-job-capability.v1";
const TOKEN_LIMIT = 4_096;
const PAYLOAD_LIMIT = 2_048;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const TOKEN_PATTERN = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/u;

type CapabilityPayload = RepositoryCandidateCapabilityIdentity & Readonly<{ schema: typeof CAPABILITY_SCHEMA }>;

export function createRepositoryCandidateCapabilityAuthority(config: {
    signingKey: string;
}): RepositoryCandidateCapabilityAuthority {
    if (typeof config.signingKey !== "string" || config.signingKey.length < 32 || /\s/u.test(config.signingKey)) {
        throw new TypeError("Repository worker capability signing key must contain at least 32 non-space characters");
    }
    return Object.freeze({
        issue(identity: RepositoryCandidateCapabilityIdentity) {
            const payload = parsePayload({ schema: CAPABILITY_SCHEMA, ...identity });
            const encoded = Buffer.from(canonicalJsonBytes(payload)).toString("base64url");
            return `${encoded}.${signature(encoded, config.signingKey).toString("base64url")}`;
        },
        verify(token: string, now: string) {
            try {
                canonicalTimestamp(now, "now");
                if (typeof token !== "string" || token.length > TOKEN_LIMIT) {
                    return null;
                }
                const match = TOKEN_PATTERN.exec(token);
                if (!match) {
                    return null;
                }
                const expected = signature(match[1]!, config.signingKey);
                const supplied = Buffer.from(match[2]!, "base64url");
                if (supplied.byteLength !== expected.byteLength || !timingSafeEqual(supplied, expected)) {
                    return null;
                }
                const bytes = new Uint8Array(Buffer.from(match[1]!, "base64url"));
                const payload = parsePayload(parseStrictJsonDocument(bytes, PAYLOAD_LIMIT));
                const canonical = canonicalJsonBytes(payload);
                if (!sameBytes(bytes, canonical) || Date.parse(now) >= Date.parse(payload.leaseExpiresAt)) {
                    return null;
                }
                const { schema: _schema, ...identity } = payload;
                return Object.freeze(identity);
            } catch {
                return null;
            }
        },
    });
}

function parsePayload(value: unknown): CapabilityPayload {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Invalid worker capability payload");
    }
    const input = value as Record<string, unknown>;
    const fields = [
        "schema",
        "candidateId",
        "jobId",
        "attemptId",
        "fencingToken",
        "workerId",
        "leaseExpiresAt",
        "resultDigest",
    ];
    const keys = Object.keys(input);
    if (keys.length !== fields.length || !fields.every((field) => keys.includes(field))) {
        throw new TypeError("Invalid worker capability payload");
    }
    if (
        input.schema !== CAPABILITY_SCHEMA ||
        !Number.isSafeInteger(input.fencingToken) ||
        (input.fencingToken as number) < 1
    ) {
        throw new TypeError("Invalid worker capability payload");
    }
    return Object.freeze({
        schema: CAPABILITY_SCHEMA,
        candidateId: identifier(input.candidateId),
        jobId: identifier(input.jobId),
        attemptId: identifier(input.attemptId),
        fencingToken: input.fencingToken as number,
        workerId: identifier(input.workerId),
        leaseExpiresAt: canonicalTimestamp(input.leaseExpiresAt, "leaseExpiresAt"),
        resultDigest: digest(input.resultDigest),
    });
}

function digest(value: unknown): string {
    if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
        throw new TypeError("Invalid worker capability result digest");
    }
    return value;
}

function signature(payload: string, key: string): Buffer {
    return createHmac("sha256", key).update(payload, "ascii").digest();
}

function identifier(value: unknown): string {
    if (typeof value !== "string" || !IDENTIFIER.test(value)) {
        throw new TypeError("Invalid worker capability identifier");
    }
    return value;
}

function canonicalTimestamp(value: unknown, field: string): string {
    const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
        throw new TypeError(`Invalid worker capability ${field}`);
    }
    return value as string;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
