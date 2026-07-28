import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    identifyReviewedSchemaBaselineImportRequest,
    REVIEWED_SCHEMA_BASELINE_IMPORT_SCHEMA,
} from "@bernouy/cms-integration-registry";
import {
    buildFsIntegrationRegistryCatalogSnapshot,
    FsReviewedSchemaBaselineStore,
} from "@bernouy/cms-integration-registry/fs";
import {
    buildOfficialRepositoryBootstrapPlan,
    loadOfficialRepositoryBootstrapEvidence,
    OFFICIAL_REPOSITORY_BOOTSTRAP_BASELINE_APPROVAL,
} from "@bernouy/cms-official-integrations/publication";
import { createRepositoryMaintenanceGuard, createRepositoryManagementGuard } from "@bernouy/cms-repository-management";
import { BunRunner } from "@bernouy/http-runner";
import { InMemoryRateLimiter } from "@bernouy/rate-limiter";
import { RepositoryCatalogRuntime } from "../../src/core/catalogRuntime";
import { startRepositoryServer, type RepositoryServer } from "../../src/core/repositoryServer";
import { createProductionRepositoryManagement } from "../../src/management";
import { prepareOfficialRepositoryBootstrap } from "../../src/production";
import { TemporaryRoots } from "./fixtures";

const roots = new TemporaryRoots();
const servers: RepositoryServer[] = [];

afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.stop()));
    await roots.cleanup();
});

describe("production reviewed schema baseline maintenance import", () => {
    test("recovers release report histories before composite admission reconciliation", async () => {
        const root = await roots.create();
        await mkdir(join(root, ".registry", "release-reports", "compatibility", "not-a-digest"), {
            recursive: true,
        });
        const catalog = new RepositoryCatalogRuntime();
        expect((await catalog.refresh(() => buildFsIntegrationRegistryCatalogSnapshot({ root }))).applied).toBeTrue();

        const management = await createProductionRepositoryManagement({ root, catalog });

        expect(management.recovery.diagnostics).toContainEqual(
            expect.objectContaining({
                code: "release-report-history-quarantined",
                message: "Quarantined invalid compatibility release report history",
            }),
        );
    });

    test("is absent from public and ordinary management capabilities and imports through maintenance", async () => {
        const root = await roots.create();
        await (await prepareOfficialRepositoryBootstrap(root)).commit();
        const importedHistories = await new FsReviewedSchemaBaselineStore({ root }).listAll();
        await rm(join(root, ".registry", "schema-baselines"), { recursive: true });
        const evidence = await loadOfficialRepositoryBootstrapEvidence();
        const officialPlan = await buildOfficialRepositoryBootstrapPlan();
        const catalog = new RepositoryCatalogRuntime();
        const loadCatalog = () => buildFsIntegrationRegistryCatalogSnapshot({ root });
        expect((await catalog.refresh(loadCatalog)).applied).toBeTrue();
        const management = await createProductionRepositoryManagement({
            root,
            catalog,
            baselineImports: {
                approval: OFFICIAL_REPOSITORY_BOOTSTRAP_BASELINE_APPROVAL,
                approvedTargets: evidence.reviewedSchemaBaselines.map(
                    ({ kind, version, packageDigest, connectorKey, lineageId }) => ({
                        kind,
                        version,
                        packageDigest,
                        connectorKey,
                        lineageId,
                    }),
                ),
            },
            verificationBackfills: officialPlan.verificationBackfills,
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
            integrationCompatibility: management.compatibility,
            managementGuard: guard("management-secret", "management-cms", false),
            mountManagement: management.mount,
            maintenance: {
                guard: guard("maintenance-secret", "official-maintenance", true),
                mount: management.mountMaintenance,
            },
        });
        servers.push(server);
        const baseline = evidence.reviewedSchemaBaselines[0]!;
        const baselineDigest = importedHistories.find(
            ({ current }) =>
                current.kind === baseline.kind &&
                current.version === baseline.version &&
                current.packageDigest === baseline.packageDigest &&
                current.connectorKey === baseline.connectorKey &&
                current.lineageId === baseline.lineageId,
        )?.currentBaselineDigest;
        expect(baselineDigest).toMatch(/^[a-f0-9]{64}$/u);
        const identified = await identifyReviewedSchemaBaselineImportRequest({
            schema: REVIEWED_SCHEMA_BASELINE_IMPORT_SCHEMA,
            baselineDigest,
            baseline,
            expectedCurrent: null,
        });
        const path = "/.cms/repository-management/api/integrations/schema-baselines";
        const request = (origin: string, token?: string) =>
            fetch(`${origin}${path}`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    ...(token ? { authorization: `Bearer ${token}` } : {}),
                },
                body: identified.canonicalBytes,
            });
        const publicOrigin = origin(publicRunner);
        const managementOrigin = origin(managementRunner);

        expect((await request(publicOrigin, "maintenance-secret")).status).toBe(404);
        expect((await request(managementOrigin)).status).toBe(401);
        expect((await request(managementOrigin, "management-secret")).status).toBe(401);
        expect((await request(managementOrigin, "maintenance-secret")).status).toBe(201);
        expect((await request(managementOrigin, "maintenance-secret")).status).toBe(200);

        const verification = officialPlan.verificationBackfills.find(
            (entry) => entry.verificationReport.baselines.length === 0,
        )!;
        const verificationPath = "/.cms/repository-management/api/integrations/verification-backfills";
        const verificationRequest = (requestedOrigin: string, token?: string) =>
            fetch(`${requestedOrigin}${verificationPath}`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    ...(token ? { authorization: `Bearer ${token}` } : {}),
                },
                body: canonicalVerificationBackfill(verification),
            });
        expect((await verificationRequest(publicOrigin, "maintenance-secret")).status).toBe(404);
        expect((await verificationRequest(managementOrigin)).status).toBe(401);
        expect((await verificationRequest(managementOrigin, "management-secret")).status).toBe(401);
        expect((await verificationRequest(managementOrigin, "maintenance-secret")).status).toBe(200);
    }, 60_000);
});

function guard(token: string, principal: string, maintenance: boolean) {
    const config = {
        serviceToken: token,
        servicePrincipal: principal,
        rateLimiter: new InMemoryRateLimiter({ limit: 10, windowSeconds: 60 }),
    };
    return maintenance ? createRepositoryMaintenanceGuard(config) : createRepositoryManagementGuard(config);
}

function canonicalVerificationBackfill(
    entry: Awaited<ReturnType<typeof buildOfficialRepositoryBootstrapPlan>>["verificationBackfills"][number],
) {
    return canonicalJsonBytes({
        schema: "cms.integration.verification-backfill-request.v1",
        verification: { envelope: entry.verification.envelope, digest: entry.verification.digest },
        compatibilityReport: entry.compatibilityReport,
        verificationReport: entry.verificationReport,
        statefulChanges: entry.statefulChanges,
        decision: entry.decision,
    });
}

function origin(runner: BunRunner): string {
    if (!runner.port) {
        throw new Error("Repository test listener did not start");
    }
    return `http://127.0.0.1:${runner.port}`;
}
