import type { CoreCapabilityInvocationContext } from "../dispatch/registry";

export type CoreOperationStatus = "queued" | "running" | "succeeded" | "failed";

export interface CoreOperationRecord {
    readonly id: string;
    readonly siteId: string;
    readonly contractId: string;
    readonly capabilityId: string;
    readonly idempotencyKey: string;
    readonly inputDigest: string;
    readonly input: Readonly<Record<string, unknown>>;
    readonly context: CoreCapabilityInvocationContext;
    readonly status: CoreOperationStatus;
    readonly revision: number;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly result?: unknown;
    readonly errorCode?: string;
    readonly lease?: { readonly token: string; readonly expiresAt: string };
}

export interface CoreOperationPage {
    readonly items: readonly CoreOperationRecord[];
    readonly nextCursor?: string;
}

export interface CoreOperationStore {
    createOrGet(record: CoreOperationRecord): Promise<{ record: CoreOperationRecord; created: boolean }>;
    get(siteId: string, id: string): Promise<CoreOperationRecord | null>;
    list(siteId: string, cursor: string | undefined, limit: number): Promise<CoreOperationPage>;
    listRecoverable(now: string, limit: number): Promise<readonly CoreOperationRecord[]>;
    claim(id: string, expectedRevision: number, token: string, expiresAt: string, now: string): Promise<boolean>;
    renew(id: string, token: string, expiresAt: string, now: string): Promise<boolean>;
    succeed(id: string, token: string, result: unknown, now: string): Promise<boolean>;
    fail(id: string, token: string, errorCode: string, now: string): Promise<boolean>;
}

export interface CoreOperationExecutionContext {
    readonly signal: AbortSignal;
    readonly leaseToken: string;
    throwIfLeaseLost(): void;
}

export type CoreOperationHandler = (
    input: Readonly<Record<string, unknown>>,
    context: CoreCapabilityInvocationContext,
    execution: CoreOperationExecutionContext,
) => Promise<unknown>;
