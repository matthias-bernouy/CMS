import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { canonicalizeIJson } from "@bernouy/cms-repository/contracts/protocol";
import {
    MemoryProviderOperationStore,
    ProviderOperationExecutor,
    ProviderCapabilityDispatchError,
} from "@bernouy/ulvia-provider";

const context = {
    siteId: "site-a",
    providerId: "example",
    contractVersion: "1.0.0",
    requestId: crypto.randomUUID(),
    idempotencyKey: "one",
};
const wrapped = { input: {}, headers: { "if-match": '"v1"' } };

test("business input cannot collide with the execution-header envelope", async () => {
    const store = new MemoryProviderOperationStore();
    const executor = new ProviderOperationExecutor(store);
    executor.register("example.jobs", "apply", async () => ({ done: true }));
    try {
        const first = await executor.enqueue("example.jobs", "apply", wrapped, context);
        await expect(
            executor.enqueue("example.jobs", "apply", {}, { ...context, requestContext: { headers: wrapped.headers } }),
        ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
        expect((await store.list("site-a", "example.jobs", undefined, 10)).items).toHaveLength(1);
        expect((await store.get("site-a", first.operationId))?.input).toEqual(wrapped);
        expect(await store.get("site-b", first.operationId)).toBeNull();
    } finally {
        await executor.stop();
    }
});

test("legacy operations replay from their saved input and reject a colliding old digest", async () => {
    const store = new MemoryProviderOperationStore();
    const now = new Date().toISOString();
    await store.createOrGet({
        id: crypto.randomUUID(),
        siteId: "site-a",
        contractId: "example.jobs",
        capabilityId: "apply",
        idempotencyKey: "one",
        inputDigest: `sha256:${createHash("sha256").update(canonicalizeIJson(wrapped)).digest("hex")}`,
        input: wrapped,
        context,
        status: "succeeded",
        revision: 1,
        createdAt: now,
        updatedAt: now,
        result: { done: true },
    });
    const executor = new ProviderOperationExecutor(store);
    try {
        const replay = await executor.enqueue("example.jobs", "apply", wrapped, context);
        expect((await store.get("site-a", replay.operationId))?.status).toBe("succeeded");
        await expect(
            executor.enqueue("example.jobs", "apply", {}, { ...context, requestContext: { headers: wrapped.headers } }),
        ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    } finally {
        await executor.stop();
    }
});

test("durable failures preserve bounded JSON details and refuse oversized details", async () => {
    for (const output of [{ message: "The page contains two H1 headings" }, { message: "a".repeat(70_000) }]) {
        const store = new MemoryProviderOperationStore();
        const executor = new ProviderOperationExecutor(store);
        executor.register(
            "example.jobs",
            "apply",
            async () => {
                throw new ProviderCapabilityDispatchError("INVALID_PAGE", 422, "Invalid page", {}, output);
            },
            [
                {
                    code: "INVALID_PAGE",
                    retryable: false,
                    output: {
                        type: "object",
                        properties: { message: { type: "string", maxLength: 100_000 } },
                        required: ["message"],
                    },
                },
            ],
        );
        const operation = await executor.enqueue("example.jobs", "apply", {}, context);
        await executor.stop();
        const record = await store.get("site-a", operation.operationId);
        expect(record?.status).toBe("failed");
        if (output.message.length < 65_536) {
            expect(record?.errorOutput).toEqual(output);
        } else {
            expect(record?.errorCode).toBe("OPERATION_FAILED");
            expect(record?.errorOutput).toBeUndefined();
        }
    }
});

test("an asynchronous handler cannot persist undeclared error details", async () => {
    const store = new MemoryProviderOperationStore();
    const executor = new ProviderOperationExecutor(store);
    executor.register("example.jobs", "apply", async () => {
        throw new ProviderCapabilityDispatchError("INVALID_PAGE", 422, "Invalid page", {}, { message: "undeclared" });
    });
    const operation = await executor.enqueue("example.jobs", "apply", {}, context);
    await executor.stop();
    expect(await store.get("site-a", operation.operationId)).toMatchObject({
        status: "failed",
        errorCode: "OPERATION_FAILED",
    });
    expect((await store.get("site-a", operation.operationId))?.errorOutput).toBeUndefined();
});
