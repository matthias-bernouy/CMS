import type { ProviderCapabilityInvocationContext } from "../dispatch/registry";

export type ProviderOperationStatus = "queued" | "running" | "succeeded" | "failed";

export interface ProviderOperationRecord {
    readonly id: string;
    readonly siteId: string;
    readonly contractId: string;
    readonly capabilityId: string;
    readonly idempotencyKey: string;
    readonly inputDigest: string;
    readonly input: Readonly<Record<string, unknown>>;
    readonly context: ProviderCapabilityInvocationContext;
    readonly status: ProviderOperationStatus;
    readonly revision: number;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly result?: unknown;
    readonly errorCode?: string;
    readonly lease?: { readonly token: string; readonly expiresAt: string };
}

export interface ProviderOperationPage {
    readonly items: readonly ProviderOperationRecord[];
    readonly nextCursor?: string;
}

export interface ProviderOperationStore {
    createOrGet(record: ProviderOperationRecord): Promise<{ record: ProviderOperationRecord; created: boolean }>;
    get(siteId: string, id: string): Promise<ProviderOperationRecord | null>;
    list(siteId: string, contractId: string, cursor: string | undefined, limit: number): Promise<ProviderOperationPage>;
    listRecoverable(now: string, limit: number): Promise<readonly ProviderOperationRecord[]>;
    claim(id: string, expectedRevision: number, token: string, expiresAt: string, now: string): Promise<boolean>;
    renew(id: string, token: string, expiresAt: string, now: string): Promise<boolean>;
    succeed(id: string, token: string, result: unknown, now: string): Promise<boolean>;
    fail(id: string, token: string, errorCode: string, now: string): Promise<boolean>;
}

export interface ProviderOperationExecutionContext {
    readonly signal: AbortSignal;
    readonly leaseToken: string;
    throwIfLeaseLost(): void;
}

export type ProviderOperationHandler = (
    input: Readonly<Record<string, unknown>>,
    context: ProviderCapabilityInvocationContext,
    execution: ProviderOperationExecutionContext,
) => Promise<unknown>;
