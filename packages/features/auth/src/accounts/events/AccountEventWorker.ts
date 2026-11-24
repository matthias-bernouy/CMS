import type { AccountEventStore, AccountEventPublisher, AccountEventType } from "./interfaces";

/** Authentication commits its own state first. Publication retries never repeat the protected operation. */
export class AccountEventWorker {
    private stopped = false;
    private active?: Promise<number>;
    constructor(
        private readonly store: AccountEventStore,
        private readonly publisher: AccountEventPublisher,
        private readonly report: (type: AccountEventType, occurrenceId: string, code: string) => void = () => undefined,
        private readonly now = Date.now,
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
        for (const record of await this.store.due(25, this.now())) {
            if (this.stopped) {
                break;
            }
            const { intent } = record;
            const token = crypto.randomUUID();
            if (!(await this.store.claim(record, token, this.now(), this.now() + 30000))) {
                continue;
            }
            count++;
            if (!(await this.store.current(record))) {
                await this.store.finish(record, token, { dueAt: null });
                continue;
            }
            if (this.now() - Date.parse(intent.occurredAt) >= 86400000) {
                await this.store.finish(record, token, {
                    dueAt: null,
                    expired: true,
                    errorCode: "PUBLICATION_EXPIRED",
                });
                this.report(intent.type, intent.occurrenceId, "PUBLICATION_EXPIRED");
                continue;
            }
            let accepted = false;
            try {
                await this.publisher.publish(intent);
                accepted = true;
            } catch {
                /* Retry the same immutable fact. */
            }
            await this.store.finish(
                record,
                token,
                accepted
                    ? { dueAt: null }
                    : {
                          dueAt: this.now() + Math.min(3600000, 5000 * 2 ** Math.min(intent.attempts, 10)),
                          errorCode: "PUBLICATION_FAILED",
                      },
            );
            if (!accepted) {
                this.report(intent.type, intent.occurrenceId, "PUBLICATION_FAILED");
            }
        }
        return count;
    }
}
