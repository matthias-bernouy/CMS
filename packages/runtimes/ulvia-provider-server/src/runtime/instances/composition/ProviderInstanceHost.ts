import { registryInstallationPlan } from "../system/execution/registry";
import { readStoredPlan } from "../system/execution/plan";
import type { InstanceTransitionRecord } from "@bernouy/ulvia-provider";
import { readInstalledExecution } from "../system/execution/installed";
import { ProviderExecutionSupport, type ExecutionPlan } from "../system/execution/support";
import type { SystemBootstrap } from "../system/execution/SystemBootstrap";
import { createRepositorySettings, repositoryTransport } from "./repositorySettings";
import { MemoryVectorStore } from "@bernouy/text-search";
import { HttpRepositoryDiscovery } from "@bernouy/repository/repository/search/http";
import { RepositoryDiscovery } from "@bernouy/repository/repository/search";
import { createInstanceDocumentation } from "./documentation";
import { closeInstanceComposition } from "./disposal";
import type { CmsDocumentation } from "@bernouy/documentation";
import { ProviderDocumentation } from "./ProviderDocumentation";
import { ProviderPairing } from "../../gateway/providers/connections/ProviderPairing";
import { createPublicDelivery } from "../../content/publicDelivery";
import { ProviderConnections } from "@bernouy/cms-gateway/provider/node";
import { readRemoteProviderReport } from "../../gateway/providers/readReport";
import { providerAdministration } from "../../gateway/providers/administration";
import { compatibleTransitionRetention } from "../../stores/collections/compatibleRetention";
import { createProviderRetention } from "../../stores/collections/retention";
import { instanceMongoUrl } from "../../stores/storageRoots";
import { createNativeInvocationAuthorizer } from "../../gateway/native/authorizeInvocation";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { HttpCollectionRepository } from "@bernouy/repository/collections/http";
import { HttpProviderRepository } from "@bernouy/repository/providers/http";
import { ProviderManagement } from "@bernouy/repository/providers/management";
import type { ProviderRuntimeReport } from "@bernouy/ulvia-providers/installations";
import type { ProviderManifestDigest } from "@bernouy/ulvia-providers";
import type { ReleaseDigest } from "@bernouy/ulvia-contracts";
import {
    CollectionSources,
    DefaultProviderCapabilityDispatcher,
    ProviderOperationExecutor,
    registerOfficialProviderCapabilities,
    type OfficialInstanceProvisioningTarget,
    type ProviderInstanceRecord,
    type ProviderInstanceRegistry,
    type ProviderInstanceTransitionExecution,
    type UlviaProviderInstanceRuntime,
} from "@bernouy/ulvia-provider";
import type { ProviderRuntimeEnv } from "../../../runtimeEnv";
import type { EncryptedInstanceCredentials } from "../../authentication/EncryptedInstanceCredentials";
import { createProviderGateway } from "../../gateway/createProviderGateway";
import { createProtectedProviderManagement } from "../../gateway/protectedManagement";
import { MongoProviderOperationStore } from "../../provider-operations/MongoProviderOperationStore";
import { RecoverySupervisor } from "../../recovery/RecoverySupervisor";
import { createProviderStores, type ProviderStores } from "../../stores/providerStores";
import { CmsFileWorkspace } from "../../stores/CmsFileWorkspace";
import { createInstanceProvisioningTarget } from "../instanceProvisioning";
import type { OfficialBootstrapSources } from "../system/bootstrap";
import { InstanceResourcePool, type ResourceLease, type ResourceLifetime } from "../InstanceResourcePool";
import { CollectionVerificationPool } from "../verification/CollectionVerificationPool";
import { CollectionSourceCaches } from "@bernouy/ulvia-provider";
import type { Logger } from "@bernouy/logging";
import { correlatedRepositoryFetch } from "../../gateway/repositoryFetch";
import { createInstanceDiagnostics, connectInstanceDiagnostics } from "./diagnostics";
import { createInstanceAuth } from "../../authentication/createInstanceAuth";
import { createInstanceRepository } from "../../stores/repository/registry";

