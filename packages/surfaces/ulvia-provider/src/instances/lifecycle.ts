import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { SystemInstallationSource, SystemUpgradeInput, SystemUpgradeOperations } from "./installationPlan";
import type { OfficialInstanceProvisioner, ProviderInstanceAdministrator } from "./provisioning";
import type { ProviderInstanceRegistry } from "./registry";
import type { ProviderInstanceRecord } from "./types";

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
        private readonly provisioner: OfficialInstanceProvisioner,
        private readonly system: SystemInstallationSource,
        private readonly idempotencySecret: string,
        private readonly upgrades?: SystemUpgradeOperations,
    ) {}

    async create(idempotencyKey: string, input: CreateProviderInstance): Promise<CreatedProviderInstance> {
        validateCreateInput(idempotencyKey, input);
        const idempotencyFingerprint = fingerprintCreateInput(input, this.idempotencySecret);
        let instance = await this.instances.getByIdempotencyKey(idempotencyKey);
        if (!instance) {
            const uuid = randomUUID();
            instance = await this.instances.create({
                id: `instance:${uuid}`,
                idempotencyKey,
                idempotencyFingerprint,
                storageKey: `instance-${uuid}`,
                cmsUrl: new URL(input.cmsUrl).origin,
                gatewayUrl: new URL(input.gatewayUrl ?? input.cmsUrl).origin,
                label: input.label.trim(),
                status: "provisioning",
                systemPlan: await this.system.current(),
                repository: { url: "https://repo.ulvia.fr", configured: false },
            });
        }
        assertMatchingFingerprint(instance.idempotencyFingerprint, idempotencyFingerprint);
        if (instance.status === "disabled") {
            throw new TypeError("Provider instance is disabled");
        }
        const credentials = await this.credentials.ensure(instance);
        if (instance.status === "ready") {
            return { instance, credentials: { instanceAccessToken: credentials.instanceAccessToken } };
        }
        await this.credentials.stageAdministrator(instance.id, input.administrator);
        const provisioned = await this.provisioner.provision(instance.id);
        return {
            instance: provisioned,
            credentials: { instanceAccessToken: credentials.instanceAccessToken },
        };
    }

    get(instanceId: string): Promise<ProviderInstanceRecord | null> {
        return this.instances.get(instanceId);
    }

    list(): Promise<readonly ProviderInstanceRecord[]> {
        return this.instances.list();
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
            return instance;
        }
        await this.credentials.disable(instanceId);
        return this.instances.update(instanceId, instance.revision, { status: "disabled", failure: null });
    }
}

function fingerprintCreateInput(input: CreateProviderInstance, secret: string): string {
    return createHmac("sha256", secret)
        .update(
            JSON.stringify({
                label: input.label.trim(),
                cmsUrl: new URL(input.cmsUrl).toString(),
                gatewayUrl: new URL(input.gatewayUrl ?? input.cmsUrl).toString(),
                administrator: input.administrator,
            }),
        )
        .digest("base64url");
}

function assertMatchingFingerprint(expected: string, actual: string): void {
    const expectedBytes = Buffer.from(expected);
    const actualBytes = Buffer.from(actual);
    if (expectedBytes.length !== actualBytes.length || !timingSafeEqual(expectedBytes, actualBytes)) {
        throw new TypeError("Idempotency key was already used with a different request");
    }
}

function validateCreateInput(idempotencyKey: string, input: CreateProviderInstance): void {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(idempotencyKey)) {
        throw new TypeError("Idempotency key is invalid");
    }
    const label = input.label.trim();
    if (!label || label.length > 80 || /[\x00-\x1f\x7f]/u.test(label)) {
        throw new TypeError("Instance label is invalid");
    }
    for (const value of [input.cmsUrl, input.gatewayUrl ?? input.cmsUrl]) {
        let url: URL;
        try {
            url = new URL(value);
        } catch {
            throw new TypeError("Edge URL is invalid");
        }
        if (
            value.length > 2048 ||
            !/^https?:$/u.test(url.protocol) ||
            url.username ||
            url.password ||
            url.pathname !== "/" ||
            url.search ||
            url.hash
        ) {
            throw new TypeError("Edge URL is invalid");
        }
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(input.administrator.email) || input.administrator.email.length > 254) {
        throw new TypeError("Administrator email is invalid");
    }
    if (input.administrator.password.length < 12 || input.administrator.password.length > 1_024) {
        throw new TypeError("Administrator password is invalid");
    }
}
