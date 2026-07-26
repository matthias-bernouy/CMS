import { afterEach, describe, expect, test } from "bun:test";
import {
    InMemoryIntegrationRegistryMutationCoordinator,
    IntegrationCompatibilityEvaluator,
} from "@bernouy/cms-integration-registry";
import {
    buildFsIntegrationRegistryCatalogSnapshot,
    FsIntegrationRegistryPublisher,
    FsReviewedSchemaBaselineStore,
} from "@bernouy/cms-integration-registry/fs";
import { RepositoryManagementCms } from "@bernouy/cms-repository-management";
import { BunRunner } from "@bernouy/http-runner";
import { RepositoryCatalogRuntime } from "../../src/core/catalogRuntime";
import { startRepositoryServer, type RepositoryServer } from "../../src/core/repositoryServer";
import { createProductionRepositoryManagement } from "../../src/management";
import { TemporaryRoots } from "../storage/fixtures";
import { authenticatedJson, managementGuard, origin, publicationDocument } from "./support";

const roots = new TemporaryRoots();
const servers: RepositoryServer[] = [];

afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.stop()));
    await roots.cleanup();
});

describe("raw repository publication over HTTP", () => {
    test("keeps transitional publications unverified and preserves conflict semantics after enforcement", async () => {
        const root = await roots.create();
        const catalog = new RepositoryCatalogRuntime();
        const loadCatalog = () => buildFsIntegrationRegistryCatalogSnapshot({ root });
        expect((await catalog.refresh(loadCatalog)).applied).toBe(true);

        const transitional = startTransitionalServer(root, catalog, loadCatalog);
        servers.push(transitional.server);
        const transitionalManagementOrigin = origin(transitional.managementRunner);
        const transitionalPublicOrigin = origin(transitional.publicRunner);
        const created = await authenticatedJson(
            `${transitionalManagementOrigin}/.cms/repository-management/api/integrations/publications`,
            publicationDocument("1.0.0"),
        );
        expect(created.status).toBe(201);
        const createdBody = (await created.json()) as { digest: string };

        const publicIndex = await fetch(
            `${transitionalPublicOrigin}/.cms/repository/api/integrations/index?kind=remote-demo`,
        );
        expect(publicIndex.status).toBe(200);
        const publicIndexDocument = (await publicIndex.json()) as Record<string, unknown>;
        expect(publicIndexDocument).toMatchObject({
            kind: "remote-demo",
            label: "Remote demo",
            versions: [{ version: "1.0.0", status: "unverified" }],
        });
        expect(publicIndexDocument).not.toHaveProperty("stable");
        expect(publicIndexDocument).not.toHaveProperty("latest");
        const implicitDefinition = await fetch(
            `${transitionalPublicOrigin}/.cms/repository/api/integrations/definition?kind=remote-demo`,
        );
        expect(implicitDefinition.status).toBe(404);
        await transitional.server.stop();

        const production = await createProductionRepositoryManagement({ root, catalog });
        const publicRunner = new BunRunner();
        const managementRunner = new BunRunner();
        const productionServer = startRepositoryServer({
            publicRunner,
            managementRunner,
            publicPort: 0,
            managementPort: 0,
            catalog,
            loadCatalog,
            packageDownloadProtection: { clientAddressPolicy: { mode: "disabled" } },
            integrationCompatibility: production.compatibility,
            integrationReleases: production.releases,
            managementGuard: managementGuard(),
            mountManagement: production.mount,
        });
        servers.push(productionServer);
        const managementOrigin = origin(managementRunner);

        const duplicate = await authenticatedJson(
            `${managementOrigin}/.cms/repository-management/api/integrations/publications`,
            publicationDocument("1.0.0"),
        );
        expect(duplicate.status).toBe(409);
        expect(await duplicate.json()).toEqual({
            error: "Integration version already exists",
            code: "integration_version_exists",
            kind: "remote-demo",
            version: "1.0.0",
            existingDigest: createdBody.digest,
        });

        const indexBeforeRejection = catalog.current().getIndex("remote-demo");
        const rejected = await authenticatedJson(
            `${managementOrigin}/.cms/repository-management/api/integrations/publications`,
            publicationDocument("1.1.0"),
        );
        expect(rejected.status).toBe(422);
        expect(await rejected.json()).toMatchObject({
            code: "verification_required",
            kind: "remote-demo",
            version: "1.1.0",
        });
        expect(catalog.current().getIndex("remote-demo")).toBe(indexBeforeRejection);
        expect(catalog.current().locateExactVersion("remote-demo", "1.1.0")).toBeNull();
    });
});

function startTransitionalServer(
    root: string,
    catalog: RepositoryCatalogRuntime,
    loadCatalog: () => ReturnType<typeof buildFsIntegrationRegistryCatalogSnapshot>,
) {
    const publisher = new FsIntegrationRegistryPublisher({
        root,
        snapshots: catalog.snapshotReference(),
        compatibility: new IntegrationCompatibilityEvaluator({
            identity: { name: "raw-publication-http-test", version: "1.0.0" },
            now: () => "2026-07-27T12:00:00.000Z",
            createReportId: () => "raw-publication-http-report",
        }),
        mutations: new InMemoryIntegrationRegistryMutationCoordinator(),
        reviewedSchemaBaselines: new FsReviewedSchemaBaselineStore({ root }),
        rawPublicationPolicy: "publish-unverified",
    });
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
        managementGuard: managementGuard(),
        mountManagement(runner) {
            new RepositoryManagementCms({
                runner,
                publisher,
                upload: { maxBodyBytes: 32 * 1_024 * 1_024 },
                existingVersionDigest(kind, version) {
                    return catalog.current().locateExactVersion(kind, version)?.package.digest ?? null;
                },
            });
        },
    });
    return { server, publicRunner, managementRunner };
}
