import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { createContentReader } from "@bernouy/cms-content/rendering";
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
    resolveOfficialInstanceProfile,
    type OfficialInstanceProfile,
    type OfficialInstanceProvisioningTarget,
    type ProviderInstanceRecord,
    type UlviaProviderInstanceRuntime,
} from "@bernouy/ulvia-provider";
import type { ProviderRuntimeEnv } from "../../runtimeEnv";
import type { EncryptedInstanceCredentials } from "../authentication/EncryptedInstanceCredentials";
import { createProviderGateway } from "../gateway/createProviderGateway";
import { createProtectedProviderManagement } from "../gateway/protectedManagement";
import { createInstanceKernelApi } from "../kernel/InstanceKernelApi";
import { MongoProviderOperationStore } from "../provider-operations/MongoProviderOperationStore";
import { RecoverySupervisor } from "../recovery/RecoverySupervisor";
import { createProviderStores, type ProviderStores } from "../stores/providerStores";
import { createInstanceProvisioningTarget } from "./instanceProvisioning";
import { InstanceResourcePool, type ResourceLease, type ResourceLifetime } from "./InstanceResourcePool";

const SITE_ID = "default";
const MAX_OPEN_INSTANCES = 32;
const INSTANCE_IDLE_MS = 60_000;

export type InstanceComposition = Readonly<{
    stores: ProviderStores;
    gateway: Awaited<ReturnType<typeof createProviderGateway>>;
    runtime: UlviaProviderInstanceRuntime;
    management: ProviderManagement;
    managementForProfile(profile: OfficialInstanceProfile): ProviderManagement;
    administrators: Awaited<ReturnType<typeof createProviderGateway>>["administrators"];
    operations: ProviderOperationExecutor;
    close(): Promise<void>;
}>;

export class ProviderInstanceHost {
    readonly #instances: InstanceResourcePool<InstanceComposition>;
    readonly #providerSource: HttpProviderRepository;
    readonly #collectionSource: HttpCollectionRepository;

    constructor(
        private readonly env: ProviderRuntimeEnv,
        private readonly credentials: EncryptedInstanceCredentials,
    ) {
        this.#providerSource = new HttpProviderRepository("ulvia-provider-bootstrap", env.CMS_REPOSITORY_URL);
        this.#collectionSource = new HttpCollectionRepository("ulvia-provider-bootstrap", env.CMS_REPOSITORY_URL);
        this.#instances = new InstanceResourcePool(
            (key, lifetime) => this.createComposition(this.#records.get(key)!, lifetime),
            (composition) => composition.close(),
            { maxEntries: MAX_OPEN_INSTANCES, idleMs: INSTANCE_IDLE_MS },
        );
    }

    readonly #records = new Map<string, ProviderInstanceRecord>();

    async runtime(instance: ProviderInstanceRecord): Promise<ResourceLease<UlviaProviderInstanceRuntime>> {
        const lease = await this.open(instance);
        return {
            resource: {
                ...lease.resource.runtime,
                report: providerReport(instance),
                instance: {
                    id: instance.id,
                    status: instance.status,
                    revision: instance.revision,
                    profile: instance.profile,
                },
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
        const credentials = await this.credentials.read(instance.id);
        if (!credentials) {
            throw new Error(`Provider instance credentials are unavailable: ${instance.id}`);
        }
        const filesDirectory = join(this.env.CMS_FILES_DIR, instance.storageKey);
        await mkdir(filesDirectory, { recursive: true, mode: 0o700 });
        const stores = await createProviderStores({
            CMS_COLLECTION_MIGRATION_ROLLBACK_RETENTION: this.env.CMS_COLLECTION_MIGRATION_ROLLBACK_RETENTION,
            CMS_SESSION_SECRET: credentials.sessionSecret,
            CMS_KEK: {
                activeKeyId: "instance",
                keysHex: { instance: credentials.kekHex },
                rotateOnStart: false,
            },
            MONGO_URL: instanceMongoUrl(this.env.MONGO_URL, instance.storageKey),
            CMS_FILES_DIR: filesDirectory,
            KERNEL_PUBLIC_URL: instance.kernelUrl,
        });
        let operationRecovery: RecoverySupervisor | undefined;
        try {
            const gateway = await createProviderGateway(stores, SITE_ID);
            const managementForProfile = (profile: OfficialInstanceProfile) =>
                new ProviderManagement(gateway, stores.secrets, {
                    sources: [this.#providerSource],
                    readReport: async () => providerReport(instance, profile),
                });
            const profile = requiredProfile(instance.profile.id, instance.profile.version);
            const report = providerReport(instance, profile);
            const management = managementForProfile(profile);
            const providerOperations = new MongoProviderOperationStore(stores.db);
            await providerOperations.init();
            const operations = new ProviderOperationExecutor(providerOperations, undefined, {
                retainResource: lifetime.retain,
            });
            const dispatcher = new DefaultProviderCapabilityDispatcher();
            registerOfficialProviderCapabilities(
                dispatcher,
                stores,
                gateway,
                operations,
                createProtectedProviderManagement(management, instance),
                new CollectionSources(stores.collections, [this.#collectionSource]),
                stores.providerFiles,
            );
            operationRecovery = new RecoverySupervisor((limit) => operations.recover(limit));
            await operationRecovery.start(false);
            const activeRecovery = operationRecovery;
            const content = createContentReader(stores.repo);
            const kernel = await createInstanceKernelApi(instance, { stores, gateway });
            return {
                stores,
                gateway,
                management,
                managementForProfile,
                administrators: gateway.administrators,
                operations,
                close: async () => {
                    await activeRecovery.stop();
                    await operations.stop();
                    await stores.close();
                },
                runtime: {
                    siteId: SITE_ID,
                    report,
                    dispatcher,
                    instance: {
                        id: instance.id,
                        status: instance.status,
                        revision: instance.revision,
                        profile: instance.profile,
                    },
                    contentRevision: async () => (await content.getContentRevision?.()) ?? instance.revision,
                    kernel,
                },
            };
        } catch (error) {
            await operationRecovery?.stop();
            await stores.close();
            throw error;
        }
    }
}

function providerReport(
    instance: ProviderInstanceRecord,
    selectedProfile?: OfficialInstanceProfile,
): ProviderRuntimeReport {
    const profile = selectedProfile ?? requiredProfile(instance.profile.id, instance.profile.version);
    return {
        protocol: "ulvia-provider/v1",
        providerId: profile.manifest.providerId,
        instanceId: instance.id,
        account: { id: instance.id, label: instance.label },
        buildVersion: profile.manifest.version,
        manifest: { version: profile.manifest.version, digest: profile.manifest.digest as ProviderManifestDigest },
        implementations: profile.contracts.map((contract) => ({
            ...contract,
            digest: contract.digest as ReleaseDigest,
            status: "ready" as const,
        })),
    };
}

function requiredProfile(id: string, version: string): OfficialInstanceProfile {
    const profile = resolveOfficialInstanceProfile(id, version);
    if (!profile) {
        throw new Error(`Unsupported Provider instance profile: ${id}@${version}`);
    }
    return profile;
}

function compositionKey(instance: ProviderInstanceRecord): string {
    return `${instance.id}\0${instance.profile.id}\0${instance.profile.version}`;
}

function instanceMongoUrl(controlUrl: string, storageKey: string): string {
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/u.test(storageKey)) {
        throw new TypeError("Provider instance storage key is invalid");
    }
    const url = new URL(controlUrl);
    url.pathname = `/ulvia_${storageKey.replaceAll("-", "_")}`;
    return url.toString();
}
