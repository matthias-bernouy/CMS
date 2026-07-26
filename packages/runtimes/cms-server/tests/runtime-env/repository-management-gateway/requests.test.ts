import { describe, expect, test } from "bun:test";
import type {
    RepositoryReevaluationInput,
    RepositoryStablePromotionInput,
    RepositoryVersionBlockInput,
} from "@bernouy/cms-control";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { validateIntegrationCandidateEnvelope } from "@bernouy/cms-integration-verification";
import { gateway, jsonResponse, managementResponseFor, packageFixture, TEST_ACTOR, TEST_TOKEN } from "./fixtures";
import { revisionReport, TEST_KIND, TEST_VERSION } from "./reports";

describe("HTTP repository management gateway requests", () => {
    test("calls only the seven allowlisted endpoints with exact application headers", async () => {
        const publication = await packageFixture();
        const captured: Array<{ url: URL; init: RequestInit }> = [];
        const after = "report/revision?cursor=yes&next=1";
        const fetchImpl = (async (input, init = {}) => {
            const url = new URL(String(input));
            captured.push({ url, init });
            return managementResponseFor(url, publication.digest, after);
        }) as typeof fetch;
        const client = gateway(fetchImpl);

        const responses = [
            await client.status(),
            await client.diagnostics(),
            await client.versions(TEST_KIND),
            await client.compatibility({ kind: TEST_KIND, version: TEST_VERSION, after, limit: 17 }),
            await client.publish(publication.bytes),
            await client.reevaluate(
                maliciousReevaluation({
                    kind: TEST_KIND,
                    version: TEST_VERSION,
                    currentReportRevisionId: "report-admission",
                    currentDecision: { revisionId: "decision-admission", digest: "d".repeat(64) },
                    reason: "Manual evidence review",
                    evidenceIds: ["evidence-z", "evidence-a"],
                }),
            ),
            await client.promoteStable(
                maliciousPromotion({
                    kind: TEST_KIND,
                    version: TEST_VERSION,
                    currentReportRevisionId: "report-admission",
                    confirmation: { version: TEST_VERSION, reportRevisionId: "report-admission" },
                }),
            ),
        ];

        expect(responses.map(({ status }) => status)).toEqual([200, 200, 200, 200, 201, 201, 201]);
        expect(captured.map(({ url }) => url.pathname)).toEqual([
            "/.cms/repository-management/api/status",
            "/.cms/repository-management/api/diagnostics",
            "/.cms/repository-management/api/integrations/versions",
            "/.cms/repository-management/api/integrations/compatibility",
            "/.cms/repository-management/api/integrations/publications",
            "/.cms/repository-management/api/integrations/compatibility/reevaluations",
            "/.cms/repository-management/api/integrations/stable-promotions",
        ]);
        expect(captured[2]!.url.search).toBe(`?kind=${TEST_KIND}`);
        expect(captured[3]!.url.search).toContain("after=report%2Frevision%3Fcursor%3Dyes%26next%3D1");
        expect(captured[3]!.url.searchParams.get("limit")).toBe("17");
        for (const [index, request] of captured.entries()) {
            const post = index >= 4;
            expect(request.init.method).toBe(post ? "POST" : "GET");
            expect(request.init.credentials).toBe("omit");
            expect(request.init.redirect).toBe("error");
            expect(Object.fromEntries(new Headers(request.init.headers))).toEqual({
                accept: "application/json",
                authorization: `Bearer ${TEST_TOKEN}`,
                ...(post ? { "content-type": "application/json" } : {}),
            });
        }
        expect(new Uint8Array(captured[4]!.init.body as ArrayBuffer)).toEqual(publication.bytes);
        expect(await requestJson(captured[5]!.init)).toEqual({
            kind: TEST_KIND,
            version: TEST_VERSION,
            currentReportRevisionId: "report-admission",
            currentDecision: { revisionId: "decision-admission", digest: "d".repeat(64) },
            reason: "Manual evidence review",
            evidenceIds: ["evidence-a", "evidence-z"],
            actor: TEST_ACTOR,
        });
        expect(await requestJson(captured[6]!.init)).toEqual({
            kind: TEST_KIND,
            version: TEST_VERSION,
            currentReportRevisionId: "report-admission",
            confirmation: { version: TEST_VERSION, reportRevisionId: "report-admission" },
            actor: TEST_ACTOR,
        });
    });

    test("sends the server credential and actor over a real HTTP listener", async () => {
        let received: Record<string, unknown> | undefined;
        const server = Bun.serve({
            port: 0,
            async fetch(request) {
                received = {
                    pathname: new URL(request.url).pathname,
                    authorization: request.headers.get("authorization"),
                    accept: request.headers.get("accept"),
                    contentType: request.headers.get("content-type"),
                    cookie: request.headers.get("cookie"),
                    body: await request.json(),
                };
                return jsonResponse(
                    {
                        revision: revisionReport(),
                        currentReportRevisionId: "report-revision",
                    },
                    201,
                );
            },
        });
        try {
            const client = gateway(fetch, {
                baseUrl: `${server.url.origin}/private-management`,
            });
            const response = await client.reevaluate({
                kind: TEST_KIND,
                version: TEST_VERSION,
                currentReportRevisionId: "report-admission",
                currentDecision: { revisionId: "decision-admission", digest: "d".repeat(64) },
                reason: "Manual evidence review",
            });

            expect(response.status).toBe(201);
            expect(received).toEqual({
                pathname: "/private-management/api/integrations/compatibility/reevaluations",
                authorization: `Bearer ${TEST_TOKEN}`,
                accept: "application/json",
                contentType: "application/json",
                cookie: null,
                body: {
                    kind: TEST_KIND,
                    version: TEST_VERSION,
                    currentReportRevisionId: "report-admission",
                    currentDecision: { revisionId: "decision-admission", digest: "d".repeat(64) },
                    reason: "Manual evidence review",
                    actor: TEST_ACTOR,
                },
            });
        } finally {
            server.stop(true);
        }
    });

    test("submits candidates, polls progress, reads release evidence, and blocks with an injected actor", async () => {
        const packageValue = await packageFixture();
        const candidate = await validateIntegrationCandidateEnvelope({
            schema: "cms.integration.candidate.v1",
            package: packageValue.envelope,
            verification: {
                schema: "cms.integration.verification.v1",
                target: { kind: TEST_KIND, version: TEST_VERSION, packageDigest: packageValue.digest },
                manifest: {
                    runnerRequirements: [{ name: "cms-postgres", versionRange: "^1.0.0" }],
                    contracts: [],
                    conformance: [],
                    fixtures: [],
                },
                files: {},
            },
            submission: { requestedChannel: "latest" },
        });
        const candidateBytes = canonicalJsonBytes(candidate.envelope);
        const block = versionBlockInput();
        const captured: Array<{ url: URL; init: RequestInit }> = [];
        const fetchImpl = (async (input, init = {}) => {
            const url = new URL(String(input));
            captured.push({ url, init });
            if (url.pathname.endsWith("/release")) {
                return jsonResponse(releaseEvidence());
            }
            if (url.pathname.endsWith("/candidates/status")) {
                return jsonResponse({ candidate: candidateStatus(candidate) });
            }
            if (url.pathname.endsWith("/candidates")) {
                return jsonResponse({ candidate: candidateStatus(candidate) }, 202);
            }
            if (url.pathname.endsWith("/version-blocks")) {
                return jsonResponse({ operationId: "block-operation", record: blockRecord(block) }, 201);
            }
            return jsonResponse({ code: "unexpected", error: "Unexpected" }, 500);
        }) as typeof fetch;
        const client = gateway(fetchImpl);

        const responses = [
            await client.release(TEST_KIND, TEST_VERSION),
            await client.submitCandidate(candidateBytes),
            await client.candidateStatus("candidate-1"),
            await client.blockVersion(block),
        ];

        expect(responses.map(({ status }) => status)).toEqual([200, 202, 200, 201]);
        expect(captured.map(({ url }) => url.pathname)).toEqual([
            "/.cms/repository-management/api/integrations/release",
            "/.cms/repository-management/api/integrations/candidates",
            "/.cms/repository-management/api/integrations/candidates/status",
            "/.cms/repository-management/api/integrations/version-blocks",
        ]);
        expect(captured[0]!.url.searchParams.get("version")).toBe(TEST_VERSION);
        expect(captured[2]!.url.searchParams.get("candidateId")).toBe("candidate-1");
        expect(new Uint8Array(captured[1]!.init.body as ArrayBuffer)).toEqual(candidateBytes);
        expect(await requestJson(captured[3]!.init)).toEqual({ ...block, actor: TEST_ACTOR });
    });
});

