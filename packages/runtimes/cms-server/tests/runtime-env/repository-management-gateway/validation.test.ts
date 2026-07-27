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
    candidateProjection,
    candidateReport,
    compatibilityPage,
    promotionRecord,
    revisionReport,
    TEST_CANDIDATE_DIGEST,
    TEST_KIND,
    TEST_VERIFICATION_DIGEST,
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
            () =>
                gateway(
                    oneResponse(candidateReport({ privatePackage: { sql: "SELECT private_secret" } })),
                ).candidateReport("candidate-1"),
            () =>
                gateway(
                    oneResponse(
                        candidateReport({ candidate: candidateProjection({ candidateId: "candidate-substituted" }) }),
                    ),
                ).candidateReport("candidate-1"),
            () => gateway(oneResponse(tamperedCandidateReport("verification"))).candidateReport("candidate-1"),
            () => gateway(oneResponse(tamperedCandidateReport("migration"))).candidateReport("candidate-1"),
            () => gateway(oneResponse(tamperedCandidateReport("diagnostic"))).candidateReport("candidate-1"),
            () => gateway(oneResponse(tamperedCandidateReport("finding"))).candidateReport("candidate-1"),
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
            () => gateway(oneResponse(candidateReport())).candidateReport("candidate-1"),
            () => gateway(oneResponse(plannedCandidateReport())).candidateReport("candidate-1"),
        ];
        expect(await Promise.all(successCases.map(async (execute) => (await execute()).status))).toEqual([
            200, 200, 200, 200, 201, 201, 201, 200, 200,
        ]);
    });

    test("preserves a sanitized candidate report absence", async () => {
        const response = await gateway(
            oneResponse({ code: "candidate_not_found", error: "Private candidate path did not exist" }, 404),
        ).candidateReport("candidate-1");

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ code: "candidate_not_found", error: "Candidate operation failed" });
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

function plannedCandidateReport() {
    return candidateReport({
        compatibility: undefined,
        verification: {
            state: "planned",
            bindings: {
                candidateId: "candidate-1",
                candidateDigest: TEST_CANDIDATE_DIGEST,
                packageDigest: "a".repeat(64),
                verificationDigest: TEST_VERIFICATION_DIGEST,
                policyDigest: "e".repeat(64),
            },
            runner: { name: "cms-postgres", version: "1.0.0", imageDigest: `sha256:${"f".repeat(64)}` },
            suites: [
                {
                    suiteId: "platform-clean-install",
                    source: "platform",
                    contentDigest: "1".repeat(64),
                    applicable: true,
                },
            ],
        },
        migrations: [],
    });
}

function tamperedCandidateReport(target: "verification" | "migration" | "diagnostic" | "finding") {
    const body = structuredClone(candidateReport()) as {
        report: {
            verification: { bindings: { packageDigest: string }; suites: Array<{ diagnostics: unknown[] }> };
            migrations: Array<{ target: { packageDigest: string } }>;
            compatibility: { findings: Array<{ baselineDigest: string }> };
        };
    };
    if (target === "verification") {
        body.report.verification.bindings.packageDigest = "f".repeat(64);
    } else if (target === "migration") {
        body.report.migrations[0]!.target.packageDigest = "f".repeat(64);
    } else if (target === "diagnostic") {
        body.report.verification.suites[0]!.diagnostics = [
            { code: "contract-failed", redacted: true, message: "Private fixture contents" },
        ];
    } else {
        body.report.compatibility.findings[0]!.baselineDigest = "f".repeat(64);
    }
    return body;
}
