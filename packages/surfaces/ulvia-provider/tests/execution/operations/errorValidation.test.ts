import { expect, test } from "bun:test";
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
                providerId: "example",
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
