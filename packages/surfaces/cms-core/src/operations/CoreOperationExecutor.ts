import { createHash, randomUUID } from "node:crypto";
import { randomUUIDv7 } from "bun";
import { canonicalizeIJson } from "@bernouy/cms-repository/contracts/protocol";
import { CoreCapabilityDispatchError, type CoreCapabilityInvocationContext } from "../dispatch/registry";
import type { CoreOperationHandler, CoreOperationRecord, CoreOperationStore } from "./types";
import { CoreOperationLeaseLostError, expiresAt, operationExecution, waitForLeaseRenewal } from "./lease";

const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_RECOVERY_LIMIT = 100;

export type CoreOperationExecutorOptions = Readonly<{
    leaseMs?: number;
    recoveryLimit?: number;
}>;

export class CoreOperationExecutor {
    readonly #handlers = new Map<string, CoreOperationHandler>();
    readonly #running = new Set<string>();

    constructor(
        readonly store: CoreOperationStore,
        private readonly now: () => Date = () => new Date(),
        private readonly options: CoreOperationExecutorOptions = {},
    ) {
        if (this.leaseMs < 3) {
            throw new TypeError("Core operation lease duration must be at least 3 milliseconds.");
        }
    }

    private get leaseMs(): number {
        return this.options.leaseMs ?? DEFAULT_LEASE_MS;
    }

    register(contractId: string, capabilityId: string, handler: CoreOperationHandler): void {
        const key = operationKey(contractId, capabilityId);
        if (this.#handlers.has(key)) {
            throw new Error(`Core operation is already registered: ${contractId}/${capabilityId}`);
        }
        this.#handlers.set(key, handler);
    }

    async enqueue(
        contractId: string,
        capabilityId: string,
        input: Readonly<Record<string, unknown>>,
        context: CoreCapabilityInvocationContext,
    ): Promise<{ operationId: string }> {
        if (!context.idempotencyKey) {
            throw new CoreCapabilityDispatchError("IDEMPOTENCY_KEY_REQUIRED", 422);
        }
        const now = this.now().toISOString();
        const candidate: CoreOperationRecord = {
            id: randomUUIDv7(),
            siteId: context.siteId,
            contractId,
            capabilityId,
            idempotencyKey: context.idempotencyKey,
            inputDigest: digest(input),
            input: structuredClone(input),
            context: structuredClone(context),
            status: "queued",
            revision: 1,
            createdAt: now,
            updatedAt: now,
        };
        const stored = await this.store.createOrGet(candidate);
        if (stored.record.inputDigest !== candidate.inputDigest) {
            throw new CoreCapabilityDispatchError("IDEMPOTENCY_CONFLICT", 409);
        }
        this.#schedule(stored.record);
        return { operationId: stored.record.id };
    }

    async recover(): Promise<void> {
        const records = await this.store.listRecoverable(
            this.now().toISOString(),
            this.options.recoveryLimit ?? DEFAULT_RECOVERY_LIMIT,
        );
        for (const record of records) {
            this.#schedule(record);
        }
    }

    #schedule(record: CoreOperationRecord): void {
        if (this.#running.has(record.id) || record.status === "succeeded" || record.status === "failed") {
            return;
        }
        this.#running.add(record.id);
        queueMicrotask(() => void this.#run(record).finally(() => this.#running.delete(record.id)));
    }

    async #run(record: CoreOperationRecord): Promise<void> {
        const handler = this.#handlers.get(operationKey(record.contractId, record.capabilityId));
        if (!handler) {
            return;
        }
        const token = randomUUID();
        const now = this.now();
        if (
            !(await this.store.claim(
                record.id,
                record.revision,
                token,
                expiresAt(now, this.leaseMs),
                now.toISOString(),
            ))
        ) {
            return;
        }
        const executionAbort = new AbortController();
        const heartbeatAbort = new AbortController();
        const execution = operationExecution(token, executionAbort.signal);
        const heartbeat = this.#maintainLease(record.id, token, executionAbort, heartbeatAbort.signal);
        try {
            execution.throwIfLeaseLost();
            const result = await handler(record.input, record.context, execution);
            execution.throwIfLeaseLost();
            if (!(await this.store.succeed(record.id, token, result, this.now().toISOString()))) {
                executionAbort.abort(new CoreOperationLeaseLostError());
                return;
            }
        } catch (error) {
            if (executionAbort.signal.aborted) {
                return;
            }
            const code = error instanceof CoreCapabilityDispatchError ? error.code : "OPERATION_FAILED";
            await this.store.fail(record.id, token, code, this.now().toISOString());
        } finally {
            heartbeatAbort.abort();
            await heartbeat;
        }
    }

    async #maintainLease(
        operationId: string,
        token: string,
        executionAbort: AbortController,
        signal: AbortSignal,
    ): Promise<void> {
        while (!(await waitForLeaseRenewal(this.leaseMs / 3, signal))) {
            const current = this.now();
            try {
                const renewed = await this.store.renew(
                    operationId,
                    token,
                    expiresAt(current, this.leaseMs),
                    current.toISOString(),
                );
                if (!renewed) {
                    executionAbort.abort(new CoreOperationLeaseLostError());
                    return;
                }
            } catch (error) {
                executionAbort.abort(error);
                return;
            }
        }
    }
}

function operationKey(contractId: string, capabilityId: string): string {
    return `${contractId}\0${capabilityId}`;
}

function digest(input: Readonly<Record<string, unknown>>): string {
    return `sha256:${createHash("sha256").update(canonicalizeIJson(input)).digest("hex")}`;
}
