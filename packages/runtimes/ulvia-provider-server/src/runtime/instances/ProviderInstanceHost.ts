import { createProviderRetention } from "../stores/collections/retention";
import { instanceMongoUrl } from "../stores/storageRoots";
import { createNativeInvocationAuthorizer } from "../gateway/nativeAuthorization";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { HttpCollectionRepository } from "@bernouy/cms-repository/collections/http";
import { HttpProviderRepository } from "@bernouy/cms-repository/providers/http";
import { ProviderManagement } from "@bernouy/cms-repository/providers/management";
import type { ProviderRuntimeReport } from "@bernouy/cms-repository/providers/installations";
import type { ProviderManifestDigest } from "@bernouy/cms-repository/providers";
import type { ReleaseDigest } from "@bernouy/cms-repository/contracts";
import {
    CollectionSources,
    DefaultProviderCapabilityDispatcher,
    ProviderOperationExecutor,
    registerOfficialProviderCapabilities,
    type OfficialInstanceProfile,
    type OfficialInstanceProfiles,
    type OfficialInstanceProvisioningTarget,
    type ProviderInstanceRecord,
    type UlviaProviderInstanceRuntime,
} from "@bernouy/ulvia-provider";
import type { ProviderRuntimeEnv } from "../../runtimeEnv";
import type { EncryptedInstanceCredentials } from "../authentication/EncryptedInstanceCredentials";
import { createProviderGateway } from "../gateway/createProviderGateway";
import { createProtectedProviderManagement } from "../gateway/protectedManagement";
import { MongoProviderOperationStore } from "../provider-operations/MongoProviderOperationStore";
import { RecoverySupervisor } from "../recovery/RecoverySupervisor";
import { createProviderStores, type ProviderStores } from "../stores/providerStores";
import { CmsFileWorkspace } from "../stores/CmsFileWorkspace";
import { createInstanceProvisioningTarget } from "./instanceProvisioning";
import { InstanceResourcePool, type ResourceLease, type ResourceLifetime } from "./InstanceResourcePool";
import { OfficialProviderObservation } from "./OfficialProviderObservation";
import type { Logger } from "@bernouy/logging";
import { correlatedRepositoryFetch } from "../gateway/repositoryFetch";
import { createInstanceAuth } from "../authentication/createInstanceAuth";

import { createCollectionAuthoring } from "../stores/repository/composition";
import { McpAuthorization } from "@bernouy/cms-auth/oauth";

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
    managementForProfile(profile: OfficialInstanceProfile): ProviderManagement;
    administrators: Awaited<ReturnType<typeof createProviderGateway>>["administrators"];
    operations: ProviderOperationExecutor;
    ensureProviderReady(): Promise<void>;
    close(): Promise<void>;
}>;

export class ProviderInstanceHost {
    readonly #instances: InstanceResourcePool<InstanceComposition>;
    readonly #providerSource: HttpProviderRepository;
    readonly #collectionSource: HttpCollectionRepository;

