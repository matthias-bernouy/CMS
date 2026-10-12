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
    OFFICIAL_INSTANCE_PROFILE,
    ProviderOperationExecutor,
    registerOfficialProviderCapabilities,
    type OfficialInstanceProvisioningTarget,
    type ProviderInstanceRecord,
    type UlviaProviderInstanceRuntime,
} from "@bernouy/ulvia-provider";
import type { ProviderRuntimeEnv } from "../../runtimeEnv";
import type { EncryptedInstanceCredentials } from "../authentication/EncryptedInstanceCredentials";
import { createProviderGateway } from "../gateway/createProviderGateway";
import { MongoProviderOperationStore } from "../provider-operations/MongoProviderOperationStore";
import { createProviderStores, type ProviderStores } from "../stores/providerStores";
import { createInstanceProvisioningTarget } from "./instanceProvisioning";
import { InstanceResourcePool, type ResourceLease } from "./InstanceResourcePool";

const SITE_ID = "default";
const MAX_OPEN_INSTANCES = 32;
const INSTANCE_IDLE_MS = 60_000;

export type InstanceComposition = Readonly<{
    stores: ProviderStores;
    runtime: UlviaProviderInstanceRuntime;
    management: ProviderManagement;
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
            (instanceId) => this.createComposition(this.#records.get(instanceId)!),
            (composition) => composition.stores.close(),
            { maxEntries: MAX_OPEN_INSTANCES, idleMs: INSTANCE_IDLE_MS },
        );
    }

    readonly #records = new Map<string, ProviderInstanceRecord>();

    async runtime(instance: ProviderInstanceRecord): Promise<ResourceLease<UlviaProviderInstanceRuntime>> {
        const lease = await this.open(instance);
        return { resource: lease.resource.runtime, release: lease.release };
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

    private async open(instance: ProviderInstanceRecord): Promise<ResourceLease<InstanceComposition>> {
        this.#records.set(instance.id, instance);
        try {
            return await this.#instances.acquire(instance.id);
        } finally {
            this.#records.delete(instance.id);
        }
    }

    private async createComposition(instance: ProviderInstanceRecord): Promise<InstanceComposition> {
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
        try {
            const gateway = await createProviderGateway(stores, SITE_ID);
            const report = providerReport(instance);
            const management = new ProviderManagement(gateway, stores.secrets, {
                sources: [this.#providerSource],
                readReport: async () => report,
            });
            const providerOperations = new MongoProviderOperationStore(stores.db);
            await providerOperations.init();
            const operations = new ProviderOperationExecutor(providerOperations);
            await operations.recover();
            const dispatcher = new DefaultProviderCapabilityDispatcher();
            registerOfficialProviderCapabilities(
                dispatcher,
                stores,
                gateway,
                operations,
                management,
                new CollectionSources(stores.collections, [this.#collectionSource]),
                stores.providerFiles,
            );
            return { stores, management, runtime: { siteId: SITE_ID, report, dispatcher } };
        } catch (error) {
            await stores.close();
            throw error;
        }
    }
}

function providerReport(instance: ProviderInstanceRecord): ProviderRuntimeReport {
    const profile = OFFICIAL_INSTANCE_PROFILE;
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

function instanceMongoUrl(controlUrl: string, storageKey: string): string {
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/u.test(storageKey)) {
        throw new TypeError("Provider instance storage key is invalid");
    }
    const url = new URL(controlUrl);
    url.pathname = `/ulvia_${storageKey.replaceAll("-", "_")}`;
    return url.toString();
}
