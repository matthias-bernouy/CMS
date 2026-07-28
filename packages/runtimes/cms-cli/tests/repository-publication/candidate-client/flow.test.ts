import { afterEach, describe, expect, test } from "bun:test";
import { publishIntegrationCandidate } from "../../../src/repositoryPublication/candidate/client";
import {
    CANDIDATE,
    candidateClientConfig,
    candidateJson,
    candidateProjection,
    serveCandidateClient,
    stopCandidateClientServers,
} from "./fixtures";

afterEach(stopCandidateClientServers);

describe("repository candidate HTTP flow", () => {
    test("submits canonical candidate bytes and polls the exact identity until published", async () => {
        const requests: Array<{ method: string; path: string; authorization: string | null; body: string }> = [];
        let statusReads = 0;
        const server = serveCandidateClient(async (request) => {
            const url = new URL(request.url);
            requests.push({
                method: request.method,
                path: `${url.pathname}${url.search}`,
                authorization: request.headers.get("authorization"),
                body: request.method === "POST" ? await request.text() : "",
            });
            if (url.pathname.endsWith("/versions")) {
                return candidateJson(404, { code: "integration_not_found" });
            }
            if (request.method === "POST") {
                return candidateJson(202, { candidate: candidateProjection("queued") });
            }
            statusReads += 1;
            return candidateJson(200, {
                candidate: candidateProjection(statusReads === 1 ? "running" : "published"),
            });
        });

        const result = await publishIntegrationCandidate(candidateClientConfig(server), CANDIDATE);

        expect(result).toEqual({ outcome: "published", candidateId: "candidate-1" });
        expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
            "GET /.cms/repository-management/api/integrations/versions?kind=demo",
            "POST /.cms/repository-management/api/integrations/candidates",
            "GET /.cms/repository-management/api/integrations/candidates/status?candidateId=candidate-1",
            "GET /.cms/repository-management/api/integrations/candidates/status?candidateId=candidate-1",
        ]);
        expect(requests.every(({ authorization }) => authorization === "Bearer management-token")).toBe(true);
        expect(requests[1]?.body).toBe(new TextDecoder().decode(CANDIDATE.canonicalBytes));
    });

    test("skips an immutable version whose package and verification digests already match", async () => {
        const server = serveCandidateClient(() =>
            candidateJson(200, {
                kind: CANDIDATE.kind,
                versions: [
                    {
                        version: CANDIDATE.version,
                        digest: CANDIDATE.packageDigest,
                        status: "blocked",
                        release: { verificationDigest: CANDIDATE.verificationDigest, admissible: false },
                    },
                ],
            }),
        );

        expect(await publishIntegrationCandidate(candidateClientConfig(server), CANDIDATE)).toEqual({
            outcome: "unchanged",
        });
    });

    test("rejects reuse of an existing version with a different package digest", async () => {
        const server = serveCandidateClient(() =>
            candidateJson(200, {
                kind: CANDIDATE.kind,
                versions: [{ version: CANDIDATE.version, digest: "d".repeat(64) }],
            }),
        );

        expect(await publishIntegrationCandidate(candidateClientConfig(server), CANDIDATE)).toEqual({
            outcome: "failed",
            reason: "conflict",
            status: 409,
            code: "integration_version_exists",
        });
    });

    test("rejects reuse of an existing package with different verification evidence", async () => {
        const server = serveCandidateClient(() =>
            candidateJson(200, {
                kind: CANDIDATE.kind,
                versions: [
                    {
                        version: CANDIDATE.version,
                        digest: CANDIDATE.packageDigest,
                        release: { verificationDigest: "e".repeat(64), admissible: true },
                    },
                ],
            }),
        );

        expect(await publishIntegrationCandidate(candidateClientConfig(server), CANDIDATE)).toEqual({
            outcome: "failed",
            reason: "conflict",
            status: 409,
            code: "integration_version_exists",
        });
    });

    test("reconciles a concurrent identical publication after stale admission", async () => {
        let requestCount = 0;
        const server = serveCandidateClient(() => {
            requestCount += 1;
            if (requestCount === 1) {
                return candidateJson(404, { code: "integration_not_found" });
            }
            if (requestCount === 2) {
                return candidateJson(202, {
                    candidate: {
                        candidateId: "candidate-stale",
                        status: "rejected",
                        kind: CANDIDATE.kind,
                        version: CANDIDATE.version,
                        candidateDigest: CANDIDATE.candidateDigest,
                        packageDigest: CANDIDATE.packageDigest,
                        verificationDigest: CANDIDATE.verificationDigest,
                        lastFailure: { code: "admission_inputs_stale" },
                    },
                });
            }
            return candidateJson(200, {
                kind: CANDIDATE.kind,
                versions: [
                    {
                        version: CANDIDATE.version,
                        digest: CANDIDATE.packageDigest,
                        release: { verificationDigest: CANDIDATE.verificationDigest },
                    },
                ],
            });
        });

        expect(await publishIntegrationCandidate(candidateClientConfig(server), CANDIDATE)).toEqual({
            outcome: "unchanged",
        });
        expect(requestCount).toBe(3);
    });

    test("returns a sanitized candidate rejection without polling", async () => {
        const server = serveCandidateClient((request) =>
            new URL(request.url).pathname.endsWith("/versions")
                ? candidateJson(404, { code: "integration_not_found" })
                : candidateJson(202, {
                      candidate: {
                          ...candidateProjection("rejected"),
                          lastFailure: {
                              kind: "validation",
                              code: "breaking_release_mislabeled",
                              message: "filesystem management-secret",
                          },
                      },
                  }),
        );

        expect(await publishIntegrationCandidate(candidateClientConfig(server), CANDIDATE)).toEqual({
            outcome: "failed",
            reason: "rejected",
            status: 422,
            code: "breaking_release_mislabeled",
        });
    });

    test("honors management rate limits across inspection, submission, and polling", async () => {
        const requestCounts = new Map<string, number>();
        const server = serveCandidateClient((request) => {
            const url = new URL(request.url);
            const operation = `${request.method} ${url.pathname}`;
            const count = (requestCounts.get(operation) ?? 0) + 1;
            requestCounts.set(operation, count);
            if (count === 1) {
                return candidateJson(429, { code: "rate_limited" }, { "retry-after": "2" });
            }
            if (url.pathname.endsWith("/versions")) {
                return candidateJson(404, { code: "integration_not_found" });
            }
            if (request.method === "POST") {
                return candidateJson(202, { candidate: candidateProjection("queued") });
            }
            return candidateJson(200, { candidate: candidateProjection("published") });
        });
        let now = 0;
        const waits: number[] = [];

        const result = await publishIntegrationCandidate(
            {
                ...candidateClientConfig(server),
                timeoutMs: 10_000,
                now: () => now,
                wait: async (milliseconds) => {
                    waits.push(milliseconds);
                    now += milliseconds;
                },
            },
            CANDIDATE,
        );

        expect(result).toEqual({ outcome: "published", candidateId: "candidate-1" });
        expect(waits).toEqual([2_000, 2_000, 1, 2_000]);
        expect([...requestCounts.values()]).toEqual([2, 2, 2]);
    });
});
