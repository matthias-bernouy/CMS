import { expect, test } from "bun:test";
import { accountFixture } from "./fixture";
import { accountEventIntent } from "auth/accounts/events/intent";

test("opaque references hide email-shaped external identities and cannot resolve across stores or recreation", async () => {
    const f = accountFixture();
    const sub = "external:private@example.test";
    await f.users.upsert({ sub, provider: "external", email: "private@example.test" });
    const first = (await f.records())[0]!;
    const payload = JSON.parse(first.intent.payloadJson);
    expect(payload.accountRef).toMatch(/^[a-f0-9-]{36}$/u);
    expect(first.intent.payloadJson).not.toContain("private");
    expect(first.intent.payloadJson).not.toContain("@");
    const profile = await f.outbox.profile(payload.accountRef);
    expect(profile).toEqual({ createdAt: first.intent.accountCreatedAt, email: "private@example.test" });
    expect(await accountFixture().outbox.profile(payload.accountRef)).toBeNull();
    await f.users.delete(sub);
    await f.users.upsert({ sub, provider: "external", email: "replacement@example.test" });
    expect(await f.outbox.profile(payload.accountRef)).toBeNull();
    expect(await f.outbox.current(first)).toBe(false);
    expect((await f.records())[0]!.intent.accountRef).not.toBe(payload.accountRef);
});

test("malformed journal contents fail closed without reflecting private payloads in errors", async () => {
    const f = accountFixture();
    await f.users.upsert({ sub: "external:member", provider: "external" });
    const record = (await f.records())[0]!;
    for (const replacement of [
        { payloadJson: '{"secret":"private@example.test"}' },
        { accountRef: crypto.randomUUID() },
        { state: "sending", token: null },
        { unexpected: "private@example.test" },
    ]) {
        expect(() => accountEventIntent({ ...record.intent, ...replacement })).toThrow("Invalid account Event record");
    }
    expect(() => f.outbox.record("member", "external:foreign", record.intent)).toThrow("Account Event owner mismatch");
    expect(await f.records()).toEqual([record]);
});
