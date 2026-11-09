import {
    ControlAuthority,
    DomainAdmissionPolicy,
    InstanceManagement,
    reserveHostingInstallation,
} from "@bernouy/hosting";
import { InMemoryHostingStore } from "@bernouy/hosting/memory";
import { ProviderInstanceLifecycle } from "@bernouy/hosting/instances";
import type {
    CreateProviderInstanceRecord,
    ProviderInstanceRecord,
    ProviderInstanceRegistry,
    UpdateProviderInstanceRecord,
} from "@bernouy/hosting/instances";

export class InstanceRegistry implements ProviderInstanceRegistry {
    readonly records = new Map<string, ProviderInstanceRecord>();
    creates = 0;
    pages = 0;
    async init() {}
    async create(candidate: CreateProviderInstanceRecord) {
        if (await this.getByIdempotencyKey(candidate.idempotencyKey)) {
            throw new Error("duplicate key");
        }
        const record = {
            ...candidate,
            revision: 1,
            createdAt: new Date(0).toISOString(),
            updatedAt: new Date(0).toISOString(),
        };
        // No await between the final uniqueness check and the insertion.
        if (this.records.has(record.id)) {
            throw new Error("duplicate key");
        }
        this.records.set(record.id, record);
        this.creates++;
        return record;
    }
    async get(id: string) {
        return this.records.get(id) ?? null;
    }
    async getByIdempotencyKey(key: string) {
        return [...this.records.values()].find((record) => record.idempotencyKey === key) ?? null;
    }
    async list(): Promise<readonly ProviderInstanceRecord[]> {
        throw new Error("unbounded list forbidden");
    }
    async page(input: { after: string | null; limit: number }) {
        this.pages++;
        const records = [...this.records.values()]
            .filter((record) => input.after === null || record.id > input.after)
            .sort((a, b) => (a.id < b.id ? -1 : a.id === b.id ? 0 : 1));
        const items = records.slice(0, input.limit);
        return { items, nextCursor: records.length > input.limit ? items.at(-1)!.id : null };
    }
    async update(id: string, revision: number, changes: UpdateProviderInstanceRecord) {
        const current = this.records.get(id);
        if (!current || current.revision !== revision) {
            throw new Error("revision conflict");
        }
        const { failure: _old, ...record } = current;
        const { failure, ...patch } = changes;
        const next = { ...record, ...patch, ...(failure ? { failure } : {}), revision: revision + 1 };
        this.records.set(id, next);
        return next;
    }
}

export async function instanceFixture() {
    const store = new InMemoryHostingStore();
    await reserveHostingInstallation(store, "http://control.localhost");
    await store.bindControl(1, "control-id");
    await store.completeInstallation(2);
    let admin = true;
    const authority = new ControlAuthority(store, async () => admin);
    const registry = new InstanceRegistry();
    const lifecycle = new ProviderInstanceLifecycle(
        registry,
        {
            ensure: async () => ({
                instanceAccessToken: "must-never-escape",
                invocationSecret: "invocation",
                sessionSecret: "session",
                kekHex: "key",
            }),
            read: async () => null,
            disable: async () => undefined,
            stageAdministrator: async () => undefined,
            readAdministrator: async () => null,
            clearAdministrator: async () => undefined,
        },
        {
            assertCreationAuthority: async (issuer) => {
                if (issuer.kind === "control") {
                    await authority.assertAdministrator(issuer.actor);
                }
            },
            provision: async (id) => {
                const record = (await registry.get(id))!;
                if (record.status === "ready") {
                    return record;
                }
                return registry.update(id, record.revision, { status: "ready" });
            },
        },
        {
            current: async () => ({
                manifest: { providerId: "ulvia/provider", version: "1.0.0", digest: `sha256:${"a".repeat(64)}` },
                contracts: [],
            }),
        },
        "idempotency-key-material".repeat(2),
    );
    const management = new InstanceManagement(
        lifecycle,
        store,
        store,
        authority,
        new DomainAdmissionPolicy(["managed.example"], true),
        "proof-key-material".repeat(3),
    );
    return {
        authority,
        store,
        registry,
        lifecycle,
        management,
        actor: { instanceId: "control-id", subjectId: "admin" },
        setAdmin(value: boolean) {
            admin = value;
        },
    };
}

export function creation(origin = "http://site.localhost") {
    return {
        requestId: crypto.randomUUID(),
        origin,
        label: "Site",
        administrator: { email: "admin@example.test", password: "long-enough-password" },
    };
}
