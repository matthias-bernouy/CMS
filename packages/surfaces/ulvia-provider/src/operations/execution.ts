import { randomUUID } from "node:crypto";
import { ProviderCapabilityDispatchError } from "../dispatch/registry";
import type { ProviderOperationHandler, ProviderOperationRecord, ProviderOperationStore } from "./types";
import { ProviderOperationLeaseLostError, expiresAt, operationExecution, waitForLeaseRenewal } from "./lease";

export type ProviderOperationFailureObservation = Readonly<{
    operationId: string;
    contractId: string;
    capabilityId: string;
    requestId: string;
    errorCode: string;
    kind: "executor-failed" | "handler-failed" | "handler-rejected" | "handler-unavailable" | "lease-lost";
    durationMs: number;
}>;

export type ProviderOperationExecutionOptions = Readonly<{
    leaseMs: number;
    now: () => Date;
    onFailure?: (observation: ProviderOperationFailureObservation, error?: unknown) => void;
}>;

export async function runProviderOperation(
    store: ProviderOperationStore,
    record: ProviderOperationRecord,
    handler: ProviderOperationHandler | undefined,
    options: ProviderOperationExecutionOptions,
): Promise<void> {
    const token = randomUUID();
    const now = options.now();
    if (!(await store.claim(record.id, record.revision, token, expiresAt(now, options.leaseMs), now.toISOString()))) {
        return;
    }
    if (!handler) {
        reportFailure(options, record, "handler-unavailable", "OPERATION_HANDLER_UNAVAILABLE", 0);
        await store.fail(record.id, token, "OPERATION_HANDLER_UNAVAILABLE", options.now().toISOString());
        return;
    }
    const startedAt = performance.now();
    const executionAbort = new AbortController();
    const heartbeatAbort = new AbortController();
    const execution = operationExecution(token, executionAbort.signal);
    const heartbeat = maintainLease(store, record.id, token, executionAbort, heartbeatAbort.signal, options);
    try {
        execution.throwIfLeaseLost();
        const result = await handler(record.input, record.context, execution);
        execution.throwIfLeaseLost();
        if (!(await store.succeed(record.id, token, result, options.now().toISOString()))) {
            const error = new ProviderOperationLeaseLostError();
            executionAbort.abort(error);
            reportFailure(options, record, "lease-lost", "OPERATION_LEASE_LOST", performance.now() - startedAt, error);
        }
    } catch (error) {
        if (executionAbort.signal.aborted) {
            reportFailure(
                options,
                record,
                "lease-lost",
                "OPERATION_LEASE_LOST",
                performance.now() - startedAt,
                executionAbort.signal.reason,
            );
            return;
        }
        const code = error instanceof ProviderCapabilityDispatchError ? error.code : "OPERATION_FAILED";
        if (error instanceof ProviderCapabilityDispatchError) {
            reportFailure(options, record, "handler-rejected", code, performance.now() - startedAt);
        } else {
            reportFailure(options, record, "handler-failed", code, performance.now() - startedAt, error);
        }
        await store.fail(record.id, token, code, options.now().toISOString());
    } finally {
        heartbeatAbort.abort();
        await heartbeat;
    }
}

async function maintainLease(
    store: ProviderOperationStore,
    operationId: string,
    token: string,
    executionAbort: AbortController,
    signal: AbortSignal,
    options: ProviderOperationExecutionOptions,
): Promise<void> {
    while (!(await waitForLeaseRenewal(options.leaseMs / 3, signal))) {
        const current = options.now();
        try {
            const renewed = await store.renew(
                operationId,
                token,
                expiresAt(current, options.leaseMs),
                current.toISOString(),
            );
            if (!renewed) {
                executionAbort.abort(new ProviderOperationLeaseLostError());
                return;
            }
        } catch (error) {
            executionAbort.abort(error);
            return;
        }
    }
}

export function reportFailure(
    options: Pick<ProviderOperationExecutionOptions, "onFailure">,
    record: ProviderOperationRecord,
    kind: ProviderOperationFailureObservation["kind"],
    errorCode: string,
    durationMs: number,
    error?: unknown,
): void {
    try {
        options.onFailure?.(
            {
                operationId: record.id,
                contractId: record.contractId,
                capabilityId: record.capabilityId,
                requestId: record.context.requestId,
                errorCode,
                kind,
                durationMs: Math.round(durationMs * 100) / 100,
            },
            error,
        );
    } catch {
        // Diagnostics must not change operation persistence or recovery.
    }
}
