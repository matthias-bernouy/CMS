import { describe, expect, test } from "bun:test";
import type {
    IntegrationCompatibilityReportPage,
    IntegrationCompatibilityV2ReportStore,
    IntegrationRegistryCatalogSnapshot,
    IntegrationRegistryReleaseEvidence,
    ReleaseReportHistory,
} from "@bernouy/cms-integration-registry";
import type { CompatibilityReportV2 } from "@bernouy/cms-integration-verification";
import { createIntegrationRegistryCatalogSnapshot } from "@bernouy/cms-integration-registry";
import {
    mountRepositoryManagementReadRoutes,
    REPOSITORY_COMPATIBILITY_PATH,
    REPOSITORY_DIAGNOSTICS_PATH,
    REPOSITORY_STATUS_PATH,
    REPOSITORY_RELEASE_PATH,
    REPOSITORY_VERSIONS_PATH,
} from "@bernouy/cms-repository-management";
import type { RouteHandler, Runner } from "@bernouy/http-runner";
import { richReleaseEvidence } from "./releaseFixture";

describe("repository management read routes", () => {
    test("reports status and redacts filesystem sources from diagnostics", async () => {
        const runner = new ReadTestRunner();
        const snapshot = fixtureSnapshot();
        mountRepositoryManagementReadRoutes(runner as unknown as Runner, {
            catalog: { current: () => snapshot },
            reports: new ReportStore(),
            recoveryDiagnostics: () => [
                {
                    code: "publication-quarantined",
                    source: "/var/lib/repository/.internal/journals/private.json",
                    message: "Recovered publication was quarantined",
                    operationId: "operation-1",
                },
            ],
        });

        const status = await runner.handle(REPOSITORY_STATUS_PATH);
        expect(status.status).toBe(200);
        expect(status.headers.get("cache-control")).toBe("no-store");
        expect(await status.json()).toEqual({
            ready: true,
            health: "degraded",
            integrations: 1,
            versions: 1,
            diagnostics: 1,
            quarantined: 1,
            recoveryDiagnostics: 1,
        });

        const diagnostics = await runner.handle(REPOSITORY_DIAGNOSTICS_PATH);
        const serialized = await diagnostics.text();
        expect(serialized).not.toContain("/var/lib/repository");
        expect(JSON.parse(serialized)).toEqual({
            health: "degraded",
            diagnostics: [
                {
                    code: "invalid-package",
                    stage: "package",
                    message: "Package digest is invalid",
                    kind: "commerce",
                    version: "1.0.0",
                },
            ],
            quarantined: [{ diagnosticCodes: ["invalid-package"], kind: "broken" }],
            recovery: [
                {
                    code: "publication-quarantined",
                    message: "Recovered publication was quarantined",
                    operationId: "operation-1",
                },
            ],
        });
    });

    test("returns sanitized version metadata and current report state", async () => {
        const runner = configuredRunner();
        const response = await runner.handle(`${REPOSITORY_VERSIONS_PATH}?kind=commerce`);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({
            kind: "commerce",
            stable: "1.0.0",
            latest: "1.0.0",
            versions: [
                {
                    version: "1.0.0",
                    digest: "a".repeat(64),
                    blockPreview: {
                        current: { stable: "1.0.0", latest: "1.0.0" },
                        next: {},
                    },
                    compatibility: {
                        rootReportId: "admission-1",
                        currentReportRevisionId: "revision-1",
                        currentReportDigest: "c".repeat(64),
                        outcome: "invalid",
                        contractAdmissible: false,
                        warning: true,
                    },
                },
            ],
        });
        expect(JSON.stringify(body)).not.toContain("/registry");
    });

    test("paginates compatibility history with bounded strict input", async () => {
        const reports = new ReportStore();
        const runner = configuredRunner(reports);
        const response = await runner.handle(
            `${REPOSITORY_COMPATIBILITY_PATH}?kind=commerce&version=1.0.0&after=admission-1&limit=25`,
        );

        expect(response.status).toBe(200);
        expect(reports.pages).toEqual([{ after: "admission-1", limit: 25 }]);
        expect(((await response.json()) as { current: { reportId: string } }).current.reportId).toBe("revision-1");

        for (const query of ["", "&limit=0", "&limit=101", "&limit=1.5"]) {
            const invalid = await runner.handle(`${REPOSITORY_COMPATIBILITY_PATH}?kind=commerce&version=1.0.0${query}`);
            if (!query) {
                expect(invalid.status).toBe(200);
            } else {
                expect(invalid.status).toBe(400);
                expect(((await invalid.json()) as { code: string }).code).toBe("management_request_invalid");
            }
        }
    });

    test("returns composite release evidence and exact blocked eligibility", async () => {
        const runner = new ReadTestRunner();
        const release: IntegrationRegistryReleaseEvidence = {
            kind: "commerce",
            version: "1.0.0",
            packageDigest: "a".repeat(64),
            status: "blocked",
            verificationDigest: "b".repeat(64),
            migrations: [],
        };
        mountRepositoryManagementReadRoutes(runner as unknown as Runner, {
            catalog: { current: fixtureSnapshot },
            reports: new ReportStore(),
            releases: { get: async (kind, version) => (kind === "commerce" && version === "1.0.0" ? release : null) },
        });

        const response = await runner.handle(`${REPOSITORY_RELEASE_PATH}?kind=commerce&version=1.0.0`);
        expect(await response.json()).toEqual({
            kind: "commerce",
            version: "1.0.0",
            packageDigest: "a".repeat(64),
            verificationDigest: "b".repeat(64),
            status: "blocked",
            installable: false,
            freshInstallOnly: false,
            migrations: [],
        });
        expect((await runner.handle(`${REPOSITORY_RELEASE_PATH}?kind=commerce&version=2.0.0`)).status).toBe(404);
    });

    test("projects the complete strict release contract for the CMS Control gateway", async () => {
        const runner = new ReadTestRunner();
        mountRepositoryManagementReadRoutes(runner as unknown as Runner, {
            catalog: { current: fixtureSnapshot },
            reports: new ReportStore(),
            releases: { get: async () => richReleaseEvidence() },
        });

        const response = await runner.handle(`${REPOSITORY_RELEASE_PATH}?kind=commerce&version=1.0.0`);
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            verification: {
                createdAt: "2026-07-26T10:00:00.000Z",
                activeContracts: [{ contractId: "public-api", ownerVersion: "1.0.0", digest: "c".repeat(64) }],
                results: [{ suiteId: "platform-postgres-install-reapply", durationMs: 17 }],
            },
            migrations: [
                {
                    cutoverEvidence: {
                        cmsMediated: { outcome: "not-supported" },
                        providerDirect: { outcome: "passed", evidenceDigest: "c".repeat(64) },
                        activation: { outcome: "not-applicable" },
                    },
                    operationalEvidence: {
                        downtime: { status: "zero-downtime", observedSeconds: 0 },
                        drain: { cmsMediatedSeconds: 30, providerDirectSeconds: 60 },
                    },
                },
            ],
        });
    });

    test("returns stable 400 and 404 errors", async () => {
        const runner = configuredRunner();
        expect((await runner.handle(REPOSITORY_VERSIONS_PATH)).status).toBe(400);
        expect((await runner.handle(`${REPOSITORY_VERSIONS_PATH}?kind=missing`)).status).toBe(404);
        expect((await runner.handle(`${REPOSITORY_COMPATIBILITY_PATH}?kind=commerce`)).status).toBe(400);
        expect((await runner.handle(`${REPOSITORY_COMPATIBILITY_PATH}?kind=commerce&version=2.0.0`)).status).toBe(404);
    });
});

