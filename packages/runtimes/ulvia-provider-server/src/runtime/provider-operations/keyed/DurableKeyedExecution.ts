import { createHash } from "node:crypto";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { ProviderCapabilityDispatchError } from "@bernouy/cms-gateway/provider/server";
import type { KeyedExecution } from "@bernouy/ulvia-sdk/provider";
import type { KeyedOutcome, KeyedReceiptStore } from "./interfaces";

/** Durable synchronous JSON commands. Uncertain SMTP delivery is never automatically retried. */
export class DurableKeyedExecution {
    private active = 0;

    constructor(
        private readonly store: KeyedReceiptStore,
        private readonly scope: Readonly<{ providerId: string; siteId: string; instanceId: string }>,
        private readonly retain: () => () => void,
    ) {}

    readonly execute = async (invocation: KeyedExecution, execute: () => Promise<unknown>): Promise<unknown> => {
        const { context, input, key, providerId, instanceId, siteId, contractId, version, capabilityId } = invocation;
        if (
            providerId !== this.scope.providerId ||
            siteId !== this.scope.siteId ||
            instanceId !== this.scope.instanceId ||
            context.providerId !== providerId ||
            context.siteId !== siteId ||
            context.invocation?.instanceId !== instanceId
        ) {
            throw new TypeError("Keyed execution crossed its authenticated instance scope");
        }
        if (typeof key !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(key)) {
            throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
        }
        if (this.active >= 128) {
            throw unavailable();
        }
        const id = digest({ providerId, instanceId, siteId, contractId, version, capabilityId, key });
        // Authentication is rechecked before every replay; another actor cannot borrow a receipt.
        const fingerprint = digest({
            input,
            principal: {
                actorKind: context.actorKind ?? null,
                subjectId: context.subjectId ?? null,
                systemServiceId: context.systemServiceId ?? null,
                sourceInstallationId: context.sourceInstallationId ?? null,
                connectionId: context.connectionId ?? null,
            },
        });
        const release = this.retain();
        this.active++;
        try {
            const { created, receipt } = await this.store.claim(id, fingerprint);
            if (receipt.id !== id || receipt.fingerprint !== fingerprint) {
                throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
            }
            if (!created) {
                if (receipt.state !== "complete" || !receipt.outcome) {
                    throw unavailable();
                }
                return replay(receipt.outcome);
            }
            let outcome: KeyedOutcome;
            try {
                outcome = { kind: "success", output: await execute() };
                if (Buffer.byteLength(canonicalizeIJson(outcome)) > 16_384) {
                    throw new TypeError("Keyed command output exceeds its receipt bound");
                }
            } catch (error) {
                outcome =
                    error instanceof ProviderCapabilityDispatchError
                        ? { kind: "error", code: error.code, status: error.status }
                        : { kind: "error", code: "CORE_UNAVAILABLE", status: 503 };
            }
            await this.store.complete(id, fingerprint, outcome);
            return replay(outcome);
        } finally {
            this.active--;
            release();
        }
    };
}

function digest(value: unknown): string {
    return createHash("sha256").update("ulvia-keyed-command/v1\0").update(canonicalizeIJson(value)).digest("hex");
}

function replay(outcome: KeyedOutcome): unknown {
    if (outcome.kind === "error") {
        throw new ProviderCapabilityDispatchError(outcome.code, outcome.status);
    }
    return structuredClone(outcome.output);
}

function unavailable(): ProviderCapabilityDispatchError {
    return new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503);
}
