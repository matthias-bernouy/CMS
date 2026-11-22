import { expect, test } from "bun:test";
import { NotificationWorker } from "../src/exports/index";
import type { SubmissionRecord } from "../src/interfaces/repository";

test("timed-out transports retain bounded permits while logical shutdown completes", async () => {
    let calls = 0;
    const settle: (() => void)[] = [];
    const records = new Map<string, SubmissionRecord>();
    for (let index = 0; index < 3; index++) {
        const id = crypto.randomUUID();
        records.set(id, {
            receiptId: id,
            formId: crypto.randomUUID(),
            formVersion: 1,
            principal: "test",
            digest: "test",
            receivedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
            replayExpiresAt: new Date(Date.now() + 86400000).toISOString(),
            status: "new",
            revision: 1,
            answers: [],
            notification: { subject: "Subject", text: "Body" },
            intents: [{ email: "test@example.test", state: "pending", generation: 1, lease: null, deadline: null }],
            deleted: false,
            deliveryMayComplete: false,
            lastAdmin: null,
        });
    }
    const repository = {
        due: async () => [...records.values()].filter((row) => row.intents[0]!.state === "pending"),
        replay: async (id: string) => records.get(id),
        replace: async (record: SubmissionRecord, revision: number) => {
            if (records.get(record.receiptId)!.revision !== revision) {
                return false;
            }
            records.set(record.receiptId, record);
            return true;
        },
    };
    const worker = new NotificationWorker(
        "stalled-transport-test",
        repository,
        {
            available: async () => true,
            send: () => {
                calls++;
                return new Promise<"accepted">((resolve) => settle.push(() => resolve("accepted")));
            },
        },
        5,
    );
    try {
        expect(await worker.tick()).toBe(2);
        expect(calls).toBe(2);
        expect([...records.values()].filter((row) => row.intents[0]!.state === "unknown")).toHaveLength(2);
        expect(await worker.tick()).toBe(0);
        await Promise.race([
            worker.stop(),
            Bun.sleep(100).then(() => {
                throw new Error("Shutdown waited for stalled transport");
            }),
        ]);
        for (const resolve of settle) {
            resolve();
        }
        await Bun.sleep(0);
        const next = new NotificationWorker("stalled-transport-test", repository, {
            available: async () => true,
            send: async () => "accepted",
        });
        expect(await next.tick()).toBe(1);
        await next.stop();
    } finally {
        for (const resolve of settle) {
            resolve();
        }
        await worker.stop();
    }
});
