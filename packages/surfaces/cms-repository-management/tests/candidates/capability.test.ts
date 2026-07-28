import { describe, expect, test } from "bun:test";
import { createRepositoryCandidateCapabilityAuthority } from "@bernouy/cms-repository-management";

const identity = {
    candidateId: "candidate-1",
    jobId: "job-1",
    attemptId: "attempt-1",
    fencingToken: 3,
    workerId: "worker-1",
    leaseExpiresAt: "2026-07-26T10:05:00.000Z",
    resultDigest: "a".repeat(64),
} as const;

describe("repository verification-job result capabilities", () => {
    test("binds the exact fenced attempt, lease, worker, and result digest", () => {
        const authority = createRepositoryCandidateCapabilityAuthority({ signingKey: "k".repeat(64) });
        const token = authority.issue(identity);

        expect(authority.verify(token, "2026-07-26T10:04:59.999Z")).toEqual(identity);
        expect(authority.verify(token, identity.leaseExpiresAt)).toBeNull();
    });

    test("rejects signature, payload, key, and result-digest substitution", () => {
        const authority = createRepositoryCandidateCapabilityAuthority({ signingKey: "k".repeat(64) });
        const other = createRepositoryCandidateCapabilityAuthority({ signingKey: "z".repeat(64) });
        const token = authority.issue(identity);
        const [payload, signature] = token.split(".");
        const tamperedPayload = Buffer.from(
            Buffer.from(payload!, "base64url").toString("utf8").replace("a".repeat(64), "b".repeat(64)),
        ).toString("base64url");

        expect(authority.verify(`${tamperedPayload}.${signature}`, "2026-07-26T10:04:00.000Z")).toBeNull();
        expect(authority.verify(`${payload}.${signature!.slice(0, -1)}x`, "2026-07-26T10:04:00.000Z")).toBeNull();
        expect(other.verify(token, "2026-07-26T10:04:00.000Z")).toBeNull();
    });
});
