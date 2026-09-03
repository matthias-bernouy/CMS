import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildFsIntegrationRegistryCatalogSnapshot } from "@bernouy/cms-integration-registry/fs";
import {
    buildOfficialRepositoryBootstrapPlan,
    OFFICIAL_REPOSITORY_BOOTSTRAP_BASELINE_APPROVAL,
} from "@bernouy/cms-official-integrations/publication";
import { RepositoryCatalogRuntime } from "@bernouy/cms-repository-server/catalog-runtime";
import {
    productionMigrationVerificationEnvironment,
    productionReleaseAdmissionPolicy,
} from "@bernouy/cms-repository-server/candidate-policy";
import { createProductionRepositoryManagement } from "@bernouy/cms-repository-server/management";
import { prepareOfficialRepositoryBootstrap } from "@bernouy/cms-repository-server/production";
import { bootstrapRepositoryRegistryIfEmpty } from "@bernouy/cms-repository-server/registry-root";
import { startRepositoryServer } from "@bernouy/cms-repository-server/server";
import { BunRunner } from "@bernouy/http-runner";
import {
    createHttpCandidateWorkerClient,
    createCompositeVerificationSandbox,
    createVerificationSupervisor,
    runPostgresPlatformVerification,
    runReleaseRuntimeVerification,
} from "../../src";
import { createDisposableVerificationDatabaseProviderFromEnv } from "../../src/runtime/providers/postgres";
import { createPostgresPlatformVerificationAdapter } from "../../src/sandbox/service/postgres";
import { startMigrationPostgres } from "../service/postgres-migrations/fixture/harness";
import {
    type AcceptanceResources,
    PRODUCTION_RUNNER,
    createAcceptanceCleanup,
    officialPhotoAlbumsCandidate,
    repositoryGuard,
    rethrowAfterCleanup,
    runnerOrigin,
} from "./fixtureResources";
import { tracedClient, type OfficialCandidateTrace } from "./protocolTrace";

export async function startOfficialCandidateAcceptance() {
    const taskRoot = await mkdtemp(join(tmpdir(), "cms-official-candidate-"));
    const root = join(taskRoot, "registry");
    const packageTempRoot = join(taskRoot, "sandbox-packages");
    let postgres: Awaited<ReturnType<typeof startMigrationPostgres>> | undefined;
    let server: ReturnType<typeof startRepositoryServer> | undefined;
    let adapter: ReturnType<typeof createPostgresPlatformVerificationAdapter> | undefined;
    const resources: AcceptanceResources = { taskRoot };
    const cleanup = createAcceptanceCleanup(resources);
    try {
        await Promise.all([mkdir(root), mkdir(packageTempRoot)]);
        postgres = await startMigrationPostgres();
        resources.postgres = postgres;
        adapter = createPostgresPlatformVerificationAdapter({ packageTempRoot });
        resources.adapter = adapter;
        const bootstrapped = await bootstrapRepositoryRegistryIfEmpty(root, prepareOfficialRepositoryBootstrap);
        if (bootstrapped !== "bootstrapped") {
            throw new Error("Official repository acceptance root was not bootstrapped");
        }
        const catalog = new RepositoryCatalogRuntime();
        const loadCatalog = async () => await buildFsIntegrationRegistryCatalogSnapshot({ root });
        if (!(await catalog.refresh(loadCatalog)).applied) {
            throw new Error("Official repository acceptance catalogue was not loaded");
        }
        const plan = await buildOfficialRepositoryBootstrapPlan();
        const migrationEnvironment = await productionMigrationVerificationEnvironment(PRODUCTION_RUNNER);
        const management = await createProductionRepositoryManagement({
            root,
            catalog,
            baselineImports: {
                approval: OFFICIAL_REPOSITORY_BOOTSTRAP_BASELINE_APPROVAL,
                approvedTargets: plan.reviewedSchemaBaselines.map(
                    ({ kind, version, packageDigest, connectorKey, lineageId }) => ({
                        kind,
                        version,
                        packageDigest,
                        connectorKey,
                        lineageId,
                    }),
                ),
            },
            verificationBackfills: plan.verificationBackfills,
            candidateProtocol: { capabilitySigningKey: "candidate-capability-signing-key".repeat(2) },
            candidateAdmissionPolicy: await productionReleaseAdmissionPolicy(PRODUCTION_RUNNER, migrationEnvironment),
            candidateMigrationEnvironment: migrationEnvironment,
        });
        const publicRunner = new BunRunner();
        const managementRunner = new BunRunner();
        server = startRepositoryServer({
            publicRunner,
            managementRunner,
            publicPort: 0,
            managementPort: 0,
            catalog,
            loadCatalog,
            packageDownloadProtection: { clientAddressPolicy: { mode: "disabled" } },
            integrationCompatibility: management.compatibility,
            integrationReleases: management.releases,
            integrationVerificationBundles: management.verificationBundles,
            managementGuard: repositoryGuard("management-secret", false),
            mountManagement: management.mount,
            worker: {
                guard: repositoryGuard("worker-secret", true),
                mountAuthenticated: management.mountWorkerAuthenticated,
                mountCapabilities: management.mountWorkerCapabilities,
            },
        });
        resources.server = server;
        const trace: OfficialCandidateTrace = {};
        const client = tracedClient(
            createHttpCandidateWorkerClient({
                repositoryUrl: runnerOrigin(managementRunner),
                workerId: "official-acceptance-worker",
                workerToken: "worker-secret",
                requestTimeoutMs: 120_000,
                maxResponseBytes: 64 * 1_048_576,
            }),
            trace,
        );
        const databases = await createDisposableVerificationDatabaseProviderFromEnv({
            CMS_INTEGRATION_VERIFIER_POSTGRES_HOST: postgres.host,
            CMS_INTEGRATION_VERIFIER_POSTGRES_PORT: String(postgres.port),
            CMS_INTEGRATION_VERIFIER_POSTGRES_USER: "postgres",
            CMS_INTEGRATION_VERIFIER_POSTGRES_DATABASE: "postgres",
            CMS_INTEGRATION_VERIFIER_POSTGRES_PASSWORD_FILE: postgres.passwordFile,
        });
        const supervisor = createVerificationSupervisor({
            client,
            databases,
            sandbox: createCompositeVerificationSandbox({
                platform: {
                    identity: PRODUCTION_RUNNER,
                    run: async (input, signal) => await runPostgresPlatformVerification(input, adapter, signal),
                },
                releaseRuntime: {
                    identity: PRODUCTION_RUNNER,
                    run: async (input, signal) => await runReleaseRuntimeVerification(input, signal),
                },
            }),
            jobListLimit: 1,
            leaseRenewalIntervalMs: 30_000,
        });
        const candidate = await officialPhotoAlbumsCandidate();
        return {
            candidate,
            catalog,
            management,
            managementOrigin: runnerOrigin(managementRunner),
            publicOrigin: runnerOrigin(publicRunner),
            supervisor,
            trace,
            cleanup,
        };
    } catch (error) {
        return await rethrowAfterCleanup(error, cleanup);
    }
}
