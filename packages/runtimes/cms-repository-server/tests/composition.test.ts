import { afterEach, describe, expect, test } from "bun:test";
import {
    createIntegrationRegistryCatalogSnapshot,
    type IntegrationRegistryCatalogSnapshot,
} from "@bernouy/cms-integration-registry";
import {
    createRepositoryMaintenanceGuard,
    createRepositoryManagementGuard,
    createRepositoryWorkerGuard,
} from "@bernouy/cms-repository-management";
import { BunRunner } from "@bernouy/http-runner";
import { InMemoryRateLimiter } from "@bernouy/rate-limiter";
import { RepositoryCatalogRuntime } from "../src/core/catalogRuntime";
import { startRepositoryServer, type RepositoryServer } from "../src/core/repositoryServer";

const running = new Set<RepositoryServer>();

afterEach(async () => {
    await Promise.all([...running].map((server) => server.stop()));
    running.clear();
});

describe("repository listener composition", () => {
    test("keeps anonymous reads and authenticated management on distinct listeners", async () => {
        const fixture = await startFixture();
        const publicOrigin = origin(fixture.publicRunner);
        const managementOrigin = origin(fixture.managementRunner);

        const catalog = await fetch(`${publicOrigin}/.cms/repository/api/integrations`);
        expect(catalog.status).toBe(200);
        expect(await catalog.json()).toEqual([]);
        expect(catalog.headers.get("access-control-allow-origin")).toBe("*");

        expect((await fetch(`${publicOrigin}/.cms/repository-management/ping`)).status).toBe(404);
        expect((await fetch(`${managementOrigin}/.cms/repository/api/integrations`)).status).toBe(404);

        const unauthorized = await fetch(`${managementOrigin}/.cms/repository-management/ping`);
        expect(unauthorized.status).toBe(401);
        expect(unauthorized.headers.get("www-authenticate")).toContain("Bearer");

        const authorized = await fetch(`${managementOrigin}/.cms/repository-management/ping`, {
            headers: { authorization: "Bearer management-secret" },
        });
        expect(authorized.status).toBe(200);
        expect(await authorized.json()).toEqual({ managed: true });

        expect(
            (
                await fetch(`${managementOrigin}/.cms/repository-management/ping`, {
                    headers: { authorization: "Bearer maintenance-secret" },
                })
            ).status,
        ).toBe(401);
        expect(
            (
                await fetch(`${managementOrigin}/.cms/repository-management/maintenance-ping`, {
                    headers: { authorization: "Bearer management-secret" },
                })
            ).status,
        ).toBe(401);

        const maintained = await fetch(`${managementOrigin}/.cms/repository-management/maintenance-ping`, {
            headers: { authorization: "Bearer maintenance-secret" },
        });
        expect(maintained.status).toBe(200);
        expect(await maintained.json()).toEqual({ maintained: true });

        for (const token of ["management-secret", "maintenance-secret", "job-capability"]) {
            expect(
                (
                    await fetch(`${managementOrigin}/.cms/repository-management/worker-ping`, {
                        headers: { authorization: `Bearer ${token}` },
                    })
                ).status,
            ).toBe(401);
        }
        const worker = await fetch(`${managementOrigin}/.cms/repository-management/worker-ping`, {
            headers: { authorization: "Bearer worker-secret" },
        });
        expect(worker.status).toBe(200);
        expect((await worker.json()).worker).toBeTrue();
        expect(
            (
                await fetch(`${managementOrigin}/.cms/repository-management/capability-ping`, {
                    headers: { authorization: "Bearer worker-secret" },
                })
            ).status,
        ).toBe(401);
        expect(
            (
                await fetch(`${managementOrigin}/.cms/repository-management/capability-ping`, {
                    headers: { authorization: "Bearer job-capability" },
                })
            ).status,
        ).toBe(200);
        expect((await fetch(`${publicOrigin}/.cms/repository-management/worker-ping`)).status).toBe(404);
    });

    test("keeps readiness while a failed refresh degrades the last valid snapshot", async () => {
        let failRefresh = false;
        const fixture = await startFixture(async () => {
            if (failRefresh) {
                throw new Error("filesystem unavailable");
            }
            return snapshot();
        });
        const publicOrigin = origin(fixture.publicRunner);

        expect(await (await fetch(`${publicOrigin}/ready`)).json()).toMatchObject({
            status: "healthy",
            ready: true,
            revision: 1,
        });
        failRefresh = true;
        expect((await fixture.server.refreshCatalog()).applied).toBe(false);

        const ready = await fetch(`${publicOrigin}/ready`);
        expect(ready.status).toBe(200);
        expect(await ready.json()).toMatchObject({
            status: "degraded",
            ready: true,
            revision: 1,
            lastRefreshFailed: true,
        });
        expect((await fetch(`${publicOrigin}/.cms/repository/api/integrations`)).status).toBe(200);
    });

    test("stops both listeners and makes repeated stop calls idempotent", async () => {
        const fixture = await startFixture();
        const publicOrigin = origin(fixture.publicRunner);
        const managementOrigin = origin(fixture.managementRunner);

        await Promise.all([fixture.server.stop(), fixture.server.stop()]);
        running.delete(fixture.server);

        await expect(fetch(`${publicOrigin}/health`)).rejects.toThrow();
        await expect(fetch(`${managementOrigin}/health`)).rejects.toThrow();
    });
});

