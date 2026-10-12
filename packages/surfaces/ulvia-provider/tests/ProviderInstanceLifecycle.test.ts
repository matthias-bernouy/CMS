import { expect, test } from "bun:test";
import {
    ProviderInstanceLifecycle,
    type CreateProviderInstance,
    type CreateProviderInstanceRecord,
    type OfficialInstanceProvisioner,
    type ProviderInstanceRecord,
    type ProviderInstanceRegistry,
    type UpdateProviderInstanceRecord,
} from "../src";

const INPUT: CreateProviderInstance = {
    label: "One",
    kernelUrl: "http://127.0.0.1:5100",
    administrator: { email: "admin@example.test", password: "long-enough-password" },
};

test("an idempotency key can only replay the exact instance request", async () => {
    const registry = new MemoryRegistry();
    const lifecycle = new ProviderInstanceLifecycle(
        registry,
        {
            ensure: async () => ({ token: "instance-token", sessionSecret: "session-secret", kekHex: "kek" }),
            read: async () => null,
            disable: async () => undefined,
        },
        { provision: async (id: string) => required(await registry.get(id)) } as unknown as OfficialInstanceProvisioner,
        "idempotency-secret",
    );

    const created = await lifecycle.create("create-one", INPUT);
    expect((await lifecycle.create("create-one", INPUT)).instance.id).toBe(created.instance.id);
    await expect(
        lifecycle.create("create-one", {
            ...INPUT,
            administrator: { ...INPUT.administrator, password: "different-password" },
        }),
    ).rejects.toThrow("different request");
});

function required(instance: ProviderInstanceRecord | null): ProviderInstanceRecord {
    if (!instance) {
        throw new Error("Missing test instance");
    }
    return instance;
}

class MemoryRegistry implements ProviderInstanceRegistry {
    #record: ProviderInstanceRecord | null = null;

    async init(): Promise<void> {}

    async create(record: CreateProviderInstanceRecord): Promise<ProviderInstanceRecord> {
        const now = new Date(0).toISOString();
        this.#record = { ...record, completedSteps: [], revision: 1, createdAt: now, updatedAt: now };
        return this.#record;
    }

    async get(instanceId: string): Promise<ProviderInstanceRecord | null> {
        return this.#record?.id === instanceId ? this.#record : null;
    }

    async getByIdempotencyKey(idempotencyKey: string): Promise<ProviderInstanceRecord | null> {
        return this.#record?.idempotencyKey === idempotencyKey ? this.#record : null;
    }

    async list(): Promise<readonly ProviderInstanceRecord[]> {
        return this.#record ? [this.#record] : [];
    }

    async update(
        _instanceId: string,
        _expectedRevision: number,
        _changes: UpdateProviderInstanceRecord,
    ): Promise<ProviderInstanceRecord> {
        throw new Error("Unexpected update");
    }
}
