import { describe, expect, test } from "bun:test";
import {
    OFFICIAL_INSTANCE_PROFILE,
    OfficialInstanceProvisioner,
    type CreateProviderInstanceRecord,
    type InstanceTransitionRecord,
    type InstanceTransitionStore,
    type OfficialInstanceProvisioningTarget,
    type ProviderInstanceRecord,
    type ProviderInstanceRegistry,
    type UpdateProviderInstanceRecord,
} from "../src";

describe("OfficialInstanceProvisioner", () => {
    test("journals provisioning steps and never replays a completed transition", async () => {
        const registry = new MemoryRegistry(instance());
        const transitions = new MemoryTransitions();
        const calls: string[] = [];
        const provisioner = createProvisioner(registry, transitions, calls);

        expect((await provisioner.provision("instance:one")).status).toBe("ready");
        expect(calls).toEqual(["manifest", "provider", "contracts", "collection", "administrator"]);
        await provisioner.provision("instance:one");
        expect(calls).toHaveLength(5);
        expect(transitions.record?.status).toBe("succeeded");
    });

    test("resumes a failed profile plan after its last durable step", async () => {
        const registry = new MemoryRegistry(instance());
        const transitions = new MemoryTransitions();
        let fails = true;
        const calls: string[] = [];
        const provisioner = createProvisioner(registry, transitions, calls, async () => {
            calls.push("collection");
            if (fails) {
                fails = false;
                throw new Error("repository unavailable");
            }
        });

        await expect(provisioner.provision("instance:one")).rejects.toThrow("repository unavailable");
        await provisioner.provision("instance:one");
        expect(calls.filter((step) => step === "manifest")).toHaveLength(1);
        expect(calls.filter((step) => step === "collection")).toHaveLength(2);
    });

    test("switches from profile 1.0 only after the 1.1 plan succeeds", async () => {
        const registry = new MemoryRegistry(instance("ready", "1.0.0"));
        const calls: string[] = [];
        const provisioner = createProvisioner(registry, new MemoryTransitions(), calls);

        const upgraded = await provisioner.upgrade("instance:one", { id: "ulvia.official", version: "1.1.0" });

        expect(upgraded.profile.version).toBe("1.1.0");
        expect(calls).toEqual(["manifest", "provider", "contracts", "collection"]);
    });
});

function createProvisioner(
    registry: MemoryRegistry,
    transitions: MemoryTransitions,
    calls: string[],
    installCollection: () => Promise<void> = async () => void calls.push("collection"),
) {
    return new OfficialInstanceProvisioner(
        registry,
        transitions,
        async () => target(calls, installCollection),
        async () => ({ email: "admin@example.test", password: "secret" }),
    );
}

function target(calls: string[], installCollection: () => Promise<void>): OfficialInstanceProvisioningTarget {
    return {
        importManifest: async () => void calls.push("manifest"),
        connectProvider: async () => void calls.push("provider"),
        selectContracts: async () => void calls.push("contracts"),
        installCollection,
        initializeAdministrator: async () => void calls.push("administrator"),
    };
}

function instance(
    status: ProviderInstanceRecord["status"] = "provisioning",
    version = OFFICIAL_INSTANCE_PROFILE.version,
) {
    return {
        id: "instance:one",
        idempotencyKey: "create-one",
        idempotencyFingerprint: "fingerprint",
        storageKey: "one",
        kernelUrl: "http://127.0.0.1:5100",
        label: "One",
        status,
        profile: { id: OFFICIAL_INSTANCE_PROFILE.id, version },
        revision: 1,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
    } satisfies ProviderInstanceRecord;
}

class MemoryRegistry implements ProviderInstanceRegistry {
    constructor(private record: ProviderInstanceRecord) {}
    async init(): Promise<void> {}
    async create(_record: CreateProviderInstanceRecord) {
        return this.record;
    }
    async get(id: string) {
        return id === this.record.id ? this.record : null;
    }
    async getByIdempotencyKey() {
        return null;
    }
    async list() {
        return [this.record];
    }
    async update(_id: string, revision: number, changes: UpdateProviderInstanceRecord) {
        expect(revision).toBe(this.record.revision);
        const { failure: _old, ...current } = this.record;
        const { failure, ...patch } = changes;
        this.record = {
            ...current,
            ...patch,
            ...(failure ? { failure } : {}),
            revision: revision + 1,
            updatedAt: new Date(revision).toISOString(),
        };
        return this.record;
    }
}

class MemoryTransitions implements InstanceTransitionStore {
    record: InstanceTransitionRecord | null = null;
    async init(): Promise<void> {}
    async createOrGet(value: Omit<InstanceTransitionRecord, "revision" | "createdAt" | "updatedAt">) {
        if (!this.record) {
            const now = new Date(0).toISOString();
            this.record = { ...value, revision: 1, createdAt: now, updatedAt: now };
        }
        return this.record;
    }
    async get() {
        return this.record;
    }
    async listRecoverable() {
        return this.record ? [this.record] : [];
    }
    async requeue(_id: string, revision: number, now: string) {
        return this.patch(revision, { status: "queued", updatedAt: now, failure: undefined });
    }
    async claim(_id: string, revision: number, owner: string, expiresAt: string, now: string) {
        return !!this.patch(revision, { status: "running", lease: { owner, expiresAt }, updatedAt: now });
    }
    async renew() {
        return true;
    }
    async completeStep(_id: string, owner: string, step: string, now: string) {
        if (this.record?.lease?.owner !== owner) {
            return null;
        }
        return this.patch(this.record.revision, {
            completedSteps: [...this.record.completedSteps, step],
            updatedAt: now,
        });
    }
    async succeed(_id: string, owner: string, now: string) {
        return this.finish(owner, "succeeded", now);
    }
    async fail(_id: string, owner: string, failure: string, now: string) {
        return this.finish(owner, "failed", now, failure);
    }
    private finish(owner: string, status: "succeeded" | "failed", now: string, failure?: string) {
        if (this.record?.lease?.owner !== owner) {
            return false;
        }
        return !!this.patch(this.record.revision, { status, updatedAt: now, lease: undefined, failure });
    }
    private patch(revision: number, changes: Partial<InstanceTransitionRecord>) {
        if (!this.record || this.record.revision !== revision) {
            return null;
        }
        this.record = { ...this.record, ...changes, revision: revision + 1 };
        return this.record;
    }
}