    constructor(
        private readonly env: ProviderRuntimeEnv,
        private readonly credentials: EncryptedInstanceCredentials,
        private readonly profiles: OfficialInstanceProfiles,
        private readonly logger: Logger,
    ) {
        this.#providerSource = new HttpProviderRepository("ulvia-provider-bootstrap", env.CMS_REPOSITORY_URL, {
            request: correlatedRepositoryFetch,
            allowInsecureHttp: env.CMS_REPOSITORY_ALLOW_INSECURE_HTTP,
        });
        this.#collectionSource = new HttpCollectionRepository("ulvia-provider-bootstrap", env.CMS_REPOSITORY_URL, {
            request: correlatedRepositoryFetch,
            allowInsecureHttp: env.CMS_REPOSITORY_ALLOW_INSECURE_HTTP,
        });
        this.#instances = new InstanceResourcePool(
            (key, lifetime) => this.createComposition(this.#records.get(key)!, lifetime),
            (composition) => composition.close(),
            { maxEntries: MAX_OPEN_INSTANCES, idleMs: INSTANCE_IDLE_MS },
        );
    }

    readonly #records = new Map<string, ProviderInstanceRecord>();

    async runtime(instance: ProviderInstanceRecord): Promise<ResourceLease<UlviaProviderInstanceRuntime>> {
        const startedAt = performance.now();
        const lease = await this.open(instance);
        const openMs = performance.now() - startedAt;
        const readyStartedAt = performance.now();
        await lease.resource.ensureProviderReady();
        const readyMs = performance.now() - readyStartedAt;
        this.reportRuntimeTiming(instance.id, openMs, readyMs);
        return {
            resource: {
                ...lease.resource.runtime,
                report: providerReport(instance, this.requiredProfile(instance.profile.id, instance.profile.version)),
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
                providerSource: this.#providerSource,
                collectionSource: this.#collectionSource,
            }),
            release: lease.release,
        };
    }

    async close(): Promise<void> {
        await this.#instances.close();
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
        const filesDirectory = join(this.env.CMS_FILES_DIR, instance.storageKey);
        await mkdir(filesDirectory, { recursive: true, mode: 0o700 });
        const storesStartedAt = performance.now();
        const stores = await createProviderStores(
            {
                CMS_SESSION_SECRET: credentials.sessionSecret,
                CMS_KEK: {
                    activeKeyId: "instance",
                    keysHex: { instance: credentials.kekHex },
                    rotateOnStart: false,
                },
                MONGO_URL: instanceMongoUrl(this.env.MONGO_URL, instance.storageKey),
                CMS_FILES_DIR: filesDirectory,
                KERNEL_PUBLIC_URL: instance.kernelUrl,
            },
            this.logger.child({ instanceId: instance.id }),
        );
        const storesMs = performance.now() - storesStartedAt;
        let operationRecovery: RecoverySupervisor | undefined;
        try {
            const gateway = await createProviderGateway(stores, SITE_ID);
            const managementForProfile = (profile: OfficialInstanceProfile) =>
                new ProviderManagement(gateway, stores.contractSecrets.installations, {
                    retention: createProviderRetention(gateway, stores.upgradeStorage, profile, instance.id),
                    sources: [this.#providerSource],
                    readReport: async () => providerReport(instance, profile),
                });
            const profile = this.requiredProfile(instance.profile.id, instance.profile.version);
            const report = providerReport(instance, profile);
            const management = managementForProfile(profile);
            const observation = new OfficialProviderObservation(management, instance.id, profile, Date.now, (error) =>
                this.logger.error("provider.observation.refresh.failed", { instanceId: instance.id }, error),
            );
            const providerOperations = new MongoProviderOperationStore(stores.db);
            await providerOperations.init();
            const operations = new ProviderOperationExecutor(providerOperations, undefined, {
                retainResource: lifetime.retain,
                onFailure: (observation, error) => {
                    const attributes = { instanceId: instance.id, ...observation };
                    if (observation.kind === "handler-unavailable" || observation.kind === "handler-rejected") {
                        this.logger.warn("provider.operation.failed", attributes);
                    } else {
                        this.logger.error("provider.operation.failed", attributes, error);
                    }
                },
            });
            const dispatcher = new DefaultProviderCapabilityDispatcher();
            const authentication = await createInstanceAuth(stores, instance.kernelUrl);
            const fileWorkspace = new CmsFileWorkspace(
                stores.providerFiles,
                stores.contractSecrets.files,
                instance.kernelUrl,
            );
            const collectionAuthoring = createCollectionAuthoring(
                stores,
                filesDirectory,
                this.env.CMS_REPOSITORY_URL,
                this.#collectionSource,
                fileWorkspace,
                this.env.CMS_REPOSITORY_ALLOW_INSECURE_HTTP,
            );
            registerOfficialProviderCapabilities(
                dispatcher,
                {
                    ...stores,
                    collectionAuthoring,
                    emailer: stores.emailer,
                    secrets: stores.cmsSecrets,
                    resolvePageRoute: (path: string) => stores.pageRoutes.resolve(gateway.siteId, path),
                    sitemapStore: stores.sitemapStore,
                    logger: this.logger.child({ instanceId: instance.id, component: "content-delivery" }),
                    mcpAuthorization: new McpAuthorization(
                        stores.oauthStore,
                        {
                            canConnect: async (sub) =>
                                Boolean(await stores.users.getBySub(sub)) &&
                                (await gateway.administrators.get(sub)).enabled,
                        },
                        new URL("/.cms/mcp", instance.kernelUrl).href,
                        new TextEncoder().encode(stores.runtimeSessionSecret),
                        Date.now,
                        stores.oauthPublicLimiter,
                    ),
                    authentication: authentication.auth,
                    accountLifecycle: authentication.accountLifecycle,
                },
                gateway,
                operations,
                createProtectedProviderManagement(management, instance, profile),
                new CollectionSources(stores.collections, [this.#collectionSource]),
                stores.providerFiles,
                fileWorkspace,
                new Set(profile.contracts.map(({ contractId }) => contractId)),
            );
            operationRecovery = new RecoverySupervisor(
                (limit) => operations.recover(limit),
                undefined,
                undefined,
                (error) => this.logger.error("provider.operation.recovery.failed", { instanceId: instance.id }, error),
            );
            await operationRecovery.start(false);
            const activeRecovery = operationRecovery;
            const composition = {
                stores,
                gateway,
                management,
                managementForProfile,
                administrators: gateway.administrators,
                operations,
                ensureProviderReady: () => observation.ensureFresh(),
                close: async () => {
                    await activeRecovery.stop();
                    await operations.stop();
                    await stores.close();
                },
                runtime: {
                    siteId: SITE_ID,
                    report,
                    dispatcher,
                    authorizeInvocation: createNativeInvocationAuthorizer(
                        SITE_ID,
                        report,
                        stores.selections,
                        stores.installations,
                    ),
                },
            };
            this.logger.info("provider.instance.composition.created", {
                instanceId: instance.id,
                bootstrapReadMs: roundDuration(bootstrapReadMs),
                storesMs: roundDuration(storesMs),
                assemblyMs: roundDuration(performance.now() - startedAt - bootstrapReadMs - storesMs),
                durationMs: roundDuration(performance.now() - startedAt),
            });
            return composition;
        } catch (error) {
            await operationRecovery?.stop();
            await stores.close();
            throw error;
        }
    }
    private requiredProfile(id: string, version: string): OfficialInstanceProfile {
        const profile = this.profiles.resolve(id, version);
        if (!profile) {
            throw new Error(`Unsupported Provider instance profile: ${id}@${version}`);
        }
        return profile;
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

function providerReport(instance: ProviderInstanceRecord, profile: OfficialInstanceProfile): ProviderRuntimeReport {
    return {
        protocol: "ulvia-provider/v1",
        providerId: profile.manifest.providerId,
        instanceId: instance.id,
        account: { id: instance.id, label: instance.label },
        buildVersion: "1.0.0",
        manifest: { version: profile.manifest.version, digest: profile.manifest.digest as ProviderManifestDigest },
        implementations: profile.contracts.map((contract) => ({
            ...contract,
            digest: contract.digest as ReleaseDigest,
            status: "ready" as const,
        })),
    };
}

function compositionKey(instance: ProviderInstanceRecord): string {
    return `${instance.id}\0${instance.profile.id}\0${instance.profile.version}`;
}
