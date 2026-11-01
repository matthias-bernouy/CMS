import { expect, test } from "bun:test";
import { MemoryProviderOperationStore, ProviderOperationExecutor } from "@bernouy/ulvia-provider";

test("durable operations snapshot HTTP metadata, detach browser cancellation and include preconditions in replay identity", async () => {
    const store = new MemoryProviderOperationStore();
    const executor = new ProviderOperationExecutor(store);
    const abort = new AbortController();
    const headers = new Headers({ "if-match": '"v1"', "accept-language": "fr" });
    let executions = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    executor.register("example.jobs", "apply", async (_input, context, execution) => {
        executions++;
        await gate;
        expect(context.http.headers?.get("if-match")).toBe('"v1"');
        expect(context.signal).toBe(execution.signal);
        expect(context.signal?.aborted).toBe(false);
        return { done: true };
    });
    const context = {
        requestId: crypto.randomUUID(),
        contractVersion: "1.0.0",
        siteId: "site-a",
        providerId: "example",
        idempotencyKey: "one",
        http: { headers, transportRequest: new Request("https://site.test/") },
        signal: abort.signal,
    };
    try {
        const first = await executor.enqueue("example.jobs", "apply", {}, context);
        abort.abort();
        headers.set("if-match", '"v2"');
        const stored = await store.get("site-a", first.operationId);
        expect(stored?.context).not.toHaveProperty("headers");
        expect(stored?.context).not.toHaveProperty("signal");
        expect(stored?.context).not.toHaveProperty("request");
        expect(stored?.context.requestContext?.headers["if-match"]).toBe('"v1"');
        await expect(executor.enqueue("example.jobs", "apply", {}, context)).rejects.toMatchObject({
            code: "IDEMPOTENCY_CONFLICT",
        });
        const replay = await executor.enqueue(
            "example.jobs",
            "apply",
            {},
            { ...context, http: { headers: new Headers({ "if-match": '"v1"', "accept-language": "en" }) } },
        );
        expect(replay).toEqual(first);
        expect(await store.get("other-site", first.operationId)).toBeNull();
    } finally {
        release();
        await executor.stop();
    }
    expect(executions).toBe(1);
});
