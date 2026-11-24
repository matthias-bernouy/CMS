import type { FormsRepository, SubmissionRecord } from "forms/interfaces/repository";
import type { FormsSubmissionEvents } from "forms/interfaces/services";
/** Delivery may retry after an uncertain response; Events deduplicates the stable submission receipt. */
export class SubmissionEventWorker {
    private stopped = false;
    private active?: Promise<number>;
    constructor(
        private readonly store: FormsRepository,
        private readonly events: FormsSubmissionEvents,
    ) {}
    tick(): Promise<number> {
        if (this.stopped) {
            return Promise.resolve(0);
        }
        return (this.active ??= this.process().finally(() => {
            this.active = undefined;
        }));
    }
    async stop() {
        this.stopped = true;
        await this.active;
    }
    private async process() {
        let count = 0;
        for (const record of await this.store.due(25)) {
            const intent = record.event;
            if (this.stopped) {
                break;
            }
            if (
                !intent?.dueAt ||
                Date.parse(intent.dueAt) > Date.now() ||
                record.deleted ||
                Date.parse(record.expiresAt) <= Date.now()
            ) {
                continue;
            }
            const token = crypto.randomUUID();
            const claimed: SubmissionRecord = {
                ...record,
                revision: record.revision + 1,
                event: {
                    ...intent,
                    state: "sending",
                    token,
                    attempts: intent.attempts + 1,
                    dueAt: new Date(Date.now() + 30000).toISOString(),
                },
            };
            if (!(await this.store.replace(claimed, record.revision))) {
                continue;
            }
            let accepted = false;
            try {
                await this.events.publish(claimed);
                accepted = true;
            } catch {
                /* Stable receipts make uncertain publication retryable. */
            }
            const current = await this.store.replay(record.receiptId);
            if (current && !current.deleted && current.event?.token === token) {
                await this.store.replace(
                    {
                        ...current,
                        revision: current.revision + 1,
                        event: {
                            ...current.event,
                            state: accepted ? "accepted" : "pending",
                            token: null,
                            dueAt: accepted
                                ? null
                                : new Date(Date.now() + Math.min(300000, 5000 * current.event.attempts)).toISOString(),
                        },
                    },
                    current.revision,
                );
            }
            count++;
        }
        return count;
    }
}
