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
import type { InstanceCredentialStore } from "../authentication/InstanceCredentialStore";
import type { SecretStore } from "@bernouy/secret-store";
import { createProviderGateway } from "../gateway/createProviderGateway";
import { MongoProviderOperationStore } from "../provider-operations/MongoProviderOperationStore";
import { createProviderStores, type ProviderStores } from "../stores/providerStores";
import { createInstanceProvisioningTarget } from "./instanceProvisioning";

const SITE_ID = "default";

export type InstanceComposition = Readonly<{
    stores: ProviderStores;
    runtime: UlviaProviderInstanceRuntime;
    management: ProviderManagement;
}>;

export class ProviderInstanceHost {
    readonly #instances = new Map<string, Promise<InstanceComposition>>();
    readonly #providerSource: HttpProviderRepository;
    readonly #collectionSource: HttpCollectionRepository;

    constructor(
        private readonly env: ProviderRuntimeEnv,
        private readonly credentials: InstanceCredentialStore,
        private readonly secrets: SecretStore,
    ) {
        this.#providerSource = new HttpProviderRepository("ulvia-provider-bootstrap", env.CMS_REPOSITORY_URL);
        this.#collectionSource = new HttpCollectionRepository("ulvia-provider-bootstrap", env.CMS_REPOSITORY_URL);
    }

    async runtime(instance: ProviderInstanceRecord): Promise<UlviaProviderInstanceRuntime> {
        return (await this.open(instance)).runtime;
    }

    async target(instance: ProviderInstanceRecord): Promise<OfficialInstanceProvisioningTarget> {
        const composition = await this.open(instance);
        return createInstanceProvisioningTarget({
            instance,
            composition,
            env: this.env,
            credentials: this.credentials,
            secrets: this.secrets,
            providerSource: this.#providerSource,
            collectionSource: this.#collectionSource,
        });
    }

    async close(): Promise<void> {
        const instances = await Promise.allSettled(this.#instances.values());
        await Promise.all(
            instances.flatMap((result) => (result.status === "fulfilled" ? [result.value.stores.close()] : [])),
        );
    }

    private open(instance: ProviderInstanceRecord): Promise<InstanceComposition> {
        const existing = this.#instances.get(instance.id);
        if (existing) {
            return existing;
        }
        const created = this.createComposition(instance).catch((error) => {
            this.#instances.delete(instance.id);
            throw error;
        });
        this.#instances.set(instance.id, created);
        return created;
    }

    private async createComposition(instance: ProviderInstanceRecord): Promise<InstanceComposition> {
        const filesDirectory = join(this.env.CMS_FILES_DIR, instance.storageKey);
        await mkdir(filesDirectory, { recursive: true, mode: 0o700 });
        const stores = await createProviderStores({
            ...this.env,
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
