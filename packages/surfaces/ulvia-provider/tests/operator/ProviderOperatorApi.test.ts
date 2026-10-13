import { expect, test } from "bun:test";
import { BunRunner } from "@bernouy/http-runner";
import { serveForTest } from "@bernouy/http-runner/testing";
import type {
    CreateProviderInstanceRecord,
    OfficialInstanceProvisioner,
    ProviderInstanceRecord,
    ProviderInstanceRegistry,
    UpdateProviderInstanceRecord,
} from "../../src";
import { ProviderInstanceLifecycle, ProviderOperatorApi } from "../../src";

const OPERATOR_TOKEN = "operator-token-that-is-long-enough";

test("the operator API protects and exposes instance lifecycle operations", async () => {
    const instance = readyInstance();
    const creates: unknown[] = [];
    const lifecycle = {
        list: async () => [instance],
        get: async (id: string) => (id === instance.id ? instance : null),
        create: async (key: string, input: unknown) => {
            creates.push({ key, input });
            return {
                instance,
                credentials: {
                    instanceAccessToken: "new-instance-token",
                },
            };
        },
        disable: async (id: string) => (id === instance.id ? { ...instance, status: "disabled" } : null),
    } as unknown as ProviderInstanceLifecycle;
    const runner = new BunRunner();
    new ProviderOperatorApi(runner, OPERATOR_TOKEN, lifecycle);
    const server = serveForTest(runner);
    const authorization = { Authorization: `Bearer ${OPERATOR_TOKEN}` };
    try {
        expect((await server.request("GET", "/ulvia/operator/instances")).status).toBe(401);
        const listing = await server.request("GET", "/ulvia/operator/instances", { headers: authorization });
        expect((await listing.json()).instances).toHaveLength(1);

        const created = await server.request("POST", "/ulvia/operator/instances", {
            headers: { ...authorization, "content-type": "application/json", "idempotency-key": "create-one" },
            body: JSON.stringify({
                label: "One",
                kernelUrl: "http://127.0.0.1:5100",
                administrator: { email: "admin@example.test", password: "long-enough-password" },
            }),
        });
        expect(created.status).toBe(201);
        expect((await created.json()).credentials.instanceAccessToken).toBe("new-instance-token");
        expect(creates).toHaveLength(1);

        const disabled = await server.request(
            "POST",
            `/ulvia/operator/instances/${encodeURIComponent(instance.id)}/disable`,
            { headers: authorization },
        );
        expect((await disabled.json()).status).toBe("disabled");
    } finally {
        server.stop();
    }
});

test("an idempotency key can only replay the exact instance request", async () => {
    const registry = new MemoryRegistry();
    const lifecycle = new ProviderInstanceLifecycle(
        registry,
        {
            ensure: async () => ({
                instanceAccessToken: "instance-token",
                invocationSecret: "invocation-secret",
                sessionSecret: "session-secret",
                kekHex: "kek",
            }),
            read: async () => null,
            disable: async () => undefined,
            stageAdministrator: async () => undefined,
            readAdministrator: async () => null,
            clearAdministrator: async () => undefined,
        },
        { provision: async (id: string) => required(await registry.get(id)) } as unknown as OfficialInstanceProvisioner,
        "idempotency-secret",
    );
    const input = {
        label: "One",
        kernelUrl: "http://127.0.0.1:5100",
        administrator: { email: "admin@example.test", password: "long-enough-password" },
    };

    const created = await lifecycle.create("create-one", input);
    expect((await lifecycle.create("create-one", input)).instance.id).toBe(created.instance.id);
    await expect(
        lifecycle.create("create-one", {
            ...input,
            administrator: { ...input.administrator, password: "different-password" },
        }),
    ).rejects.toThrow("different request");
});

function readyInstance(): ProviderInstanceRecord {
    return {
        id: "instance:one",
        idempotencyKey: "create-one",
        idempotencyFingerprint: "fingerprint",
        storageKey: "one",
        kernelUrl: "http://127.0.0.1:5100",
        label: "One",
        status: "ready",
        profile: { id: "ulvia.official", version: "1.0.0" },
        revision: 6,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
    };
}

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
        const created = { ...record, revision: 1, createdAt: now, updatedAt: now };
        this.#record = created;
        return created;
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