import { createRepositoryAuthoring } from "../../stores/repository/composition";
import { McpAuthorization } from "@bernouy/auth/oauth";

const SITE_ID = "default";
const MAX_OPEN_INSTANCES = 32;
// Keep recently active instances warm while the bounded LRU ceiling protects
// the process from an unbounded number of Mongo-backed compositions.
const INSTANCE_IDLE_MS = 15 * 60_000;

export type InstanceComposition = Readonly<{
    stores: ProviderStores;
    gateway: Awaited<ReturnType<typeof createProviderGateway>>;
    runtime: UlviaProviderInstanceRuntime;
    management: ProviderManagement;
    managementForPlan(plan: ExecutionPlan, execution?: ProviderInstanceTransitionExecution): ProviderManagement;
    administrators: Awaited<ReturnType<typeof createProviderGateway>>["administrators"];
    operations: ProviderOperationExecutor;
    documentation: CmsDocumentation;
    ensureProviderReady(): Promise<void>;
    pairOfficialProvider(): Promise<void>;
    close(): Promise<void>;
}>;

export class ProviderInstanceHost {
    readonly #verification = new CollectionVerificationPool();
    readonly #collectionCaches = new CollectionSourceCaches();
    readonly #documentation: ProviderDocumentation;
    readonly #instances: InstanceResourcePool<InstanceComposition>;
    repositoryCreation?: {
        create(
            instance: ProviderInstanceRecord,
            expectedRevision: number,
            administratorId: string,
        ): Promise<ProviderInstanceRecord>;
        read(instance: ProviderInstanceRecord): Promise<InstanceTransitionRecord | null>;
    };

