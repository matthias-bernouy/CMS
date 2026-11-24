import type { FormsRepository, SubmissionRecord } from "forms/interfaces/repository";
import type { FormsDelivery } from "forms/interfaces/services";

let outstanding = 0;
const instances = new Map<string, number>();
function acquire(instance: string) {
    const count = instances.get(instance) ?? 0;
    if (outstanding >= 8 || count >= 2) {
        return undefined;
    }
    outstanding++;
    instances.set(instance, count + 1);
    return () => {
        outstanding--;
        const next = instances.get(instance)! - 1;
        if (next) {
            instances.set(instance, next);
        } else {
            instances.delete(instance);
        }
    };
}

/** Only Forms work owns these budgets. Uncertain sends never become automatic retries. */
export class NotificationWorker {
    private stopped = false;
    private readonly active = new Map<string, Promise<void>>();
    constructor(
        private readonly scope: string,
        private readonly repository: Pick<FormsRepository, "due" | "replay" | "replace">,
        private readonly delivery: FormsDelivery,
        private readonly timeoutMs = 15000,
    ) {}
    async tick() {
        if (this.stopped) {
            return 0;
        }
        const rows = await this.repository.due(25);
        const work: Promise<void>[] = [];
        for (const record of rows) {
            if (this.stopped || this.active.has(record.receiptId)) {
                continue;
            }
            const release = acquire(this.scope);
            if (!release) {
                break;
            }
            let transport: Promise<unknown> | undefined;
            const pending = this.process(record, (sending) => {
                transport = sending;
            }).finally(() => {
                if (transport) {
                    void transport.then(release, release);
                } else {
                    release();
                }
                this.active.delete(record.receiptId);
            });
            this.active.set(record.receiptId, pending);
            work.push(pending);
        }
        await Promise.all(work);
        return work.length;
    }
    async stop() {
        this.stopped = true;
        await Promise.allSettled([...this.active.values()]);
    }
    private async process(record: SubmissionRecord, retain: (sending: Promise<unknown>) => void) {
        if (record.deleted) {
            return;
        }
        if (Date.parse(record.expiresAt) <= Date.now()) {
            await this.repository.replace(
                {
                    ...record,
                    revision: record.revision + 1,
                    deleted: true,
                    event: null,
                    answers: [],
                    notification: null,
                    intents: [],
                    deliveryMayComplete:
                        record.deliveryMayComplete ||
                        record.intents.some((intent) => ["sending", "accepted", "unknown"].includes(intent.state)),
                },
                record.revision,
            );
            return;
        }
        const index = record.intents.findIndex(
            (intent) =>
                intent.state === "pending" ||
                (intent.state === "sending" && Date.parse(intent.deadline!) <= Date.now()),
        );
        if (index < 0) {
            return;
        }
        const intent = record.intents[index]!;
        if (intent.state === "sending") {
            await this.set(record, index, "unknown");
            return;
        }
        if (!(await this.delivery.available())) {
            await this.set(record, index, "blocked");
            return;
        }
        if (this.stopped) {
            return;
        }
        const token = crypto.randomUUID();
        const claimed = {
            ...record,
            revision: record.revision + 1,
            deliveryMayComplete: true,
            intents: record.intents.map((item, at) =>
                at === index
                    ? {
                          ...item,
                          state: "sending" as const,
                          lease: token,
                          deadline: new Date(Date.now() + 30000).toISOString(),
                      }
                    : item,
            ),
        };
        if (!(await this.repository.replace(claimed, record.revision))) {
            return;
        }
        const input = { toEmail: intent.email, subject: record.notification!.subject, text: record.notification!.text };
        const sending = this.delivery
            .send(input, `forms-${record.receiptId}-${index}-${intent.generation}`)
            .catch(() => "unknown" as const);
        retain(sending);
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<"unknown">((resolve) => {
            timer = setTimeout(() => resolve("unknown"), this.timeoutMs);
        });
        try {
            const state = await Promise.race([sending, timeout]);
            const current = await this.repository.replay(record.receiptId);
            if (current && !current.deleted && current.intents[index]?.lease === token) {
                await this.set(current, index, state);
            }
            // The transport retains its permit independently of logical completion and shutdown.
        } finally {
            if (timer) {
                clearTimeout(timer);
            }
        }
    }
    private set(record: SubmissionRecord, index: number, state: "accepted" | "blocked" | "failed" | "unknown") {
        return this.repository.replace(
            {
                ...record,
                revision: record.revision + 1,
                intents: record.intents.map((item, at) =>
                    at === index ? { ...item, state, lease: null, deadline: null } : item,
                ),
            },
            record.revision,
        );
    }
}
