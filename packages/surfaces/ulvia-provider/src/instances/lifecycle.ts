import { randomUUID } from "node:crypto";
import { OFFICIAL_INSTANCE_PROFILE } from "./officialProfile";
import type { OfficialInstanceProvisioner, ProviderInstanceAdministrator } from "./provisioning";
import type { ProviderInstanceRegistry } from "./registry";
import type { ProviderInstanceRecord } from "./types";

export interface ProviderInstanceCredentials {
    ensure(instance: ProviderInstanceRecord): Promise<string>;
    disable(instanceId: string): Promise<void>;
}

export type CreateProviderInstance = Readonly<{
    label: string;
    kernelUrl: string;
    administrator: ProviderInstanceAdministrator;
}>;

export type CreatedProviderInstance = Readonly<{
    instance: ProviderInstanceRecord;
    token: string;
}>;

export class ProviderInstanceLifecycle {
    constructor(
        private readonly instances: ProviderInstanceRegistry,
        private readonly credentials: ProviderInstanceCredentials,
        private readonly provisioner: OfficialInstanceProvisioner,
    ) {}

    async create(idempotencyKey: string, input: CreateProviderInstance): Promise<CreatedProviderInstance> {
        validateCreateInput(idempotencyKey, input);
        let instance = await this.instances.getByIdempotencyKey(idempotencyKey);
        if (!instance) {
            const uuid = randomUUID();
            instance = await this.instances.create({
                id: `instance:${uuid}`,
                idempotencyKey,
                storageKey: `instance-${uuid}`,
                kernelUrl: input.kernelUrl,
                label: input.label.trim(),
                status: "provisioning",
                profile: { id: OFFICIAL_INSTANCE_PROFILE.id, version: OFFICIAL_INSTANCE_PROFILE.version },
            });
        }
        const token = await this.credentials.ensure(instance);
        const provisioned = await this.provisioner.provision(instance.id, input.administrator);
        return { instance: provisioned, token };
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
