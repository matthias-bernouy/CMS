import type { ProviderInstanceRecord, UpdateProviderInstanceRecord } from "@bernouy/ulvia-provider";
import { createRepositorySettings } from "../../../../src/runtime/instances/composition/repositorySettings";
export function repositorySettingsFixture() {
    let instance: ProviderInstanceRecord = {
        id: "instance:one",
        idempotencyKey: "one",
        idempotencyFingerprint: "one",
        storageKey: "one",
        cmsUrl: "https://site.example",
        gatewayUrl: "http://edge.private:3000",
        label: "One",
        status: "ready",
        revision: 1,
        createdAt: "2026-11-08T00:00:00Z",
        updatedAt: "2026-11-08T00:00:00Z",
    };
    let writes = 0;
    const calls: unknown[] = [];
    const update = async (id: string, revision: number, changes: UpdateProviderInstanceRecord) => {
        if (id !== instance.id || revision !== instance.revision) {
            throw new Error("CAS conflict");
        }
        const { failure: _failure, ...patch } = changes;
        writes++;
        instance = { ...instance, ...patch, revision: instance.revision + 1 };
        return instance;
    };
    const service = createRepositorySettings({
        instanceId: instance.id,
        instances: { get: async (id) => (id === instance.id ? structuredClone(instance) : null), update },
        enabled: async () => false,
        creation: async () => ({ status: "none" }),
        create: async (current, expectedRevision, administratorId) => {
            calls.push({ current, expectedRevision, administratorId });
            return update(current.id, expectedRevision, { repository: { url: current.cmsUrl, configured: true } });
        },
    });
    return { service, current: () => instance, writes: () => writes, calls };
}
