import type {
    DeliveryPayload,
    DeliverySubscription,
    DurableDeliveryIntent,
    DurableEventRecord,
    DurableEventStore,
    DurableDeliveryPolicy,
} from "./interfaces";
/** One fenced attempt owns delivery; receivers commit their inbox before acknowledging. */
export class DurableDeliveryWorker<C extends DeliveryPayload, S extends DeliverySubscription, E> {
    constructor(
        private readonly options: {
            readonly siteId: string;
            readonly events: DurableEventStore<C, S>;
            readonly policy: DurableDeliveryPolicy;
            readonly now: () => number;
            readonly active: (subscription: S) => Promise<boolean>;
            readonly authorize: (subscription: S) => Promise<boolean>;
            readonly envelope: (record: DurableEventRecord<C, S>, intent: DurableDeliveryIntent<S>) => E;
            readonly validateReceipt: (receipt: unknown, deliveryId: string) => unknown;
            readonly send: (subscription: S, event: E, signal: AbortSignal) => Promise<unknown>;
            readonly onFailure?: (metadata: {
                eventId: string;
                deliveryId: string;
                subscriptionId: string;
                failureCode: string;
            }) => void;
        },
    ) {}
    async runOne(): Promise<boolean> {
        const token = crypto.randomUUID();
        const now = this.options.now();
        const record = await this.options.events.claim(
            this.options.siteId,
            now,
            token,
            now + this.options.policy.leaseMs,
        );
        if (!record) {
            return false;
        }
        const intent = record.deliveries.find((item) => item.state === "pending" && item.dueAt <= now);
        if (!intent) {
            throw new TypeError("Claimed event has no due delivery");
        }
        const abort = new AbortController();
        let renewal = Promise.resolve();
        const timer = setInterval(
            () => {
                renewal = renewal.then(async () => {
                    try {
                        const now = this.options.now();
                        if (
                            !(await this.options.events.renew(
                                record.siteId,
                                record.id,
                                token,
                                now,
                                now + this.options.policy.leaseMs,
                            ))
                        ) {
                            abort.abort(new Error("Event delivery lease was lost"));
                        }
                    } catch (error) {
                        abort.abort(error);
                    }
                });
            },
            Math.max(1, Math.floor(this.options.policy.leaseMs / 3)),
        );
        try {
            const next = await this.deliver(record, intent, abort.signal);
            if (!abort.signal.aborted) {
                const stored = await this.options.events.finish(
                    record.siteId,
                    record.id,
                    token,
                    this.options.now(),
                    next,
                );
                if (stored && next.state === "failed") {
                    this.options.onFailure?.({
                        eventId: record.id,
                        deliveryId: next.id,
                        subscriptionId: next.subscription.id,
                        failureCode: next.failureCode ?? "DELIVERY_FAILED",
                    });
                }
            }
        } finally {
            clearInterval(timer);
            await renewal;
        }
        return true;
    }
    private async deliver(
        record: DurableEventRecord<C, S>,
        intent: DurableDeliveryIntent<S>,
        signal: AbortSignal,
    ): Promise<DurableDeliveryIntent<S>> {
        if (
            record.expiresAt <= this.options.now() ||
            (this.options.policy.maxAttempts !== null && intent.attempts > this.options.policy.maxAttempts)
        ) {
            return {
                ...intent,
                state: "failed",
                failureCode: record.expiresAt <= this.options.now() ? "DELIVERY_EXPIRED" : "DELIVERY_EXHAUSTED",
            };
        }
        try {
            if (!(await this.options.active(intent.subscription))) {
                return { ...intent, state: "cancelled" };
            }
            // Updates never redirect old deliveries or replace their exact admitted target.
            if (!(await this.options.authorize(intent.subscription))) {
                return { ...intent, state: "failed", failureCode: "DELIVERY_FORBIDDEN" };
            }
            if (signal.aborted) {
                throw signal.reason;
            }
            const event = this.options.envelope(record, intent);
            const receipt = await this.options.send(intent.subscription, event, signal);
            this.options.validateReceipt(receipt, intent.id);
            return { ...intent, state: "delivered", attempts: intent.attempts };
        } catch {
            const attempts = intent.attempts;
            return {
                ...intent,
                attempts,
                dueAt: Math.min(
                    record.expiresAt,
                    this.options.now() +
                        (this.options.policy.maxRetryMs === undefined
                            ? this.options.policy.retryMs
                            : Math.min(
                                  this.options.policy.maxRetryMs,
                                  this.options.policy.retryMs * 2 ** Math.min(30, Math.max(0, attempts - 1)),
                              )),
                ),
                ...(this.options.policy.maxAttempts !== null && attempts >= this.options.policy.maxAttempts
                    ? { state: "failed", failureCode: "DELIVERY_EXHAUSTED" }
                    : {}),
            };
        }
    }
}
