import { createHash, randomUUID } from "node:crypto";
import { randomUUIDv7 } from "bun";
import { CoreCapabilityDispatchError, type CoreCapabilityInvocationContext } from "@bernouy/cms-content";
import { canonicalizeIJson } from "@bernouy/cms-repository/contracts/protocol";
import type { CoreOperationHandler, CoreOperationRecord, CoreOperationStore } from "./types";

const LEASE_MS = 30_000;
const RECOVERY_LIMIT = 100;

export class CoreOperationExecutor {
    readonly #handlers = new Map<string, CoreOperationHandler>();
    readonly #running = new Set<string>();

    constructor(
        readonly store: CoreOperationStore,
        private readonly now: () => Date = () => new Date(),
    ) {}

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
        const records = await this.store.listRecoverable(this.now().toISOString(), RECOVERY_LIMIT);
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
        if (!(await this.store.claim(record.id, record.revision, token, expiresAt(now), now.toISOString()))) {
            return;
        }
        const heartbeat = setInterval(() => {
            const current = this.now();
            void this.store.renew(record.id, token, expiresAt(current), current.toISOString());
        }, LEASE_MS / 3);
        try {
            const result = await handler(record.input, record.context);
            if (!(await this.store.succeed(record.id, token, result, this.now().toISOString()))) {
                throw new Error("Core operation lease was lost before completion");
            }
        } catch (error) {
            const code = error instanceof CoreCapabilityDispatchError ? error.code : "OPERATION_FAILED";
            await this.store.fail(record.id, token, code, this.now().toISOString());
        } finally {
            clearInterval(heartbeat);
        }
    }
}

function operationKey(contractId: string, capabilityId: string): string {
    return `${contractId}\0${capabilityId}`;
}

function digest(input: Readonly<Record<string, unknown>>): string {
    return `sha256:${createHash("sha256").update(canonicalizeIJson(input)).digest("hex")}`;
}

function expiresAt(now: Date): string {
    return new Date(now.getTime() + LEASE_MS).toISOString();
}
