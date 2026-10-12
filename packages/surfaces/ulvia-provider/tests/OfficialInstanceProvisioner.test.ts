import { describe, expect, test } from "bun:test";
import {
    OFFICIAL_INSTANCE_PROFILE,
    OfficialInstanceProvisioner,
    type CreateProviderInstanceRecord,
    type OfficialInstanceProvisioningTarget,
    type ProviderInstanceRecord,
    type ProviderInstanceRegistry,
    type UpdateProviderInstanceRecord,
} from "../src";

describe("OfficialInstanceProvisioner", () => {
    test("runs the exact profile once and records every completed step", async () => {
        const registry = new MemoryRegistry(instance());
        const calls: string[] = [];
        const provisioner = new OfficialInstanceProvisioner(registry, async () => target(calls));

        const provisioned = await provisioner.provision("instance:one", {
            email: "admin@example.test",
            password: "not-persisted",
        });
        expect(provisioned.status).toBe("ready");
        expect(provisioned.completedSteps).toEqual([
            "manifest",
            "provider",
            "contracts",
            "collection",
            "administrator",
        ]);
        expect(calls).toEqual([...provisioned.completedSteps]);

        await provisioner.provision("instance:one", { email: "ignored@example.test", password: "ignored" });
        expect(calls).toHaveLength(5);
    });

    test("resumes after the last durable step without replaying completed work", async () => {
        const registry = new MemoryRegistry(instance());
        let fails = true;
        const calls: string[] = [];
        const provisioner = new OfficialInstanceProvisioner(registry, async () => ({
            ...target(calls),
            async installCollection() {
                calls.push("collection");
                if (fails) {
                    fails = false;
                    throw new Error("repository unavailable");
                }
            },
        }));

        await expect(
            provisioner.provision("instance:one", { email: "admin@example.test", password: "secret" }),
        ).rejects.toThrow("repository unavailable");
        expect((await registry.get("instance:one"))?.status).toBe("failed");

        await provisioner.provision("instance:one", { email: "admin@example.test", password: "secret" });
        expect(calls.filter((step) => step === "manifest")).toHaveLength(1);
        expect(calls.filter((step) => step === "collection")).toHaveLength(2);
    });
});

function target(calls: string[]): OfficialInstanceProvisioningTarget {
    return {
        importManifest: async () => void calls.push("manifest"),
        connectProvider: async () => void calls.push("provider"),
        selectContracts: async () => void calls.push("contracts"),
        installCollection: async () => void calls.push("collection"),
        initializeAdministrator: async () => void calls.push("administrator"),
    };
}

function instance(): ProviderInstanceRecord {
    return {
        id: "instance:one",
        idempotencyKey: "create-one",
        storageKey: "one",
        label: "One",
        status: "provisioning",
        profile: { id: OFFICIAL_INSTANCE_PROFILE.id, version: OFFICIAL_INSTANCE_PROFILE.version },
        completedSteps: [],
        revision: 1,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
    };
}

class MemoryRegistry implements ProviderInstanceRegistry {
    constructor(private record: ProviderInstanceRecord) {}
    async init(): Promise<void> {}
    async create(_record: CreateProviderInstanceRecord): Promise<ProviderInstanceRecord> {
        return this.record;
    }
    async get(instanceId: string): Promise<ProviderInstanceRecord | null> {
        return instanceId === this.record.id ? this.record : null;
    }
    async getByIdempotencyKey(): Promise<ProviderInstanceRecord | null> {
        return null;
    }
    async list(): Promise<readonly ProviderInstanceRecord[]> {
        return [this.record];
    }
    async update(
        _instanceId: string,
        expectedRevision: number,
        changes: UpdateProviderInstanceRecord,
    ): Promise<ProviderInstanceRecord> {
        expect(expectedRevision).toBe(this.record.revision);
        const { failure: _failure, ...current } = this.record;
        const { failure, ...persistedChanges } = changes;
        this.record = {
            ...current,
            ...persistedChanges,
            ...(failure === null ? {} : failure ? { failure } : {}),
            revision: this.record.revision + 1,
            updatedAt: new Date(this.record.revision).toISOString(),
        };
        return this.record;
    }
}
