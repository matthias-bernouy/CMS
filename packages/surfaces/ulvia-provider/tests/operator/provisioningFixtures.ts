import { expect } from "bun:test";
import { OfficialInstanceProvisioner } from "../../src/exports/index";
import type {
    CreateProviderInstanceRecord,
    InstanceTransitionRecord,
    InstanceTransitionStore,
    OfficialInstanceProvisioningTarget,
    ProviderInstanceRecord,
    ProviderInstanceRegistry,
    UpdateProviderInstanceRecord,
} from "../../src/exports/index";
export const SYSTEM_PLAN = Object.freeze({
    manifest: Object.freeze({
        providerId: "ulvia/primary-provider",
        version: "1.0.0",
        digest: `sha256:${"a".repeat(64)}`,
    }),
    contracts: Object.freeze([
        Object.freeze({ contractId: "ulvia/cms.content", version: "1.0.0", digest: `sha256:${"b".repeat(64)}` }),
    ]),
});

export function createProvisioner(
    registry: MemoryRegistry,
    transitions: MemoryTransitions,
    calls: string[],
    initializeSetup: () => Promise<void> = async () => void calls.push("initialization"),
) {
    return new OfficialInstanceProvisioner(
        registry,
        transitions,
        async () => target(calls, initializeSetup),
        administratorCredentials(),
    );
}

export function administratorCredentials(clear: () => Promise<void> = async () => undefined) {
    return {
        read: async () => ({ email: "admin@example.test", password: "secret" }),
        clear,
    };
}

export function target(calls: string[], initializeSetup: () => Promise<void>): OfficialInstanceProvisioningTarget {
    return {
        importManifest: async () => void calls.push("manifest"),
        connectProvider: async () => void calls.push("provider"),
        selectContracts: async () => void calls.push("contracts"),
        initializeSetup,
        initializeAdministrator: async () => void calls.push("administrator"),
    };
}

export function instance(status: ProviderInstanceRecord["status"] = "provisioning") {
    return {
        id: "instance:one",
        idempotencyKey: "create-one",
        idempotencyFingerprint: "fingerprint",
        storageKey: "one",
        cmsUrl: "http://127.0.0.1:5100",
        gatewayUrl: "http://edge.internal:3000",
        label: "One",
        status,
        systemPlan: SYSTEM_PLAN,
        revision: 1,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
    } satisfies ProviderInstanceRecord;
}

export class MemoryRegistry implements ProviderInstanceRegistry {
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

export class MemoryTransitions implements InstanceTransitionStore {
    record: InstanceTransitionRecord | null = null;
    renewResult = true;
    allowFinish = true;
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
    async requeue(_id: string, revision: number, now: string, administratorSub?: string, sourceRevision?: number) {
        return this.patch(revision, {
            status: "queued",
            updatedAt: now,
            failure: undefined,
            ...(administratorSub ? { administratorSub, sourceRevision } : {}),
        });
    }
    async claim(_id: string, revision: number, owner: string, expiresAt: string, now: string) {
        return !!this.patch(revision, { status: "running", lease: { owner, expiresAt }, updatedAt: now });
    }
    async renew() {
        return this.renewResult;
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
        if (!this.allowFinish || this.record?.lease?.owner !== owner) {
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