function configuredRunner(reports = new ReportStore()): ReadTestRunner {
    const runner = new ReadTestRunner();
    mountRepositoryManagementReadRoutes(runner as unknown as Runner, {
        catalog: { current: fixtureSnapshot },
        reports,
    });
    return runner;
}

class ReadTestRunner {
    readonly routes = new Map<string, RouteHandler>();

    get(path: string, handler: RouteHandler): void {
        this.routes.set(`GET ${path}`, handler);
    }

    async handle(path: string): Promise<Response> {
        const url = new URL(path, "http://localhost");
        const handler = this.routes.get(`GET ${url.pathname}`);
        if (!handler) {
            throw new Error(`Missing GET handler for ${url.pathname}`);
        }
        return await handler(new Request(url));
    }
}

class ReportStore implements IntegrationCompatibilityV2ReportStore {
    readonly pages: Array<{ after?: string; limit?: number }> = [];

    async get(kind: string, version: string): Promise<ReleaseReportHistory<CompatibilityReportV2> | null> {
        return kind === "commerce" && version === "1.0.0" ? reportHistory() : null;
    }

    async list(kind: string, version: string, page = {}): Promise<IntegrationCompatibilityReportPage | null> {
        this.pages.push(page);
        const history = await this.get(kind, version);
        return history
            ? {
                  root: history.revisions[0]!,
                  current: history.current,
                  currentRevisionId: history.currentRevisionId,
                  currentReportDigest: history.currentReportDigest,
                  revisions: [history.revisions[1]!],
                  totalRevisions: 1,
              }
            : null;
    }

