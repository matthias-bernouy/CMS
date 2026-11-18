import { expect, test } from "bun:test";
import { inventoryFixture } from "../../fixtures/inventory";
import { capabilityRequest, isolatedOrigin, responseBytes } from "./http";
import { requestKey } from "./key";
import type { CapabilityTarget } from "../../capabilities/types";

test("performance clients accept isolated origins and reject credentials, paths and remote services", () => {
    for (const origin of [
        "http://localhost:1234",
        "http://site.localhost:5678",
        "https://127.0.0.1",
        "http://[::1]:8080",
    ]) {
        expect(isolatedOrigin(origin)).toBe(origin);
    }
    for (const origin of [
        "https://ulvia.fr",
        "http://localhost.evil.test",
        "ftp://localhost",
        "http://x:y@localhost",
        "http://localhost/path",
        "http://localhost/?token=secret",
        "http://localhost/#token",
    ]) {
        expect(() => isolatedOrigin(origin)).toThrow();
    }
});

test("HTTP compilation uses the admitted binding and validates inputs before any network request", async () => {
    const f = await inventoryFixture();
    const request = capabilityRequest(
        "http://localhost:8080",
        f.target,
        "http",
        {},
        { cookie: "session=private" },
        "trace-1",
    );
    expect(request.url.href).toBe("http://localhost:8080/.cms/call/performance/child/read");
    expect(request.init.method).toBe("GET");
    expect(request.init.headers.get("x-request-id")).toBe("trace-1");
    expect(request.requestBytes).toBe(0);
    expect(() => capabilityRequest("http://localhost", f.target, "mcp", {})).toThrow();
    expect(() => capabilityRequest("http://localhost", f.target, "http", { unexpected: true })).toThrow();
});

test("response readers consume complete streams, release locks and cancel oversized responses", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(new Uint8Array(20));
        },
        cancel() {
            cancelled = true;
        },
    });
    await expect(responseBytes(new Response(stream), 10)).rejects.toThrow("byte budget");
    expect(cancelled).toBe(true);
    expect(stream.locked).toBe(false);
    expect(new TextDecoder().decode(await responseBytes(new Response("complete")))).toBe("complete");
    expect((await responseBytes(new Response(null, { status: 204 }))).length).toBe(0);
});

test("explicit idempotency keys replay exact commands and cannot silently attach to non-keyed requests", async () => {
    const { target } = await inventoryFixture();
    const keyed: CapabilityTarget = {
        ...target,
        definition: {
            ...target.definition,
            behavior: { effect: "command", execution: "sync", sensitive: true, idempotency: "keyed" },
        },
    };
    const key = crypto.randomUUID();
    expect(requestKey(keyed, key)).toBe(key);
    expect(requestKey(keyed)).not.toBe(requestKey(keyed));
    expect(() => requestKey(target, key)).toThrow();
    expect(() => requestKey(keyed, "invalid key")).toThrow();
    expect(() => requestKey(keyed, "x".repeat(129))).toThrow();
    expect(requestKey(target)).toBeUndefined();
});
