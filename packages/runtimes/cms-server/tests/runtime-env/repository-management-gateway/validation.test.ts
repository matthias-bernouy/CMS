import { describe, expect, test } from "bun:test";
import {
    gateway,
    jsonResponse,
    packageFixture,
    TEST_ACTOR,
    validOperationalMetrics,
    validStatus,
    validVersions,
} from "./fixtures";
import {
    admissionReport,
    compatibilityPage,
    promotionRecord,
    revisionReport,
    TEST_KIND,
    TEST_VERSION,
} from "./reports";

describe("HTTP repository management gateway DTO validation", () => {
    test("rejects extra fields, identity drift, invalid digests, report chains, actors, and confirmations", async () => {
        const publication = await packageFixture();
        const cases: Array<() => Promise<Response>> = [
            () => gateway(oneResponse({ ...validStatus(), internal: "secret" })).status(),
            () =>
                gateway(
                    oneResponse({
                        ...validStatus(),
                        metrics: {
                            ...validOperationalMetrics(),
                            filesystem: {
                                ...(validOperationalMetrics().filesystem as Record<string, unknown>),
                                path: "/private/registry",
                            },
                        },
                    }),
                ).status(),
            () =>
                gateway(
                    oneResponse({
                        health: "degraded",
                        diagnostics: [
                            {
                                code: "invalid-package",
                                stage: "package",
                                message: "Package is invalid",
                                source: "/private/registry",
                            },
                        ],
                        quarantined: [],
                        recovery: [],
                    }),
                ).diagnostics(),
            () =>
                gateway(
                    oneResponse({
                        ...validVersions(),
                        versions: [{ version: TEST_VERSION, digest: "not-a-digest", compatibility: null }],
                    }),
                ).versions(TEST_KIND),
            () =>
                gateway(
                    oneResponse({
                        admission: admissionReport(),
                        current: revisionReport(),
                        revisions: [revisionReport({ supersedes: "wrong-report" })],
                        totalRevisions: 1,
                    }),
                ).compatibility({ kind: TEST_KIND, version: TEST_VERSION }),
            () =>
                gateway(
                    oneResponse(
                        {
                            operationId: "publication-operation",
                            kind: TEST_KIND,
                            version: TEST_VERSION,
                            digest: "b".repeat(64),
                            report: admissionReport({ packageDigest: "b".repeat(64) }),
                        },
                        201,
                    ),
                ).publish(publication.bytes),
            () =>
                gateway(
                    oneResponse(
                        {
                            revision: revisionReport({
                                provenance: { actor: "browser-actor", reason: "Manual evidence review" },
                            }),
                            currentReportRevisionId: "report-revision",
                        },
                        201,
                    ),
                ).reevaluate({
                    kind: TEST_KIND,
                    version: TEST_VERSION,
                    currentReportRevisionId: "report-admission",
                    currentDecision: { revisionId: "decision-admission", digest: "d".repeat(64) },
                    reason: "Manual evidence review",
                }),
            () =>
                gateway(
                    oneResponse(
                        {
                            operationId: "promotion-operation",
                            record: promotionRecord({ actor: "browser-actor" }),
                        },
                        201,
                    ),
                ).promoteStable(promotionInput()),
        ];
        for (const execute of cases) {
            expect((await execute()).status).toBe(503);
        }
    });

    test("accepts complete success DTOs for reads and mutations", async () => {
        const publication = await packageFixture();
        const compatibility = compatibilityPage();
        const successCases: Array<() => Promise<Response>> = [
            () => gateway(oneResponse(validStatus())).status(),
            () => gateway(oneResponse({ ...validStatus(), metrics: validOperationalMetrics() })).status(),
            () => gateway(oneResponse(validVersions())).versions(TEST_KIND),
            () => gateway(oneResponse(compatibility)).compatibility({ kind: TEST_KIND, version: TEST_VERSION }),
            () =>
                gateway(
                    oneResponse(
                        {
                            operationId: "publication-operation",
                            kind: TEST_KIND,
                            version: TEST_VERSION,
                            digest: publication.digest,
                            report: admissionReport({ packageDigest: publication.digest }),
                        },
                        201,
                    ),
                ).publish(publication.bytes),
            () =>
                gateway(
                    oneResponse({ revision: revisionReport(), currentReportRevisionId: "report-revision" }, 201),
                ).reevaluate({
                    kind: TEST_KIND,
                    version: TEST_VERSION,
                    currentReportRevisionId: "report-admission",
                    currentDecision: { revisionId: "decision-admission", digest: "d".repeat(64) },
                    reason: "Manual evidence review",
                }),
            () =>
                gateway(
                    oneResponse(
                        { operationId: "promotion-operation", record: promotionRecord({ actor: TEST_ACTOR }) },
                        201,
                    ),
                ).promoteStable(promotionInput()),
        ];
        expect(await Promise.all(successCases.map(async (execute) => (await execute()).status))).toEqual([
            200, 200, 200, 200, 201, 201, 201,
        ]);
    });

    test("never forwards upstream response headers", async () => {
        const client = gateway(
            oneResponse(validStatus(), 200, {
                "set-cookie": "repository-secret=exposed",
                "x-repository-url": "https://repository.internal/private",
            }),
        );

        const response = await client.status();

        expect(response.status).toBe(200);
        expect([...response.headers.keys()].sort()).toEqual(["cache-control", "content-type"]);
    });
});

function oneResponse(body: unknown, status = 200, headers: HeadersInit = {}): typeof fetch {
    return (async () => jsonResponse(body, status, headers)) as typeof fetch;
}

function promotionInput() {
    return {
        kind: TEST_KIND,
        version: TEST_VERSION,
        currentReportRevisionId: "report-admission",
        confirmation: { version: TEST_VERSION, reportRevisionId: "report-admission" },
    };
}
