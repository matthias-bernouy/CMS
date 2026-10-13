import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { OFFICIAL_INSTANCE_PROFILE } from "./officialProfile";
import type { OfficialInstanceProvisioner, ProviderInstanceAdministrator } from "./provisioning";
import type { ProviderInstanceRegistry } from "./registry";
import type { ProviderInstanceRecord } from "./types";

export interface ProviderInstanceCredentials {
    ensure(instance: ProviderInstanceRecord): Promise<ProviderInstanceRuntimeCredentials>;
    read(instanceId: string): Promise<ProviderInstanceRuntimeCredentials | null>;
    disable(instanceId: string): Promise<void>;
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
    kernelUrl: string;
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
        private readonly idempotencySecret: string,
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
                kernelUrl: input.kernelUrl,
                label: input.label.trim(),
                status: "provisioning",
                profile: { id: OFFICIAL_INSTANCE_PROFILE.id, version: OFFICIAL_INSTANCE_PROFILE.version },
            });
        }
        assertMatchingFingerprint(instance.idempotencyFingerprint, idempotencyFingerprint);
        const credentials = await this.credentials.ensure(instance);
        const provisioned = await this.provisioner.provision(instance.id, input.administrator);
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
                kernelUrl: new URL(input.kernelUrl).toString(),
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
    let kernelUrl: URL;
    try {
        kernelUrl = new URL(input.kernelUrl);
    } catch {
        throw new TypeError("Kernel URL is invalid");
    }
    if (
        !/^https?:$/u.test(kernelUrl.protocol) ||
        kernelUrl.username ||
        kernelUrl.password ||
        kernelUrl.pathname !== "/"
    ) {
        throw new TypeError("Kernel URL is invalid");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(input.administrator.email) || input.administrator.email.length > 254) {
        throw new TypeError("Administrator email is invalid");
    }
    if (input.administrator.password.length < 12 || input.administrator.password.length > 1_024) {
        throw new TypeError("Administrator password is invalid");
    }
}
