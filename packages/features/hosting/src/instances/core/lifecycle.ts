import { assertMatchingFingerprint, prepareInstanceCreation } from "./creation";
import { ProviderInstanceTransitionBusyError } from "./errors";
import type {
    SystemInstallationSource,
    SystemUpgradeInput,
    SystemUpgradeOperations,
} from "hosting/instances/interfaces/installationPlan";
import type { OfficialInstanceProvisioner, ProviderInstanceAdministrator } from "hosting/instances/core/provisioning";
import type { ProviderInstanceRegistry } from "hosting/instances/interfaces/registry";
import type { ProviderInstanceRecord } from "hosting/instances/interfaces/types";
import type { InstanceCreationAuthority } from "hosting/instances/interfaces/types";

export interface ProviderInstanceCredentials {
    ensure(instance: ProviderInstanceRecord): Promise<ProviderInstanceRuntimeCredentials>;
    read(instanceId: string): Promise<ProviderInstanceRuntimeCredentials | null>;
    disable(instanceId: string): Promise<void>;
    stageAdministrator(instanceId: string, administrator: ProviderInstanceAdministrator): Promise<void>;
    readAdministrator(instanceId: string): Promise<ProviderInstanceAdministrator | null>;
    clearAdministrator(instanceId: string): Promise<void>;
}

export type ProviderInstanceRuntimeCredentials = Readonly<{
    instanceAccessToken: string;
    invocationSecret: string;
    sessionSecret: string;
    kekHex: string;
}>;

export type ProviderInstanceAccessCredentials = Readonly<{
    instanceAccessToken: string;
}>;

export type CreateProviderInstance = Readonly<{
    label: string;
    cmsUrl: string;
    gatewayUrl?: string;
    administrator: ProviderInstanceAdministrator;
}>;

export type CreatedProviderInstance = Readonly<{
    instance: ProviderInstanceRecord;
    credentials: ProviderInstanceAccessCredentials;
}>;

export class ProviderInstanceLifecycle {
    constructor(
        private readonly instances: ProviderInstanceRegistry,
        private readonly credentials: ProviderInstanceCredentials,
        private readonly provisioner: Pick<OfficialInstanceProvisioner, "provision" | "assertCreationAuthority">,
        private readonly system: SystemInstallationSource,
        private readonly idempotencySecret: string,
        private readonly upgrades?: SystemUpgradeOperations,
    ) {}

    /** Pure reservation identity: callers can reserve a domain before provisioning writes. */
    async prepare(idempotencyKey: string, input: CreateProviderInstance, authority: InstanceCreationAuthority) {
        const candidate = prepareInstanceCreation(idempotencyKey, input, this.idempotencySecret, authority);
        await this.provisioner.assertCreationAuthority(candidate.creationAuthority);
        const current = await this.instances.getByIdempotencyKey(idempotencyKey);
        if (current) {
            assertMatchingFingerprint(current.idempotencyFingerprint, candidate.idempotencyFingerprint);
            if (current.status === "disabled") {
                throw new TypeError("Provider instance is disabled");
            }
        }
        return candidate;
    }

    async create(
        idempotencyKey: string,
        input: CreateProviderInstance,
        authority: InstanceCreationAuthority,
    ): Promise<CreatedProviderInstance> {
        const candidate = await this.prepare(idempotencyKey, input, authority);
        let instance = await this.instances.getByIdempotencyKey(idempotencyKey);
        if (!instance) {
            const systemPlan = await this.system.current();
            await this.provisioner.assertCreationAuthority(candidate.creationAuthority);
            try {
                instance = await this.instances.create({
                    ...candidate,
                    status: "provisioning",
                    systemPlan,
                    repository: { url: "https://repo.ulvia.fr", configured: false },
                });
            } catch (error) {
                // Another process may have acquired the same unique idempotency key.
                instance = await this.instances.getByIdempotencyKey(idempotencyKey);
                if (!instance) {
                    throw error;
                }
            }
        }
        assertMatchingFingerprint(instance.idempotencyFingerprint, candidate.idempotencyFingerprint);
        if (instance.status === "disabled") {
            throw new TypeError("Provider instance is disabled");
        }
        await this.provisioner.assertCreationAuthority(instance.creationAuthority);
        const credentials = await this.credentials.ensure(instance);
        await this.provisioner.assertCreationAuthority(instance.creationAuthority);
        if (instance.status === "ready") {
            return { instance, credentials: { instanceAccessToken: credentials.instanceAccessToken } };
        }
        await this.credentials.stageAdministrator(instance.id, input.administrator);
        let provisioned: ProviderInstanceRecord;
        try {
            provisioned = await this.provisioner.provision(instance.id);
        } catch (error) {
            if (!(error instanceof ProviderInstanceTransitionBusyError)) {
                throw error;
            }
            provisioned = await this.requiredInstance(instance.id);
        }
        await this.provisioner.assertCreationAuthority(instance.creationAuthority);
        return {
            instance: provisioned,
            credentials: { instanceAccessToken: credentials.instanceAccessToken },
        };
    }

    get(instanceId: string): Promise<ProviderInstanceRecord | null> {
        return this.instances.get(instanceId);
    }

    page(after: string | null, limit: number) {
        if (
            !Number.isSafeInteger(limit) ||
            limit < 1 ||
            limit > 50 ||
            (after !== null && !/^instance:[A-Za-z0-9-]{1,100}$/u.test(after))
        ) {
            throw new TypeError("Invalid instance page cursor or limit");
        }
        return this.instances.page({ after, limit });
    }

    async reviewSystemUpgrade(instanceId: string, input: SystemUpgradeInput) {
        return this.requiredUpgrades().review(await this.requiredInstance(instanceId), input);
    }

    async upgradeSystem(instanceId: string, input: SystemUpgradeInput & { planDigest: string }) {
        return this.requiredUpgrades().apply(await this.requiredInstance(instanceId), input);
    }

    async resumeSystemUpgrade(instanceId: string, administratorSub: string) {
        return this.requiredUpgrades().resume(await this.requiredInstance(instanceId), administratorSub);
    }

    private requiredUpgrades() {
        if (!this.upgrades) {
            throw new Error("System upgrades are unavailable");
        }
        return this.upgrades;
    }

    private async requiredInstance(instanceId: string) {
        const instance = await this.instances.get(instanceId);
        if (!instance) {
            throw new TypeError("Unknown Provider instance");
        }
        return instance;
    }

    async disable(instanceId: string): Promise<ProviderInstanceRecord | null> {
        const instance = await this.instances.get(instanceId);
        if (!instance) {
            return null;
        }
        if (instance.status === "disabled") {
            await this.credentials.disable(instanceId);
            return instance;
        }
        const disabled = await this.instances.update(instanceId, instance.revision, {
            status: "disabled",
            failure: null,
        });
        await this.credentials.disable(instanceId);
        return disabled;
    }
}
