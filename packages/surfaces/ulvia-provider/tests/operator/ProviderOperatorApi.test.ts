import { expect, test } from "bun:test";
import { BunRunner } from "@bernouy/http-runner";
import { serveForTest } from "@bernouy/http-runner/testing";
import type {
    CreateProviderInstanceRecord,
    OfficialInstanceProvisioner,
    ProviderInstanceRecord,
    ProviderInstanceRegistry,
    UpdateProviderInstanceRecord,
} from "../../src/exports/index";
import { ProviderInstanceLifecycle, ProviderOperatorApi } from "../../src/exports/index";

const OPERATOR_TOKEN = "operator-token-that-is-long-enough";

test("the operator API protects and exposes instance lifecycle operations", async () => {
    const instance = readyInstance();
    const creates: unknown[] = [];
    const pages: unknown[] = [];
    const lifecycle = {
        page: async (after: string | null, limit: number) => {
            pages.push({ after, limit });
            return { items: [instance], nextCursor: null };
        },
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
        expect((await server.request("GET", "/ulvia/operator/profiles", { headers: authorization })).status).toBe(404);
        const listing = await server.request("GET", "/ulvia/operator/instances", { headers: authorization });
        expect((await listing.json()).instances).toHaveLength(1);
        expect(pages).toEqual([{ after: null, limit: 50 }]);
        const next = await server.request("GET", "/ulvia/operator/instances?after=instance:one&limit=2", {
            headers: authorization,
        });
        expect(next.status).toBe(200);
        await next.body?.cancel();
        expect(pages.at(-1)).toEqual({ after: "instance:one", limit: 2 });
        for (const suffix of ["?limit=51", "?limit=0", "?limit=1&limit=2", "?after=unknown", "?unexpected=1"]) {
            const refused = await server.request("GET", `/ulvia/operator/instances${suffix}`, {
                headers: authorization,
            });
            expect(refused.status).toBe(400);
            await refused.body?.cancel();
        }
        expect(pages).toHaveLength(2);

        const created = await server.request("POST", "/ulvia/operator/instances", {
            headers: { ...authorization, "content-type": "application/json", "idempotency-key": "create-one" },
            body: JSON.stringify({
                label: "One",
                cmsUrl: "http://127.0.0.1:5100",
                gatewayUrl: "http://edge.internal:3000",
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
        expect((await server.request("GET", "/ulvia/operator/instances", { headers: authorization })).status).toBe(200);
    } finally {
        server.stop();
    }
});

test("an idempotency key can only replay the exact instance request", async () => {
    const registry = new MemoryRegistry();
    let stagedAdministrators = 0;
    let provisions = 0;
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
            stageAdministrator: async () => {
                stagedAdministrators++;
            },
            readAdministrator: async () => null,
            clearAdministrator: async () => undefined,
        },
        {
            assertCreationAuthority: async () => undefined,
            provision: async (id: string) => {
                provisions++;
                const current = required(await registry.get(id));
                Object.assign(current, { status: "ready" });
                return current;
            },
        } as unknown as OfficialInstanceProvisioner,
        {
            current: async () => ({
                manifest: {
                    providerId: "ulvia/primary-provider",
                    version: "1.0.0",
                    digest: `sha256:${"a".repeat(64)}`,
                },
                contracts: [],
            }),
        },
        "idempotency-secret",
    );
    const input = {
        label: "One",
        cmsUrl: "http://127.0.0.1:5100",
        gatewayUrl: "http://edge.internal:3000",
        administrator: { email: "admin@example.test", password: "long-enough-password" },
    };

    const created = await lifecycle.create("create-one", input, { kind: "operator" });
    expect((await lifecycle.create("create-one", input, { kind: "operator" })).instance.id).toBe(created.instance.id);
    expect(stagedAdministrators).toBe(1);
    expect(provisions).toBe(1);
    await expect(
        lifecycle.create(
            "create-one",
            {
                ...input,
                administrator: { ...input.administrator, password: "different-password" },
            },
            { kind: "operator" },
        ),
    ).rejects.toThrow("different request");
});

function readyInstance(): ProviderInstanceRecord {
    return {
        repository: { url: "https://repo.ulvia.fr", configured: false },

        id: "instance:one",
        idempotencyKey: "create-one",
        idempotencyFingerprint: "fingerprint",
        creationAuthority: { kind: "operator" },
        storageKey: "one",
        cmsUrl: "http://127.0.0.1:5100",
        gatewayUrl: "http://edge.internal:3000",
        label: "One",
        status: "ready",
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
    async page(input: { after: string | null; limit: number }) {
        const records = (await this.list()).filter((record) => input.after === null || record.id > input.after);
        return { items: records.slice(0, input.limit), nextCursor: null };
    }
    async update(
        _instanceId: string,
        _expectedRevision: number,
        _changes: UpdateProviderInstanceRecord,
    ): Promise<ProviderInstanceRecord> {
        throw new Error("Unexpected update");
    }
}
