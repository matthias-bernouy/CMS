import { canonicalizeIJson, parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
export interface DomainEventPublication {
    readonly contractId: string;
    readonly eventType: string;
    readonly occurrenceId: string;
    readonly payloadJson: string;
    readonly causeDeliveryId?: string;
    readonly initiatorProof?: string;
}
export interface PendingDomainEvent {
    readonly key: string;
    readonly publication: DomainEventPublication;
    readonly attempts: number;
}
/** Hosts persist this intent with their own business mutation, encrypt values and fence all lease mutations. */
export interface DomainEventOutbox {
    enqueue(key: string, publication: DomainEventPublication): Promise<void>;
    claim(now: number, token: string, expiresAt: number): Promise<PendingDomainEvent | null>;
    complete(key: string, token: string): Promise<boolean>;
    retry(key: string, token: string, dueAt: number, failureCode: string): Promise<boolean>;
}
export class DomainEventPublicationFailure extends Error {
    constructor(
        readonly code: string,
        readonly retryable: boolean,
    ) {
        super("The event publication was refused.");
    }
}
/** No in-memory fallback: publication confirmation follows the recipient's durable receipt. */
export function createDomainEventPublisher(options: {
    readonly store: DomainEventOutbox;
    readonly capture?: (input: {
        contractId: string;
        eventType: string;
        occurrenceId: string;
    }) => Promise<{ proof: string }>;
    readonly publish: (
        publication: DomainEventPublication,
    ) => Promise<{ readonly accepted: boolean; readonly occurrenceId: string }>;
    readonly now: () => number;
    readonly policy: { readonly leaseMs: number; readonly retryMs: number; readonly maxAttempts: number };
}) {
    const { store, policy } = options;
    if (
        ![policy.leaseMs, policy.retryMs, policy.maxAttempts].every((value) => Number.isSafeInteger(value) && value > 0)
    ) {
        throw new TypeError("Invalid producer policy");
    }
    return {
        async capture(input: { contractId: string; eventType: string; occurrenceId: string }) {
            if (!options.capture) {
                throw new TypeError("The host must provide a verified initiator capture port");
            }
            const { proof } = await options.capture(input);
            if (typeof proof !== "string" || !proof.length || proof.length > 2048) {
                throw new TypeError("Invalid initiator proof");
            }
            return proof;
        },
        async enqueue(key: string, publication: DomainEventPublication) {
            if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(key)) {
                throw new TypeError("Invalid producer key");
            }
            if (
                publication.initiatorProof !== undefined &&
                (typeof publication.initiatorProof !== "string" ||
                    !publication.initiatorProof.length ||
                    publication.initiatorProof.length > 2048 ||
                    publication.causeDeliveryId !== undefined)
            ) {
                throw new TypeError("Invalid initiator proof");
            }
            const payload = parseStrictJson(new TextEncoder().encode(publication.payloadJson), 1048576, 32);
            await store.enqueue(key, { ...publication, payloadJson: canonicalizeIJson(payload) });
        },
        async flushOne() {
            const token = crypto.randomUUID();
            const pending = await store.claim(options.now(), token, options.now() + policy.leaseMs);
            if (!pending) {
                return false;
            }
            if (pending.attempts > policy.maxAttempts) {
                await store.retry(pending.key, token, Number.MAX_SAFE_INTEGER, "RETRY_EXHAUSTED");
                return true;
            }
            try {
                const receipt = await options.publish(pending.publication);
                if (receipt.accepted !== true || !/^[a-f0-9]{64}$/u.test(receipt.occurrenceId)) {
                    throw new TypeError("Invalid publication receipt");
                }
                await store.complete(pending.key, token);
            } catch (error) {
                const permanent = error instanceof DomainEventPublicationFailure && !error.retryable;
                const code =
                    error instanceof DomainEventPublicationFailure && /^[A-Z][A-Z0-9_]{0,63}$/u.test(error.code)
                        ? error.code
                        : "PUBLICATION_UNAVAILABLE";
                await store.retry(
                    pending.key,
                    token,
                    permanent || pending.attempts >= policy.maxAttempts
                        ? Number.MAX_SAFE_INTEGER
                        : options.now() + policy.retryMs,
                    code,
                );
            }
            return true;
        },
    };
}
