import type { AccountEventIntent, AccountEventPublisher } from "@bernouy/auth";
import { expect, test } from "bun:test";
import { AccountEventWorker, InMemoryAccountEventStore } from "@bernouy/auth";
import { accountCreatedIntent } from "auth/accounts/events/intent";
import { accountFixture } from "./fixture";

test("publication resumes after a lost receipt with the same fact identity and payload", async () => {
    const f = accountFixture();
    await f.users.upsert({ sub: "external:member", provider: "external" });
    let now = Date.now();
    const accepted = new Map<string, string>();
    let attempts = 0;
    const publisher: AccountEventPublisher = {
        publish: async (intent: AccountEventIntent) => {
            attempts++;
            const prior = accepted.get(intent.occurrenceId);
            if (prior) {
                expect(prior).toBe(intent.payloadJson);
            }
            accepted.set(intent.occurrenceId, intent.payloadJson);
            if (attempts === 1) {
                throw new Error("reply lost");
            }
        },
    };
    function make(value: AccountEventPublisher) {
        return new AccountEventWorker(f.outbox, value, undefined, () => now);
    }
    const first = make(publisher);
    expect(await first.tick()).toBe(1);
    await first.stop();
    now += 5001;
    const recovered = make(publisher);
    expect(await recovered.tick()).toBe(1);
    expect(accepted.size).toBe(1);
    expect(attempts).toBe(2);
    expect(await recovered.tick()).toBe(0);
    await recovered.stop();
});
test("expired leases cannot acknowledge a replacement and deletion cancels unclaimed facts", async () => {
    const f = accountFixture();
    await f.users.upsert({ sub: "external:member", provider: "external" });
    const record = (await f.records())[0]!;
    const now = Date.now();
    const first = crypto.randomUUID();
    const second = crypto.randomUUID();
    expect(await f.outbox.claim(record, first, now, now + 30000)).toBe(true);
    const stale = (await f.outbox.due(1, now + 30001))[0]!;
    expect(await f.outbox.claim(stale, second, now + 30001, now + 60000)).toBe(true);
    expect(await f.outbox.finish(record, first, { dueAt: null })).toBe(false);
    expect(await f.outbox.finish(stale, second, { dueAt: null })).toBe(true);
    await f.users.upsert({ sub: "external:delete", provider: "external" });
    await f.users.delete("external:delete");
    let calls = 0;
    await new AccountEventWorker(f.outbox, {
        publish: async () => {
            calls++;
        },
    }).tick();
    expect(calls).toBe(0);
});
test("the source handoff expires visibly after 24 hours and does not dispatch stale facts", async () => {
    const now = Date.now();
    const store = new InMemoryAccountEventStore(async () => true);
    const reference = crypto.randomUUID();
    const at = new Date(now - 86400001);
    store.bindMemberReference("external:old", reference, at.toISOString());
    store.record("member", "external:old", accountCreatedIntent("external:old", "external", at, reference));
    const reports: string[] = [];
    let calls = 0;
    const worker = new AccountEventWorker(
        store,
        {
            publish: async () => {
                calls++;
            },
        },
        (_type, _id, code) => reports.push(code),
        () => now,
    );
    expect(await worker.tick()).toBe(1);
    expect(await worker.tick()).toBe(0);
    expect(calls).toBe(0);
    expect(reports).toEqual(["PUBLICATION_EXPIRED"]);
});
