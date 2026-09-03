import { describe, expect, test } from "bun:test";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { publishLocalCandidate } from "../../src/publication/client";
import type { BuiltLocalCandidate } from "../../src/publication/contracts";

const candidate: BuiltLocalCandidate = {
    kind: "demo",
    version: "1.1.0",
    packageDigest: "a".repeat(64),
    verificationDigest: "b".repeat(64),
    candidateDigest: "c".repeat(64),
    canonicalBytes: canonicalJsonBytes({ schema: "cms.integration.candidate.v1" }),
};
describe("remote publication protocol", () => {
    test("submits exact canonical bytes and polls the bound candidate", async () => {
        const requests: Array<{ method: string; path: string; authorization: string | null; body: string }> = [];
        let statusReads = 0;
        const fetchImpl = fetchFixture(async (request) => {
            const url = new URL(request.url);
            requests.push({
                method: request.method,
                path: `${url.pathname}${url.search}`,
                authorization: request.headers.get("authorization"),
                body: request.method === "POST" ? await request.text() : "",
            });
            if (url.pathname.endsWith("/versions")) {
                return json(404, { code: "integration_not_found" });
            }
            if (request.method === "POST") {
                return json(202, { candidate: projection("queued") });
            }
            statusReads += 1;
            return json(200, { candidate: projection(statusReads === 1 ? "running" : "published") });
        });

        expect(await publishLocalCandidate(config(fetchImpl), candidate)).toEqual({
            outcome: "published",
            candidateId: "candidate-1",
        });
        expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
            "GET /.cms/repository-management/api/integrations/versions?kind=demo",
            "POST /.cms/repository-management/api/integrations/candidates",
            "GET /.cms/repository-management/api/integrations/candidates/status?candidateId=candidate-1",
            "GET /.cms/repository-management/api/integrations/candidates/status?candidateId=candidate-1",
        ]);
        expect(requests.every(({ authorization }) => authorization === "Bearer cms-pat")).toBeTrue();
        expect(requests[1]?.body).toBe(new TextDecoder().decode(candidate.canonicalBytes));
    });

    test("is idempotent for exact bytes and rejects immutable conflicts", async () => {
        const exact = fetchFixture(() =>
            json(200, {
                kind: candidate.kind,
                versions: [
                    {
                        version: candidate.version,
                        digest: candidate.packageDigest,
                        release: { verificationDigest: candidate.verificationDigest },
                    },
                ],
            }),
        );
        expect(await publishLocalCandidate(config(exact), candidate)).toEqual({ outcome: "unchanged" });

        const conflict = fetchFixture(() =>
            json(200, {
                kind: candidate.kind,
                versions: [{ version: candidate.version, digest: "d".repeat(64) }],
            }),
        );
        expect(await publishLocalCandidate(config(conflict), candidate)).toMatchObject({
            outcome: "failed",
            reason: "conflict",
            code: "integration_version_exists",
        });
    });

    test("reconciles a concurrent identical publication after stale admission", async () => {
        let count = 0;
        const fetchImpl = fetchFixture(() => {
            count += 1;
            if (count === 1) {
                return json(404, { code: "integration_not_found" });
            }
            if (count === 2) {
                return json(202, {
                    candidate: { ...projection("rejected"), lastFailure: { code: "admission_inputs_stale" } },
                });
            }
            return json(200, {
                kind: candidate.kind,
                versions: [
                    {
                        version: candidate.version,
                        digest: candidate.packageDigest,
                        release: { verificationDigest: candidate.verificationDigest },
                    },
                ],
            });
        });

        expect(await publishLocalCandidate(config(fetchImpl), candidate)).toEqual({ outcome: "unchanged" });
        expect(count).toBe(3);
    });

    test("retries bounded rate limits without exposing upstream details", async () => {
        let count = 0;
        let now = 0;
        const waits: number[] = [];
        const fetchImpl = fetchFixture(() => {
            count += 1;
            if (count === 1) {
                return json(429, { code: "rate_limited" }, { "retry-after": "2" });
            }
            return json(200, {
                kind: candidate.kind,
                versions: [
                    {
                        version: candidate.version,
                        digest: candidate.packageDigest,
                        release: { verificationDigest: candidate.verificationDigest },
                    },
                ],
            });
        });

        const result = await publishLocalCandidate(
            {
                ...config(fetchImpl),
                timeoutMs: 5_000,
                now: () => now,
                wait: async (milliseconds) => {
                    waits.push(milliseconds);
                    now += milliseconds;
                },
            },
            candidate,
        );
        expect(result).toEqual({ outcome: "unchanged" });
        expect(waits).toEqual([2_000]);
    });
});

function config(fetchImpl: typeof fetch) {
    return {
        managementUrl: "http://127.0.0.1/.cms/repository-management",
        token: "cms-pat",
        timeoutMs: 500,
        pollIntervalMs: 1,
        wait: async () => undefined,
        fetch: fetchImpl,
    };
}

function projection(status: string) {
    return {
        candidateId: "candidate-1",
        status,
        kind: candidate.kind,
        version: candidate.version,
        candidateDigest: candidate.candidateDigest,
        packageDigest: candidate.packageDigest,
        verificationDigest: candidate.verificationDigest,
    };
}

function fetchFixture(handler: (request: Request) => Response | Promise<Response>): typeof fetch {
    return (input, init) => handler(new Request(input, init));
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
    return Response.json(body, { status, headers });
}
