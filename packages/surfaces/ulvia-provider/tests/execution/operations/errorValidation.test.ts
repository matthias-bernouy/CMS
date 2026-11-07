import { expect, test } from "bun:test";
import type { UlviaSchema } from "@bernouy/ulvia-contracts/schema";
import {
    MemoryProviderOperationStore,
    ProviderOperationExecutor,
    ProviderCapabilityDispatchError,
} from "@bernouy/ulvia-provider";

test("declared asynchronous failures require their output and reject undeclared codes", async () => {
    for (const code of ["INVALID_PAGE", "UNDECLARED"]) {
        const store = new MemoryProviderOperationStore();
        const executor = new ProviderOperationExecutor(store);
        executor.register(
            "example.jobs",
            "apply",
            async () => {
                throw new ProviderCapabilityDispatchError(code, 422);
            },
            [
                {
                    code: "INVALID_PAGE",
                    retryable: false,
                    output: {
                        type: "object",
                        properties: { message: { type: "string", maxLength: 100 } },
                        required: ["message"],
                    },
                },
            ],
        );
        const operation = await executor.enqueue(
            "example.jobs",
            "apply",
            {},
            {
                siteId: "site-a",
                providerId: "example.official/example",
                contractVersion: "1.0.0",
                requestId: crypto.randomUUID(),
                idempotencyKey: "one",
            },
        );
        await executor.stop();
        expect(await store.get("site-a", operation.operationId)).toMatchObject({
            status: "failed",
            errorCode: "OPERATION_FAILED",
        });
        expect((await store.get("site-a", operation.operationId))?.errorOutput).toBeUndefined();
        expect(await store.get("site-b", operation.operationId)).toBeNull();
    }
});

test("durable failures project details to their registered release before persistence", async () => {
    const message = { type: "string" as const, maxLength: 100 };
    const schemas: readonly (Record<string, UlviaSchema> | undefined)[] = [
        undefined,
        { message },
        { message, reason: message },
    ];
    for (const properties of schemas) {
        const store = new MemoryProviderOperationStore();
        const executor = new ProviderOperationExecutor(store);
        executor.register(
            "example.jobs",
            "apply",
            async () => {
                throw new ProviderCapabilityDispatchError(
                    "INVALID_PAGE",
                    422,
                    "Invalid page",
                    {},
                    {
                        message: "Two H1 headings",
                        reason: "multiple-h1",
                        internal: "private diagnostic",
                    },
                );
            },
            [
                {
                    code: "INVALID_PAGE",
                    retryable: false,
                    ...(properties
                        ? ({
                              output: { type: "object", properties, required: ["message"] },
                          } as const)
                        : {}),
                },
            ],
        );
        const operation = await executor.enqueue(
            "example.jobs",
            "apply",
            {},
            {
                siteId: "site-a",
                providerId: "example.official/example",
                contractVersion: "1.0.0",
                requestId: crypto.randomUUID(),
                idempotencyKey: "one",
            },
        );
        await executor.stop();
        const record = await store.get("site-a", operation.operationId);
        expect(record).toMatchObject({ status: "failed", errorCode: "INVALID_PAGE" });
        expect(record?.errorOutput).toEqual(
            properties
                ? {
                      message: "Two H1 headings",
                      ...("reason" in properties ? { reason: "multiple-h1" } : {}),
                  }
                : undefined,
        );
        expect(await store.get("site-b", operation.operationId)).toBeNull();
    }
});