    async append(): Promise<ReleaseReportHistory<CompatibilityReportV2>> {
        return reportHistory();
    }
}

function fixtureSnapshot(): IntegrationRegistryCatalogSnapshot {
    return createIntegrationRegistryCatalogSnapshot({
        entries: [
            {
                source: "/registry/commerce",
                index: {
                    kind: "commerce",
                    label: "Commerce",
                    stable: "1.0.0",
                    latest: "1.0.0",
                    versions: [{ version: "1.0.0", path: "1.0.0", definition: "definition.json" }],
                },
                versions: [
                    {
                        kind: "commerce",
                        version: "1.0.0",
                        integrationRoot: "/registry/commerce",
                        packageRoot: "/registry/commerce/1.0.0",
                        definition: "/registry/commerce/1.0.0/definition.json",
                        definitionSnapshot: {
                            kind: "commerce",
                            version: "1.0.0",
                            label: "Commerce",
                            inputs: [],
                            artifacts: [],
                        },
                        package: {
                            schema: "cms.integration.package.v1",
                            digest: "a".repeat(64),
                            canonicalBytes: 10,
                            decodedBytes: 5,
                            files: 1,
                        },
                    },
                ],
            },
        ],
        diagnostics: [
            {
                code: "invalid-package",
                stage: "package",
                source: "/var/lib/repository/commerce/1.0.0",
                message: "Package digest is invalid",
                kind: "commerce",
                version: "1.0.0",
            },
        ],
        quarantined: [
            {
                source: "/var/lib/repository/quarantine/broken",
                diagnosticCodes: ["invalid-package"],
                kind: "broken",
            },
        ],
    });
}

function reportHistory(): ReleaseReportHistory<CompatibilityReportV2> {
    const base = {
        schema: "cms.integration.compatibility-report.v2" as const,
        kind: "commerce",
        version: "1.0.0",
        packageDigest: "a".repeat(64),
        evaluator: { name: "test", version: "1" },
        createdAt: "2026-07-26T00:00:00.000Z",
        baselines: [],
        informationalBaselines: [],
        releaseLevel: "initial" as const,
        noBaselineReason: "new-kind" as const,
        origin: "admission" as const,
        provenance: { actor: "repository-owner", reason: "Comparator update" },
    };
    const root: CompatibilityReportV2 = {
        ...base,
        reportId: "admission-1",
        revisionType: "root",
        findings: [],
        outcome: "not-applicable",
        requiredReleaseLevel: "none",
        contractAdmissible: true,
    };
    const revision: CompatibilityReportV2 = {
        ...base,
        reportId: "revision-1",
        revisionType: "revision",
        findings: [
            {
                findingId: "f".repeat(64),
                surface: "schema",
                path: "public.orders",
                code: "schema-invalid",
                baselineDigest: "a".repeat(64),
                candidateDigest: "a".repeat(64),
                classification: "invalid",
                message: "Schema declaration is invalid",
            },
        ],
        outcome: "invalid",
        requiredReleaseLevel: "none",
        contractAdmissible: false,
        supersedes: root.reportId,
    };
    return {
        currentRevisionId: revision.reportId,
        currentReportDigest: "c".repeat(64),
        current: revision,
        revisions: [root, revision],
    };
}
