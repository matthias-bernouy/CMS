import { createHash } from "node:crypto";
import { randomUUIDv7 } from "bun";
import { canonicalizeIJson } from "@bernouy/cms-repository/contracts/protocol";
import { ProviderCapabilityDispatchError, type ProviderCapabilityInvocationContext } from "../dispatch/registry";
import type { ProviderOperationHandler, ProviderOperationRecord, ProviderOperationStore } from "./types";
import { reportFailure, runProviderOperation, type ProviderOperationFailureObservation } from "./execution";

export type { ProviderOperationFailureObservation } from "./execution";

const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_RECOVERY_LIMIT = 100;

export type ProviderOperationExecutorOptions = Readonly<{
    leaseMs?: number;
    recoveryLimit?: number;
    retainResource?: () => () => void;
    onFailure?: (observation: ProviderOperationFailureObservation, error?: unknown) => void;
}>;

export class ProviderOperationExecutor {
    readonly #handlers = new Map<string, ProviderOperationHandler>();
    readonly #running = new Map<string, Promise<void>>();
    #stopping = false;

    constructor(
        readonly store: ProviderOperationStore,
        private readonly now: () => Date = () => new Date(),
        private readonly options: ProviderOperationExecutorOptions = {},
    ) {
        if (this.leaseMs < 3) {
            throw new TypeError("Provider operation lease duration must be at least 3 milliseconds.");
        }
    }

    private get leaseMs(): number {
        return this.options.leaseMs ?? DEFAULT_LEASE_MS;
    }

    register(contractId: string, capabilityId: string, handler: ProviderOperationHandler): void {
        const key = operationKey(contractId, capabilityId);
        if (this.#handlers.has(key)) {
            throw new Error(`Provider operation is already registered: ${contractId}/${capabilityId}`);
        }
        this.#handlers.set(key, handler);
    }

    async enqueue(
        contractId: string,
        capabilityId: string,
        input: Readonly<Record<string, unknown>>,
        context: ProviderCapabilityInvocationContext,
    ): Promise<{ operationId: string }> {
        if (this.#stopping) {
            throw new ProviderCapabilityDispatchError("PROVIDER_SHUTTING_DOWN", 503);
        }
        if (!context.idempotencyKey) {
            throw new ProviderCapabilityDispatchError("IDEMPOTENCY_KEY_REQUIRED", 422);
        }
        const now = this.now().toISOString();
        const candidate: ProviderOperationRecord = {
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
            throw new ProviderCapabilityDispatchError("IDEMPOTENCY_CONFLICT", 409);
        }
        void this.#execute(stored.record).catch(() => undefined);
        return { operationId: stored.record.id };
    }

    async recover(limit = this.options.recoveryLimit ?? DEFAULT_RECOVERY_LIMIT): Promise<number> {
        if (this.#stopping) {
            return 0;
        }
        const records = await this.store.listRecoverable(this.now().toISOString(), limit);
        if (this.#stopping) {
            return 0;
        }
        await Promise.all(records.map((record) => this.#execute(record)));
        return records.length;
    }

    async stop(): Promise<void> {
        this.#stopping = true;
        while (this.#running.size > 0) {
            await Promise.allSettled([...this.#running.values()]);
        }
    }

    #execute(record: ProviderOperationRecord): Promise<void> {
        const active = this.#running.get(record.id);
        if (active) {
            return active;
        }
        if (this.#stopping || record.status === "succeeded" || record.status === "failed") {
            return Promise.resolve();
        }
        const running = this.#executeRetained(record)
            .catch((error) => {
                reportFailure(this.options, record, "executor-failed", "OPERATION_EXECUTOR_FAILED", 0, error);
                throw error;
            })
            .finally(() => {
                if (this.#running.get(record.id) === running) {
                    this.#running.delete(record.id);
                }
            });
        this.#running.set(record.id, running);
        return running;
    }

    async #executeRetained(record: ProviderOperationRecord): Promise<void> {
        const release = this.options.retainResource?.();
        try {
            await runProviderOperation(
                this.store,
                record,
                this.#handlers.get(operationKey(record.contractId, record.capabilityId)),
                { leaseMs: this.leaseMs, now: this.now, onFailure: this.options.onFailure },
            );
        } finally {
            release?.();
        }
    }
}

function operationKey(contractId: string, capabilityId: string): string {
    return `${contractId}\0${capabilityId}`;
}

function digest(input: Readonly<Record<string, unknown>>): string {
    return `sha256:${createHash("sha256").update(canonicalizeIJson(input)).digest("hex")}`;
}