function candidateStatus(candidate: Awaited<ReturnType<typeof validateIntegrationCandidateEnvelope>>) {
    return {
        candidateId: "candidate-1",
        revision: 1,
        status: "queued",
        kind: TEST_KIND,
        version: TEST_VERSION,
        candidateDigest: candidate.candidateDigest,
        packageDigest: candidate.packageDigest,
        verificationDigest: candidate.verificationDigest,
        createdAt: "2026-07-26T12:00:00.000Z",
        updatedAt: "2026-07-26T12:00:00.000Z",
        expiresAt: "2026-07-27T12:00:00.000Z",
        attemptCount: 0,
        requestedChannel: "latest",
    };
}

function releaseEvidence() {
    return {
        kind: TEST_KIND,
        version: TEST_VERSION,
        packageDigest: "a".repeat(64),
        status: "unverified",
        installable: false,
        freshInstallOnly: false,
        migrations: [],
    };
}

function versionBlockInput(): RepositoryVersionBlockInput {
    return {
        kind: TEST_KIND,
        version: TEST_VERSION,
        currentDecision: { revisionId: "decision-1", digest: "d".repeat(64) },
        reason: "Production incident",
        confirmation: {
            action: "block",
            kind: TEST_KIND,
            version: TEST_VERSION,
            decisionRevisionId: "decision-1",
            decisionDigest: "d".repeat(64),
        },
    };
}

function blockRecord(input: RepositoryVersionBlockInput) {
    return {
        schema: "cms.integration.registry.version-eligibility.v1",
        id: "block-1",
        operationId: "block-operation",
        action: "block",
        kind: input.kind,
        version: input.version,
        packageDigest: "a".repeat(64),
        decision: input.currentDecision,
        nextStatus: "blocked",
        previousChannels: { stable: input.version, latest: input.version },
        nextChannels: {},
        provenance: { actor: TEST_ACTOR, reason: input.reason },
        confirmation: input.confirmation,
        createdAt: "2026-07-26T12:00:00.000Z",
    };
}

async function requestJson(init: RequestInit): Promise<unknown> {
    return await new Response(init.body).json();
}

function maliciousReevaluation(input: RepositoryReevaluationInput): RepositoryReevaluationInput {
    return { ...input, actor: "browser-controlled-actor" } as RepositoryReevaluationInput;
}

function maliciousPromotion(input: RepositoryStablePromotionInput): RepositoryStablePromotionInput {
    return { ...input, actor: "browser-controlled-actor" } as RepositoryStablePromotionInput;
}
