import { expect, test } from "bun:test";
import { scope, invocation, mcp } from "./fixture";

test("domain invocation validates successful and declared-error outcomes without HTTP status or headers", async () => {
    const f = await scope([mcp]);
    expect(await f.gateway.invoke(invocation)).toMatchObject({ kind: "success", output: { items: ["found"] } });
    expect(await f.gateway.invoke(invocation)).not.toHaveProperty("status");
    f.respond({ errorCode: "NOT_FOUND" });
    expect(await f.gateway.invoke(invocation)).toMatchObject({
        kind: "declared-error",
        errorCode: "NOT_FOUND",
        retryable: false,
    });
    f.respond({ output: { items: [42] } });
    await expect(f.gateway.invoke(invocation)).rejects.toMatchObject({ code: "invalid_provider_response" });
    f.respond({ errorCode: "UNKNOWN" });
    await expect(f.gateway.invoke(invocation)).rejects.toMatchObject({ code: "invalid_provider_response" });
});

test("MCP-only commands retain audit and unknown-outcome semantics", async () => {
    const f = await scope([mcp], { behavior: { effect: "command", execution: "sync", idempotency: "natural" } });
    await f.gateway.invoke(invocation);
    expect(f.audit.list().map(({ stage }) => stage)).toEqual(["started", "completed"]);
    f.respond({ output: { items: [42] } });
    await expect(f.gateway.invoke(invocation)).rejects.toMatchObject({ code: "outcome_unknown" });
    expect(
        f.audit
            .list()
            .slice(-2)
            .map(({ stage }) => stage),
    ).toEqual(["started", "outcome-unknown"]);
});

test("neutral binary outputs preserve MIME metadata and enforce the declared stream budget", async () => {
    const f = await scope([mcp], { binary: true });
    f.respond({ stream: new Blob(["123456789"]).stream(), contentType: "application/octet-stream" });
    const result = await f.gateway.invoke({ ...invocation, input: { fileId: "test" } });
    expect(result.kind).toBe("binary");
    if (result.kind === "binary") {
        await expect(new Response(result.stream).text()).rejects.toThrow("exceeds capability limit");
    }
    f.respond({
        stream: new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue("invalid" as unknown as Uint8Array);
            },
        }),
        contentType: "application/octet-stream",
    });
    const malformed = await f.gateway.invoke({ ...invocation, input: { fileId: "test" } });
    expect(malformed.kind).toBe("binary");
    if (malformed.kind === "binary") {
        await expect(new Response(malformed.stream).text()).rejects.toThrow("non-byte chunk");
    }
});
