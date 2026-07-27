import { afterEach, describe, expect, test } from "bun:test";
import { buildFsIntegrationRegistryCatalogSnapshot } from "@bernouy/cms-integration-registry/fs";
import { BunRunner } from "@bernouy/http-runner";
import { RepositoryCatalogRuntime } from "../../src/core/catalogRuntime";
import { startRepositoryServer, type RepositoryServer } from "../../src/core/repositoryServer";
import { createProductionRepositoryManagement } from "../../src/management";
import { TemporaryRoots } from "../storage/fixtures";
import { authenticatedFetch, managementGuard, origin } from "./support";

const roots = new TemporaryRoots();
const servers: RepositoryServer[] = [];

afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.stop()));
    await roots.cleanup();
});

describe("production repository management", () => {
    test("exposes candidate publication without retaining the obsolete raw route", async () => {
        const root = await roots.create();
        const catalog = new RepositoryCatalogRuntime();
        const loadCatalog = () => buildFsIntegrationRegistryCatalogSnapshot({ root });
        expect((await catalog.refresh(loadCatalog)).applied).toBe(true);
        const management = await createProductionRepositoryManagement({ root, catalog });
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
            integrationCompatibility: management.compatibility,
            managementGuard: managementGuard(),
            mountManagement: management.mount,
        });
        servers.push(server);

        const managementOrigin = origin(managementRunner);
        const publicOrigin = origin(publicRunner);
        const unauthorized = await fetch(`${managementOrigin}/.cms/repository-management/api/integrations/candidates`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
        });
        expect(unauthorized.status).toBe(401);

        for (const path of [
            "/api/integrations/candidates",
            "/api/integrations/stable-promotions",
            "/api/integrations/compatibility/reevaluations",
        ]) {
            const rejectedMaintenanceCredential = await fetch(`${managementOrigin}/.cms/repository-management${path}`, {
                method: "POST",
                headers: {
                    authorization: "Bearer maintenance-secret",
                    "content-type": "application/json",
                },
                body: "{}",
            });
            expect(rejectedMaintenanceCredential.status).toBe(401);
        }

        const removed = await fetch(`${managementOrigin}/.cms/repository-management/api/integrations/publications`, {
            method: "POST",
            headers: { authorization: "Bearer management-secret", "content-type": "application/json" },
            body: "{}",
        });
        expect(removed.status).toBe(404);

        const status = await authenticatedFetch(`${managementOrigin}/.cms/repository-management/api/status`);
        expect(status.status).toBe(200);
        expect(await status.json()).toMatchObject({
            ready: true,
            health: "healthy",
            integrations: 0,
            versions: 0,
        });
        const versions = await authenticatedFetch(
            `${managementOrigin}/.cms/repository-management/api/integrations/versions?kind=remote-demo`,
        );
        expect(versions.status).toBe(404);

        const integrations = await fetch(`${publicOrigin}/.cms/repository/api/integrations`);
        expect(integrations.status).toBe(200);
        expect(await integrations.json()).toEqual([]);
        expect(catalog.current().getIndex("remote-demo")).toBeNull();
        expect((await fetch(`${publicOrigin}/.cms/repository-management/api/integrations/publications`)).status).toBe(
            404,
        );
    });
});
