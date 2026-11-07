import { expect, test } from "bun:test";
import { ProviderCapabilityDispatchError } from "@bernouy/cms-gateway/provider/server";
import { invocation, receiptFixture, scope } from "./fixture";

test("completed SMTP receipts survive executor recreation without storing email data", async () => {
    const f = receiptFixture();
    let sends = 0;
    const send = async () => {
        sends++;
        return { sent: true };
    };
    expect(await f.executor().execute(invocation(), send)).toEqual({ sent: true });
    expect(await f.executor().execute(invocation(), send)).toEqual({ sent: true });
    expect(sends).toBe(1);
    expect(f.calls).toEqual({ insert: 2, find: 1, update: 1, retained: 0 });
    expect(f.options()).toEqual({ writeConcern: { w: "majority", j: true }, readConcern: { level: "majority" } });
    expect(JSON.stringify([...f.documents.values()])).not.toContain("Private email body");
    expect(JSON.stringify([...f.documents.values()])).not.toContain("user@example.test");
});

test("another input or principal cannot replay a receipt and cross-instance calls never claim", async () => {
    const f = receiptFixture();
    const executor = f.executor();
    let sends = 0;
    const send = async () => {
        sends++;
        return { sent: true };
    };
    const original = invocation();
    await executor.execute(original, send);
    const before = JSON.stringify([...f.documents.values()]);
    for (const changed of [
        { ...original, input: { ...original.input, subject: "Another message" } },
        { ...original, context: { ...original.context, subjectId: "admin-b" } },
    ]) {
        await expect(executor.execute(changed, send)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
    const inserts = f.calls.insert;
    await expect(executor.execute({ ...original, instanceId: "instance-b" }, send)).rejects.toThrow("instance scope");
    expect(f.calls.insert).toBe(inserts);
    expect(JSON.stringify([...f.documents.values()])).toBe(before);
    expect(sends).toBe(1);
});

test("a concurrent duplicate refuses while the first send is pending", async () => {
    const f = receiptFixture();
    const executor = f.executor();
    let sends = 0;
    const pending = Promise.withResolvers<unknown>();
    const started = Promise.withResolvers<void>();
    const first = executor.execute(invocation(), async () => {
        sends++;
        started.resolve();
        return pending.promise;
    });
    await started.promise;
    await expect(
        f.executor().execute(invocation(), async () => {
            sends++;
        }),
    ).rejects.toMatchObject({ code: "CORE_UNAVAILABLE" });
    pending.resolve({ sent: true });
    await first;
    expect(sends).toBe(1);
    expect(f.calls.retained).toBe(0);
});

test("a crash after SMTP acceptance never causes an automatic resend", async () => {
    const f = receiptFixture();
    f.failComplete();
    let sends = 0;
    await expect(
        f.executor().execute(invocation(), async () => {
            sends++;
            return { sent: true };
        }),
    ).rejects.toThrow("Uncertain completion");
    await expect(
        f.executor().execute(invocation(), async () => {
            sends++;
        }),
    ).rejects.toMatchObject({ code: "CORE_UNAVAILABLE" });
    expect(sends).toBe(1);
    expect([...f.documents.values()][0]?.state).toBe("pending");
    expect(f.calls.retained).toBe(0);
});

test("claim failures and invalid keys never deliver, declared failures replay without leaking secrets", async () => {
    const f = receiptFixture();
    let sends = 0;
    const send = async () => {
        sends++;
        throw new ProviderCapabilityDispatchError("EMAIL_DISABLED", 409, "smtp-password");
    };
    await expect(f.executor().execute({ ...invocation(), key: "" }, send)).rejects.toMatchObject({
        code: "INVALID_INPUT",
    });
    expect(f.documents.size).toBe(0);
    await expect(f.executor().execute(invocation(), send)).rejects.toMatchObject({
        code: "EMAIL_DISABLED",
        status: 409,
    });
    await expect(f.executor().execute(invocation(), send)).rejects.toMatchObject({
        code: "EMAIL_DISABLED",
        status: 409,
    });
    expect(sends).toBe(1);
    expect(JSON.stringify([...f.documents.values()])).not.toContain("smtp-password");
    f.failClaim();
    await expect(f.executor().execute({ ...invocation(), key: "another" }, send)).rejects.toThrow(
        "Uncertain durable claim",
    );
    expect(sends).toBe(1);
    expect(f.calls.retained).toBe(0);
    expect(scope.siteId).toBe("default");
});

test("pending execution concurrency is bounded and refuses before another database operation", async () => {
    const f = receiptFixture();
    const executor = f.executor();
    const pending = Promise.withResolvers<unknown>();
    const calls = Array.from({ length: 128 }, (_, index) =>
        executor.execute({ ...invocation(), key: `send-${index}` }, () => pending.promise),
    );
    await expect(executor.execute({ ...invocation(), key: "overflow" }, () => pending.promise)).rejects.toMatchObject({
        code: "CORE_UNAVAILABLE",
    });
    expect(f.calls.insert).toBe(128);
    pending.resolve({ sent: true });
    await Promise.all(calls);
    expect(f.calls.retained).toBe(0);
});
