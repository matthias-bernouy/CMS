import type {
    CreateProviderInstanceRecord,
    ProviderInstanceRecord,
    UpdateProviderInstanceRecord,
} from "hosting/instances/interfaces/types";

export interface ProviderInstanceRegistry {
    init(): Promise<void>;
    create(record: CreateProviderInstanceRecord): Promise<ProviderInstanceRecord>;
    get(instanceId: string): Promise<ProviderInstanceRecord | null>;
    /** Hosting election only. Preserve creation identity, callbacks, Repository bindings and secrets. */
    setPublicOrigin(instanceId: string, expectedRevision: number, origin: string): Promise<ProviderInstanceRecord>;
    getByIdempotencyKey(idempotencyKey: string): Promise<ProviderInstanceRecord | null>;
    page(input: { after: string | null; limit: number }): Promise<{
        items: readonly ProviderInstanceRecord[];
        nextCursor: string | null;
    }>;
    update(
        instanceId: string,
        expectedRevision: number,
        changes: UpdateProviderInstanceRecord,
    ): Promise<ProviderInstanceRecord>;
}
