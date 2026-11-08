import { expect, test } from "bun:test";
import { operationFixture, HeldOperationStore } from "./fixture";
import type { ProviderOperationRecord } from "@bernouy/ulvia-provider";

test("missing binding evidence, foreign scope, wrong versions and corrupt queued inputs refuse without business execution", async () => {
    const original = await operationFixture();
    const seeded = new HeldOperationStore();
    let recovered: Awaited<ReturnType<typeof operationFixture>> | undefined;
    try {
        const { operationId } = await (await original.call()).json();
        const record = (await original.store.get("site-a", operationId))!;
        const { bindingId: _binding, ...withoutBinding } = record.context.invocation!;
        const variants: Partial<ProviderOperationRecord>[] = [
            { context: { ...record.context, invocation: withoutBinding } },
            { context: { ...record.context, invocation: { ...record.context.invocation!, bindingId: "unknown" } } },
            { context: { ...record.context, invocation: { ...record.context.invocation!, instanceId: "instance-b" } } },
            { context: { ...record.context, siteId: "site-b" } },
            { context: { ...record.context, contractVersion: "9.0.0" } },
            { input: { value: false } },
        ];
        const ids: string[] = [];
        for (const [index, patch] of variants.entries()) {
            const id = crypto.randomUUID();
            ids.push(id);
            await seeded.createOrGet({ ...record, ...patch, id, idempotencyKey: `invalid-${index}` });
        }
        recovered = await operationFixture({ store: seeded });
        seeded.held = false;
        expect(await recovered.executor.recover()).toBe(variants.length);
        for (const id of ids) {
            expect((await seeded.get("site-a", id))?.status).toBe("failed");
        }
        expect(recovered.control.calls).toEqual([]);
    } finally {
        await original.executor.stop();
        await recovered?.executor.stop();
    }
});

test("invalid terminal DTOs never become successful durable results", async () => {
    const f = await operationFixture();
    try {
        const { operationId } = await (await f.call()).json();
        f.control.invalid = true;
        f.store.held = false;
        await f.executor.recover();
        const failed = (await f.store.get("site-a", operationId))!;
        expect(failed.status).toBe("failed");
        expect(failed.errorCode).toBe("OPERATION_FAILED");
        expect(failed).not.toHaveProperty("result");
    } finally {
        await f.executor.stop();
    }
});

test("signed foreign-instance requests and invalid input cannot create operation receipts", async () => {
    const f = await operationFixture();
    try {
        expect((await f.call({ claims: { instanceId: "instance-b" } })).status).toBe(401);
        expect((await f.call({ value: "x".repeat(17) })).status).toBe(400);
        expect(f.store.lookups).toBe(0);
        expect(f.control.calls).toEqual([]);
    } finally {
        await f.executor.stop();
    }
});

test("lease loss while an SDK guard awaits cannot start a late business mutation", async () => {
    let aborted = false;
    const store = new (class extends HeldOperationStore {
        override renew() {
            return Promise.resolve(false);
        }
    })();
    const f = await operationFixture({ store, leaseMs: 9 });
    try {
        const { operationId } = await (await f.call()).json();
        f.control.onAuthorize = async (signal) => {
            if (!signal) {
                throw new Error("A host worker must receive its lease signal");
            }
            if (signal.aborted) {
                aborted = true;
                return;
            }
            await new Promise<void>((resolve) =>
                signal.addEventListener(
                    "abort",
                    () => {
                        aborted = true;
                        resolve();
                    },
                    { once: true },
                ),
            );
        };
        store.held = false;
        await f.executor.recover();
        expect(aborted).toBe(true);
        expect(f.control.calls).toEqual([]);
        const record = (await store.get("site-a", operationId))!;
        expect(record.status).toBe("running");
        expect(record).not.toHaveProperty("result");
    } finally {
        await f.executor.stop();
    }
});
