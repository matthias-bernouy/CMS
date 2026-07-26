import { describe, expect, test } from "bun:test";
import { createIntegrationRegistryCatalogSnapshot } from "@bernouy/cms-integration-registry";
import {
    mountRepositoryManagementReadRoutes,
    REPOSITORY_DIAGNOSTICS_PATH,
    REPOSITORY_STATUS_PATH,
} from "@bernouy/cms-repository-management";
import type { RouteHandler, Runner } from "@bernouy/http-runner";

describe("private repository operational reads", () => {
    test("projects bounded counters, capacity and recent operations through an explicit allowlist", async () => {
        const runner = mounted({
            snapshot: () => ({
                operations: {
                    publication: counter(2, 1, 1),
                    "stable-promotion": counter(1, 1, 0),
                    "compatibility-reevaluation": counter(1, 1, 0),
                },
                compatibility: { reevaluations: 1, warnings: 2, token: "management-secret" },
                publicPackages: {
                    packagesServed: 3,
                    packageBytes: 4_096,
                    releaseNotesServed: 1,
                    releaseNotesBytes: 120,
                    rateLimitRejections: 2,
                    downloadRateLimitRejections: 1,
                    clientAddress: "198.51.100.1",
                },
                repositoryReads: {
                    total: 5,
                    succeeded: 3,
                    notFound: 1,
                    rejected: 1,
                    failed: 0,
                    totalDurationMs: 42,
                    maximumDurationMs: 19,
                    url: "https://repository.internal/private",
                },
                recentOperations: [
                    {
                        schema: "cms.repository.operation.v1",
                        timestamp: "2026-07-26T12:00:00.000Z",
                        operation: "publication",
                        operationId: "operation-1",
                        outcome: "succeeded",
                        durationMs: 7,
                        kind: "demo",
                        version: "1.0.0",
                        digest: "a".repeat(64),
                        reportId: "report-1",
                        evaluatorName: "cms-repository-server",
                        evaluatorVersion: "1.0.0",
                        compatibilityOutcome: "compatible",
                        path: "/var/lib/repository/private",
                        token: "management-secret",
                        packageContents: "do-not-return",
                    },
                ],
            }),
            filesystemCapacity: async () => ({
                status: "available",
                checkedAt: "2026-07-26T12:00:00.000Z",
                totalBytes: "10000",
                freeBytes: "4000",
                availableBytes: "3500",
                usedBytes: "6000",
                usedBasisPoints: 6000,
                path: "/var/lib/repository/private",
            }),
        });

        const status = await runner.handle(REPOSITORY_STATUS_PATH);
        expect(await status.json()).toMatchObject({
            metrics: {
                operations: {
                    publication: { attempted: 2, succeeded: 1, rejected: 1 },
                    stablePromotion: { attempted: 1, succeeded: 1 },
                    compatibilityReevaluation: { attempted: 1, succeeded: 1 },
                },
                compatibility: { reevaluations: 1, warnings: 2 },
                publicPackages: { packagesServed: 3, packageBytes: 4_096, rateLimitRejections: 2 },
                repositoryReads: { total: 5, succeeded: 3, rejected: 1, maximumDurationMs: 19 },
                snapshot: { integrations: 0, versions: 0, quarantined: 0 },
                filesystem: { status: "available", totalBytes: "10000", usedBasisPoints: 6000 },
            },
        });

        const diagnostics = await runner.handle(REPOSITORY_DIAGNOSTICS_PATH);
        const serialized = await diagnostics.text();
        expect(serialized).not.toContain("management-secret");
        expect(serialized).not.toContain("/var/lib/repository");
        expect(serialized).not.toContain("do-not-return");
        expect(JSON.parse(serialized)).toMatchObject({
            recentOperations: [
                {
                    operation: "publication",
                    operationId: "operation-1",
                    digest: "a".repeat(64),
                    outcome: "succeeded",
                },
            ],
        });
    });

    test("keeps status available with a sanitized capacity failure", async () => {
        const runner = mounted({
            snapshot: () => ({}),
            filesystemCapacity: async () => {
                throw new Error("statfs failed for /private/registry with token");
            },
        });

        const response = await runner.handle(REPOSITORY_STATUS_PATH);
        const serialized = await response.text();
        expect(response.status).toBe(200);
        expect(serialized).not.toContain("/private/registry");
        expect(serialized).not.toContain("token");
        expect(JSON.parse(serialized)).toMatchObject({ metrics: { filesystem: { status: "unavailable" } } });
    });
});

function counter(attempted: number, succeeded: number, rejected: number) {
    return { attempted, inFlight: 0, succeeded, rejected, failed: 0, totalDurationMs: 11, maximumDurationMs: 7 };
}

function mounted(operational: { snapshot(): unknown; filesystemCapacity(): Promise<unknown> }) {
    const runner = new ReadTestRunner();
    mountRepositoryManagementReadRoutes(runner as unknown as Runner, {
        catalog: { current: () => createIntegrationRegistryCatalogSnapshot({ entries: [] }) },
        reports: { get: async () => null, list: async () => null, appendRevision: async () => Promise.reject() },
        operational,
    });
    return runner;
}

class ReadTestRunner {
    readonly routes = new Map<string, RouteHandler>();

    get(path: string, handler: RouteHandler): void {
        this.routes.set(`GET ${path}`, handler);
    }

    async handle(path: string): Promise<Response> {
        const handler = this.routes.get(`GET ${path}`);
        if (!handler) {
            throw new Error(`Missing GET handler for ${path}`);
        }
        return await handler(new Request(`http://localhost${path}`));
    }
}