async function startFixture(loadCatalog: () => Promise<IntegrationRegistryCatalogSnapshot> = async () => snapshot()) {
    const catalog = new RepositoryCatalogRuntime();
    expect((await catalog.refresh(loadCatalog)).applied).toBe(true);
    const publicRunner = new BunRunner();
    const managementRunner = new BunRunner();
    const server = startRepositoryServer({
        publicRunner,
        managementRunner,
        publicPort: 0,
        managementPort: 0,
        catalog,
        loadCatalog,
        packageDownloadProtection: { clientAddressPolicy: { mode: "disabled" } },
        managementGuard: createRepositoryManagementGuard({
            serviceToken: "management-secret",
            servicePrincipal: "management-cms",
            rateLimiter: new InMemoryRateLimiter({ limit: 10, windowSeconds: 60 }),
        }),
        mountManagement(runner) {
            runner.get("/ping", () => Response.json({ managed: true }));
        },
        maintenance: {
            guard: createRepositoryMaintenanceGuard({
                serviceToken: "maintenance-secret",
                servicePrincipal: "official-maintenance",
                rateLimiter: new InMemoryRateLimiter({ limit: 10, windowSeconds: 60 }),
            }),
            mount(runner) {
                runner.get("/maintenance-ping", () => Response.json({ maintained: true }));
            },
        },
        worker: {
            guard: createRepositoryWorkerGuard({
                serviceToken: "worker-secret",
                servicePrincipal: "integration-verifier-supervisor",
                rateLimiter: new InMemoryRateLimiter({ limit: 10, windowSeconds: 60 }),
            }),
            mountAuthenticated(runner) {
                runner.get("/worker-ping", () => Response.json({ worker: true }));
            },
            mountCapabilities(runner) {
                runner.get("/capability-ping", (request) =>
                    request.headers.get("authorization") === "Bearer job-capability"
                        ? Response.json({ capability: true })
                        : new Response("Unauthorized", { status: 401 }),
                );
            },
        },
        gracefulStopTimeoutMs: 1_000,
    });
    running.add(server);
    return { publicRunner, managementRunner, server };
}

function snapshot(): IntegrationRegistryCatalogSnapshot {
    return createIntegrationRegistryCatalogSnapshot({ entries: [] });
}

function origin(runner: BunRunner): string {
    if (!runner.port) {
        throw new Error("Test runner did not start");
    }
    return `http://127.0.0.1:${runner.port}`;
}
