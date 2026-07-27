import { describe, expect, test } from "bun:test";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { identifyCandidateAdmissionJobResult } from "@bernouy/cms-integration-verification";
import { VerificationProtocolError, createHttpCandidateWorkerClient } from "../../src";
import { validJobResult } from "../fixtures/result";
import { claimedJob, queuedCandidate } from "../fixtures/workload";
import { renewedCandidate } from "../fixtures/fakeWorker";

describe("candidate worker HTTP client", () => {
    test("authenticates worker operations but submits the exact result with its capability only", async () => {
        const queued = await queuedCandidate();
        const claimed = await claimedJob();
        const renewed = renewedCandidate(claimed.candidate);
        const result = await validJobResult({ ...claimed, candidate: renewed });
        const resultDigest = (await identifyCandidateAdmissionJobResult(result)).digest;
        const terminal = { ...renewed, revision: renewed.revision + 1, status: "published", lease: undefined };
        const responses = [
            json({ candidates: [queued] }),
            json({ candidate: claimed.candidate, workload: claimed.workload }, 201),
            json({ candidate: renewed }),
            json(
                {
                    capability: {
                        token: "sealed-result-capability",
                        expiresAt: renewed.lease.leaseExpiresAt,
                        resultDigest,
                    },
                },
                201,
            ),
            json({ candidate: terminal }),
        ];
        const requests: Request[] = [];
        const client = createHttpCandidateWorkerClient({
            repositoryUrl: "http://repository.internal",
            workerId: "worker-1",
            workerToken: "worker-service-secret",
            requestTimeoutMs: 1_000,
            maxResponseBytes: 4 * 1_048_576,
            fetch: async (input, init) => {
                requests.push(new Request(input, init));
                return responses.shift()!;
            },
        });

        const listed = await client.listClaimable(1);
        const exactClaim = await client.claim(listed[0]!);
        const exactRenewal = await client.renew(exactClaim.candidate);
        const capability = await client.seal(exactRenewal, resultDigest);
        expect((await client.submit(exactRenewal, capability, result)).status).toBe("published");

        expect(requests).toHaveLength(5);
        expect(requests.map((request) => `${new URL(request.url).pathname}${new URL(request.url).search}`)).toEqual([
            "/.cms/repository-management/api/integrations/verification-jobs?limit=1",
            "/.cms/repository-management/api/integrations/verification-jobs/claims",
            "/.cms/repository-management/api/integrations/verification-jobs/lease",
            "/.cms/repository-management/api/integrations/verification-jobs/result-capabilities",
            "/.cms/repository-management/api/integrations/verification-jobs/result",
        ]);
        expect(requests.slice(0, 4).map((request) => request.headers.get("authorization"))).toEqual([
            "Bearer worker-service-secret",
            "Bearer worker-service-secret",
            "Bearer worker-service-secret",
            "Bearer worker-service-secret",
        ]);
        expect(requests[4]!.headers.get("authorization")).toBe("Bearer sealed-result-capability");
        expect(requests[4]!.headers.get("authorization")).not.toContain("worker-service-secret");
        const submittedBytes = await requests[4]!.bytes();
        expect(submittedBytes).toEqual(canonicalJsonBytes({ expectedRevision: exactRenewal.revision, result }));
    });

    test("rejects stale fencing and capability digest substitution", async () => {
        const claimed = await claimedJob();
        const stale = {
            ...renewedCandidate(claimed.candidate),
            lease: { ...claimed.candidate.lease, attemptId: "substituted-attempt" },
        };
        const staleClient = clientForResponses([json({ candidate: stale })]);
        await expect(staleClient.renew(claimed.candidate)).rejects.toBeInstanceOf(VerificationProtocolError);

        const substitutedClient = clientForResponses([
            json({
                capability: {
                    token: "capability",
                    expiresAt: claimed.candidate.lease.leaseExpiresAt,
                    resultDigest: "f".repeat(64),
                },
            }),
        ]);
        await expect(substitutedClient.seal(claimed.candidate, "e".repeat(64))).rejects.toMatchObject({
            kind: "invalid-response",
        });
    });

    test("rejects a partially publishing result response", async () => {
        const claimed = await claimedJob();
        const result = await validJobResult(claimed);
        const resultDigest = (await identifyCandidateAdmissionJobResult(result)).digest;
        const client = clientForResponses([
            json({
                candidate: {
                    ...claimed.candidate,
                    revision: claimed.candidate.revision + 1,
                    status: "publishing",
                    lease: undefined,
                },
            }),
        ]);

        await expect(
            client.submit(
                claimed.candidate,
                {
                    token: "sealed-result-capability",
                    expiresAt: claimed.candidate.lease.leaseExpiresAt,
                    resultDigest,
                },
                result,
            ),
        ).rejects.toMatchObject({ kind: "invalid-response", retryable: false });
    });

    test("rejects a claim whose package bytes differ from the advertised exact digest", async () => {
        const queued = await queuedCandidate();
        const claimed = await claimedJob();
        const packageValue = {
            ...claimed.workload.package,
            files: {
                ...claimed.workload.package.files,
                "definition.json": { encoding: "utf8", content: '{"substituted":true}' },
            },
        } as const;
        const client = clientForResponses([
            json({ candidate: claimed.candidate, workload: { ...claimed.workload, package: packageValue } }, 201),
        ]);

        await expect(client.claim(queued)).rejects.toMatchObject({ kind: "invalid-response", retryable: false });
    });

    test("rejects missing, extra, or substituted author suite closures", async () => {
        const queued = await queuedCandidate();
        const claimed = await claimedJob();
        const exact = claimed.workload.authorSuites[0]!;
        const invalidSets = [
            [],
            [exact, { ...exact, suiteId: "extra-suite" }],
            [
                {
                    ...exact,
                    content: {
                        ...exact.content,
                        sources: exact.content.sources.map((entry, index) =>
                            index === 0
                                ? {
                                      ...entry,
                                      file: { encoding: "utf8" as const, content: "export default false;" },
                                  }
                                : entry,
                        ),
                    },
                },
            ],
        ];
        for (const authorSuites of invalidSets) {
            const client = clientForResponses([
                json({ candidate: claimed.candidate, workload: { ...claimed.workload, authorSuites } }, 201),
            ]);
            await expect(client.claim(queued)).rejects.toMatchObject({ kind: "invalid-response", retryable: false });
        }
    });
});

function clientForResponses(responses: Response[]) {
    return createHttpCandidateWorkerClient({
        repositoryUrl: "http://repository.internal",
        workerId: "worker-1",
        workerToken: "worker-secret",
        requestTimeoutMs: 1_000,
        maxResponseBytes: 4 * 1_048_576,
        fetch: async () => responses.shift()!,
    });
}

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}