    constructor(
        private readonly env: ProviderRuntimeEnv,
        private readonly credentials: EncryptedInstanceCredentials,
        private readonly system: SystemBootstrap,
        private readonly logger: Logger,
        private readonly support: ProviderExecutionSupport,
        private readonly instances: Pick<ProviderInstanceRegistry, "get" | "update">,
        private readonly bootstrap: OfficialBootstrapSources,
    ) {
        this.#documentation = new ProviderDocumentation(
            {
                cacheDirectory: env.ULVIA_EMBEDDING_MODEL_DIR ?? join(env.CMS_FILES_DIR, ".documentation-models"),
                localFilesOnly: Boolean(env.ULVIA_EMBEDDING_MODEL_DIR),
            },
            async (instance) => {
                const current = await instances.get(instance.id);
                if (!current || (current.status !== "ready" && current.status !== "provisioning")) {
                    throw new Error("Documentation instance is not available for preparation");
                }
                return this.open(current);
            },
            logger,
        );
        this.#instances = new InstanceResourcePool(
            (key, lifetime) => this.createComposition(this.#records.get(key)!, lifetime),
            (composition) => composition.close(),
            { maxEntries: MAX_OPEN_INSTANCES, idleMs: INSTANCE_IDLE_MS },
        );
    }

    readonly #records = new Map<string, ProviderInstanceRecord>();
    readonly #registryVectors = new MemoryVectorStore(8192);

    async runtime(instance: ProviderInstanceRecord): Promise<ResourceLease<UlviaProviderInstanceRuntime>> {
        const startedAt = performance.now();
        const lease = await this.open(instance);
        const openMs = performance.now() - startedAt;
        const readyStartedAt = performance.now();
        try {
            await lease.resource.ensureProviderReady();
        } catch (error) {
            lease.release();
            throw error;
        }
        const readyMs = performance.now() - readyStartedAt;
        this.reportRuntimeTiming(instance.id, openMs, readyMs);
        return {
            resource: {
                ...lease.resource.runtime,
            },
            release: lease.release,
        };
    }

    async target(instance: ProviderInstanceRecord): Promise<OfficialInstanceProvisioningTarget> {
        const lease = await this.open(instance);
        return {
            ...createInstanceProvisioningTarget({
                instance,
                composition: lease.resource,
                env: this.env,
                credentials: this.credentials,
                providerSource: this.bootstrap.providers,
                collectionSource: this.bootstrap.collections,
            }),
            release: lease.release,
        };
    }

    async registryPlan(instance: ProviderInstanceRecord) {
        const lease = await this.open(instance);
        try {
            return await registryInstallationPlan(
                instance,
                lease.resource.stores,
                this.support,
                this.env.ULVIA_PROVIDER_PUBLIC_URL,
            );
        } finally {
            lease.release();
        }
    }

    async close(): Promise<void> {
        try {
            try {
                await this.#documentation.stop();
            } finally {
                try {
                    await this.#instances.close();
                } finally {
                    await this.#documentation.close();
                }
            }
        } finally {
            await this.#verification.close();
            this.#registryVectors.clear();
        }
    }

    startDocumentation(instances: readonly ProviderInstanceRecord[]): void {
        this.#documentation.start(instances);
    }

    async recoverOperations(instances: readonly ProviderInstanceRecord[], limit = 100): Promise<number> {
        let recovered = 0;
        for (const instance of instances) {
            if (instance.status !== "ready") {
                continue;
            }
            const lease = await this.open(instance);
            try {
                recovered += await lease.resource.operations.recover(limit);
            } finally {
                lease.release();
            }
        }
        return recovered;
    }

    private async open(instance: ProviderInstanceRecord): Promise<ResourceLease<InstanceComposition>> {
        const key = compositionKey(instance);
        this.#records.set(key, instance);
        try {
            return await this.#instances.acquire(key);
        } finally {
            this.#records.delete(key);
        }
    }

    private async createComposition(
        instance: ProviderInstanceRecord,
        lifetime: ResourceLifetime,
    ): Promise<InstanceComposition> {
        const startedAt = performance.now();
        const credentialsStartedAt = performance.now();
        const credentials = await this.credentials.read(instance.id);
        const bootstrapReadMs = performance.now() - credentialsStartedAt;
        if (!credentials) {
            throw new Error(`Provider instance credentials are unavailable: ${instance.id}`);
        }
        const repository = repositoryTransport(instance);
        const providerSource = new HttpProviderRepository(repository.id, repository.url, {
            request: correlatedRepositoryFetch,
            allowInsecureHttp: repository.allowInsecureHttp,
        });
        const collectionSource = new HttpCollectionRepository(repository.id, repository.url, {
            verifier: this.#verification,
            request: correlatedRepositoryFetch,
            allowInsecureHttp: repository.allowInsecureHttp,
        });
        const filesDirectory = join(this.env.CMS_FILES_DIR, instance.storageKey);
        await mkdir(filesDirectory, { recursive: true, mode: 0o700 });
        const diagnostics = createInstanceDiagnostics(instance.id, this.logger.child({ instanceId: instance.id }));
        const instanceLogger = diagnostics.logger;
        const storesStartedAt = performance.now();
        const stores = await createProviderStores(
            {
                instanceId: instance.id,
                CMS_SESSION_SECRET: credentials.sessionSecret,
                CMS_KEK: {
                    activeKeyId: "instance",
                    keysHex: { instance: credentials.kekHex },
                    rotateOnStart: false,
                },
                MONGO_URL: instanceMongoUrl(this.env.MONGO_URL, instance.storageKey),
                CMS_FILES_DIR: filesDirectory,
                CMS_PUBLIC_URL: instance.cmsUrl,
            },
            instanceLogger,
            () => this.#documentation.request(instance, true),
            this.#verification,
        );
        const storesMs = performance.now() - storesStartedAt;
        let operations: ProviderOperationExecutor | undefined;
        let operationRecovery: RecoverySupervisor | undefined;
        let documentation: CmsDocumentation | undefined;
        let documentationTimer: ReturnType<typeof setInterval> | undefined;
        let registry: Awaited<ReturnType<typeof createInstanceRepository>> | undefined;
        try {
            const execution =
                instance.status === "ready" || instance.status === "disabled"
                    ? await readInstalledExecution(instance, stores, this.support, this.env.ULVIA_PROVIDER_PUBLIC_URL)
                    : await this.provisioningExecution(instance, stores);
            const { plan, contracts, report } = execution;
            const registryPin = plan.contracts.find(({ contractId }) => contractId === "ulvia/repository");
            if (registryPin) {
                registry = await createInstanceRepository(
                    stores,
                    filesDirectory,
                    instance.id,
                    this.#documentation.model,
                    this.#registryVectors,
                    this.#verification,
                );
            }
            const readReport = async (endpoint: string, token: string) =>
                endpoint === this.env.ULVIA_PROVIDER_PUBLIC_URL && token === credentials.invocationSecret
                    ? providerReport(instance, plan, this.support.buildVersion)
                    : readRemoteProviderReport(endpoint, token);
            const gateway = await createProviderGateway(stores, SITE_ID, {
                readReport,
                reportFailure: (installationId, error) =>
                    instanceLogger.warn("provider.observation.refresh.failed", { installationId }, error),
            });
            const managementForPlan = (plan: ExecutionPlan, execution?: ProviderInstanceTransitionExecution) => {
                const retention = createProviderRetention(gateway, stores.upgradeStorage, plan, instance.id);
                return new ProviderManagement(gateway, stores.contractSecrets.installations, {
                    retention: execution
                        ? compatibleTransitionRetention(retention, gateway, instance.id, plan, execution)
                        : retention,
                    sources: [providerSource],
                    drafts: stores.connectionDrafts,
                    readReport: async (endpoint, token) =>
                        endpoint === this.env.ULVIA_PROVIDER_PUBLIC_URL && token === credentials.invocationSecret
                            ? providerReport(instance, plan, this.support.buildVersion)
                            : readRemoteProviderReport(endpoint, token),
                });
            };
            const management = managementForPlan(plan);
            const providerOperations = new MongoProviderOperationStore(stores.db);
            await providerOperations.init();
            const instanceOperations = new ProviderOperationExecutor(providerOperations, undefined, {
                contracts,
                retainResource: lifetime.retain,
                onFailure: (observation, error) => {
                    const attributes = { instanceId: instance.id, ...observation };
                    if (observation.kind === "handler-unavailable" || observation.kind === "handler-rejected") {
                        instanceLogger.warn("provider.operation.failed", attributes);
                    } else {
                        instanceLogger.error("provider.operation.failed", attributes, error);
                    }
                },
            });
            operations = instanceOperations;
            const dispatcher = new DefaultProviderCapabilityDispatcher(contracts);
            const providerConnections = new ProviderConnections(stores.providerConnections);
            const officialPairing = new ProviderPairing(stores, gateway, instance.gatewayUrl, {
                endpoint: this.env.ULVIA_PROVIDER_PUBLIC_URL,
                instanceId: instance.id,
                providerId: plan.manifest.providerId,
                connections: providerConnections,
            });
            const authentication = await createInstanceAuth(stores, instance.cmsUrl);
            const fileWorkspace = new CmsFileWorkspace(
                stores.providerFiles,
                stores.contractSecrets.files,
                instance.cmsUrl,
            );
            const authoring = createRepositoryAuthoring(
                stores,
                filesDirectory,
                repository.url,
                collectionSource,
                fileWorkspace,
                repository.allowInsecureHttp,
            );
            documentation = await createInstanceDocumentation(stores, this.#documentation.model, () =>
                this.#documentation.request(instance),
            );
            const instanceDocumentation = documentation;
            const keyedExecution = new DurableKeyedExecution(
                new MongoKeyedReceiptStore(stores.db),
                {
                    providerId: plan.manifest.providerId,
                    siteId: SITE_ID,
                    instanceId: instance.id,
                },
                lifetime.retain,
            );
            await registerOfficialProviderCapabilities(
                dispatcher,
                {
                    ...stores,
                    ...(registry ? { withUserDeletion: registry.withUserDeletion } : {}),
                    documentation: instanceDocumentation,
                    repositoryDiscovery: new RepositoryDiscovery([
                        new HttpRepositoryDiscovery(repository.id, repository.url, {
                            request: correlatedRepositoryFetch,
                            allowInsecureHttp: repository.allowInsecureHttp,
                        }),
                    ]),
                    ...createPublicDelivery(stores, gateway, instance.cmsUrl),
                    authoring,
                    repository: registry?.service,
                    providerConnections,
                    initialization: stores.createInitialization(collectionSource),
                    repositorySettings: createRepositorySettings({
                        instanceId: instance.id,
                        instances: this.instances,
                        enabled: async () => {
                            const [selected, installed] = await Promise.all([
                                gateway.selections.get(SITE_ID),
                                stores.installations.list(SITE_ID),
                            ]);
                            const owned = new Set(
                                installed
                                    .filter(
                                        ({ installation }) =>
                                            installation.accountId === instance.id &&
                                            installation.providerId === this.support.providerId,
                                    )
                                    .map(({ installation }) => installation.id),
                            );
                            return Boolean(
                                selected?.plan.selections.some(
                                    ({ contractId, installationId }) =>
                                        contractId === "ulvia/repository" && owned.has(installationId),
                                ),
                            );
                        },
                        create: async (instance, expectedRevision, administratorId) => {
                            if (!this.repositoryCreation) {
                                throw new Error("Registry creation is unavailable");
                            }
                            return this.repositoryCreation.create(instance, expectedRevision, administratorId);
                        },
                        creation: async (instance) => ({
                            status: (await this.repositoryCreation?.read(instance))?.status ?? "none",
                        }),
                    }),
                    emailer: stores.emailer,
                    secrets: stores.cmsSecrets,
                    files: stores.providerFiles,
                    workspace: fileWorkspace,
                    sitemapStore: stores.sitemapStore,
                    logger: instanceLogger.child({ component: "content-delivery" }),
                    mcpAuthorization: new McpAuthorization(
                        stores.oauthStore,
                        {
                            canConnect: async (sub) =>
                                Boolean(await stores.users.getBySub(sub)) &&
                                (await gateway.administrators.get(sub)).enabled,
                        },
                        new URL("/.cms/mcp", instance.cmsUrl).href,
                        new TextEncoder().encode(stores.runtimeSessionSecret),
                        Date.now,
                        stores.oauthPublicLimiter,
                    ),
                    authentication: authentication.auth,
                    accountLifecycle: authentication.accountLifecycle,
                },
                gateway,
                instanceOperations,
                {
                    ...createProtectedProviderManagement(management, instance, plan),
                    administration: providerAdministration(stores, gateway, management, instance.gatewayUrl),
                },
                new CollectionSources(
                    stores.collections,
                    [collectionSource],
                    this.#verification,
                    this.#collectionCaches,
                ),
                plan.contracts,
                {
                    providerId: plan.manifest.providerId,
                    scope: { siteId: SITE_ID, instanceId: instance.id },
                    executeKeyed: keyedExecution.execute,
                },
            );
            operationRecovery = new RecoverySupervisor(
                (limit) => instanceOperations.recover(limit),
                undefined,
                undefined,
                (error) =>
                    instanceLogger.error("provider.operation.recovery.failed", { instanceId: instance.id }, error),
            );
            await operationRecovery.start(false);
            connectInstanceDiagnostics(diagnostics, stores, gateway, instance.id);
            const composition = {
                stores,
                gateway,
                documentation: instanceDocumentation,
                management,
                managementForPlan,
                administrators: gateway.administrators,
                operations: instanceOperations,
                pairOfficialProvider: async () => {
                    const state = await management.list();
                    const official = state.installations.find(
                        (item) => item.providerId === plan.manifest.providerId && item.accountId === instance.id,
                    );
                    if (!official) {
                        throw new Error("Official Provider installation is unavailable for pairing");
                    }
                    const current = await stores.installations.get({ siteId: SITE_ID, installationId: official.id });
                    if (!current) {
                        throw new Error("Official Provider installation disappeared before pairing");
                    }
                    await officialPairing.configure(
                        { installationId: official.id, expectedRevision: current.revision },
                        "system:provider-provisioner",
                    );
                },
                ensureProviderReady: async () => {
                    await gateway.routes.warm(SITE_ID, "ulvia/cms.installations");
                },
                close: () =>
                    closeInstanceComposition({
                        documentationTimer,
                        recovery: operationRecovery,
                        operations,
                        registry,
                        documentation: instanceDocumentation,
                        diagnostics: diagnostics.collector,
                        stores,
                    }),
                runtime: {
                    contracts,
                    siteId: SITE_ID,
                    logger: instanceLogger,
                    report,
                    dispatcher,
                    authorizeInvocation: createNativeInvocationAuthorizer({
                        siteId: SITE_ID,
                        report,
                        releases: stores.releases,
                        executionState: stores.executionState,
                    }),
                },
            };
            instanceLogger.info("provider.instance.composition.created", {
                instanceId: instance.id,
                bootstrapReadMs: roundDuration(bootstrapReadMs),
                storesMs: roundDuration(storesMs),
                assemblyMs: roundDuration(performance.now() - startedAt - bootstrapReadMs - storesMs),
                durationMs: roundDuration(performance.now() - startedAt),
            });
            documentationTimer = setInterval(() => this.#documentation.request(instance), 6 * 60 * 60_000);
            documentationTimer.unref();
            this.#documentation.request(instance);
            return composition;
        } catch (error) {
            try {
                await closeInstanceComposition({
                    documentationTimer,
                    recovery: operationRecovery,
                    operations,
                    registry,
                    documentation,
                    diagnostics: diagnostics.collector,
                    stores,
                });
            } catch (cleanupError) {
                throw new AggregateError([error, cleanupError], "Provider instance composition failed");
            }
            throw error;
        }
    }
    private async provisioningExecution(instance: ProviderInstanceRecord, stores: ProviderStores) {
        const plan = instance.systemPlan;
        if (!plan) {
            throw new Error("Unfinished legacy provisioning requires its original Provider image");
        }
        for (const pin of plan.contracts) {
            this.support.assert(pin, `provisioning:${instance.id}`);
        }
        return {
            plan,
            contracts:
                instance.status === "upgrading"
                    ? await readStoredPlan(plan, stores, this.support)
                    : await this.system.contracts(plan),
            report: providerReport(instance, plan, this.support.buildVersion),
        };
    }

    private reportRuntimeTiming(instanceId: string, openMs: number, readyMs: number): void {
        const durationMs = openMs + readyMs;
        const attributes = {
            instanceId,
            openMs: roundDuration(openMs),
            observationMs: roundDuration(readyMs),
            durationMs: roundDuration(durationMs),
        };
        if (durationMs >= 50) {
            this.logger.info("provider.instance.runtime.ready", attributes);
            return;
        }
        this.logger.debug("provider.instance.runtime.ready", attributes);
    }
}

function roundDuration(value: number): number {
    return Math.round(value * 100) / 100;
}

function providerReport(
    instance: ProviderInstanceRecord,
    plan: ExecutionPlan,
    buildVersion: string,
): ProviderRuntimeReport {
    return {
        protocol: "ulvia-provider/v1",
        providerId: plan.manifest.providerId,
        instanceId: instance.id,
        account: { id: instance.id, label: instance.label },
        buildVersion,
        manifest: { version: plan.manifest.version, digest: plan.manifest.digest as ProviderManifestDigest },
        implementations: plan.contracts.map((contract) => ({
            ...contract,
            digest: contract.digest as ReleaseDigest,
            status: "ready" as const,
        })),
    };
}

function compositionKey(instance: ProviderInstanceRecord): string {
    return `${instance.id}\0${instance.revision}`;
}

import { DurableKeyedExecution } from "../../provider-operations/keyed/DurableKeyedExecution";
import { MongoKeyedReceiptStore } from "../../provider-operations/keyed/MongoKeyedReceiptStore";
