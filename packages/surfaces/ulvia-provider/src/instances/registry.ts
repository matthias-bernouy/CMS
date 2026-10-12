import type { CreateProviderInstanceRecord, ProviderInstanceRecord, UpdateProviderInstanceRecord } from "./types";

export interface ProviderInstanceRegistry {
    init(): Promise<void>;
    create(record: CreateProviderInstanceRecord): Promise<ProviderInstanceRecord>;
    get(instanceId: string): Promise<ProviderInstanceRecord | null>;
    getByIdempotencyKey(idempotencyKey: string): Promise<ProviderInstanceRecord | null>;
    list(): Promise<readonly ProviderInstanceRecord[]>;
    update(
        instanceId: string,
        expectedRevision: number,
        changes: UpdateProviderInstanceRecord,
    ): Promise<ProviderInstanceRecord>;
}

export class ProviderInstanceRevisionConflictError extends Error {
    constructor(instanceId: string) {
        super(`Provider instance revision conflict: ${instanceId}`);
        this.name = "ProviderInstanceRevisionConflictError";
    }
}
