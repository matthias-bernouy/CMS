import { expect, test } from "bun:test";
import { inventoryFixture } from "../../fixtures/inventory";
import { observe } from "./observe";
import type { ClientCall } from "./types";

test("successful HTTP envelopes require a valid business result and consume the entire stream", async () => {
    const f = await inventoryFixture();
    const call: ClientCall = {
        origin: "http://localhost",
        target: f.target,
        binding: "http",
        input: {},
        credentials: {},
        assert: () => {},
    };
    const decode = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes));
    const valid = await observe(call, "trace", 0, async () => Response.json({ ok: true }), decode);
    expect(valid.validated).toBe(true);
    expect(valid.completed).toBe(true);
    expect(valid.streamConsumed).toBe(true);
    for (const response of [
        Response.json({ missing: "ok" }),
        Response.json({ ok: true }, { status: 400 }),
        new Response("malformed"),
    ]) {
        const result = await observe(call, "trace", 0, async () => response, decode);
        expect(result.validated).toBe(false);
        expect(result.failure).toBeDefined();
    }
    const badPostcondition = await observe(
        {
            ...call,
            assert: () => {
                throw new Error("private-business-data");
            },
        },
        "trace",
        0,
        async () => Response.json({ ok: true }),
        decode,
    );
    expect(badPostcondition.validated).toBe(false);
    expect(JSON.stringify(badPostcondition)).not.toContain("private-business-data");
});

test("async business assertions must finish before coverage credit but do not inflate client timings", async () => {
    const f = await inventoryFixture();
    const started = performance.now();
    const result = await observe(
        {
            origin: "http://localhost",
            target: f.target,
            binding: "http",
            input: {},
            credentials: {},
            assert: async () => {
                await Bun.sleep(50);
                throw new Error("private assertion details");
            },
        },
        "trace",
        0,
        async () => Response.json({ ok: true }),
        (bytes) => JSON.parse(new TextDecoder().decode(bytes)),
    );
    expect(result.validated).toBe(false);
    expect(result.failure).toBe("business-postcondition-failed");
    expect(performance.now() - started - result.durationMs).toBeGreaterThanOrEqual(40);
});

test("session effects can be checked in private closures without persisting response credentials", async () => {
    const f = await inventoryFixture();
    let cookie = "";
    const result = await observe(
        {
            origin: "http://localhost",
            target: f.target,
            binding: "http",
            input: {},
            credentials: {},
            assert: () => {},
            captureHeaders: (headers) => {
                cookie = headers.get("set-cookie") ?? "";
            },
        },
        "trace",
        0,
        async () =>
            Response.json({ ok: true }, { headers: { "set-cookie": "session=private-fixture-token; HttpOnly" } }),
        (bytes) => JSON.parse(new TextDecoder().decode(bytes)),
    );
    expect(result.validated).toBe(true);
    expect(cookie).toContain("private-fixture-token");
    expect(JSON.stringify(result)).not.toContain("private-fixture-token");
});

test("an accepted operation handle and transport failure cannot masquerade as completed performance samples", async () => {
    const f = await inventoryFixture();
    const call: ClientCall = {
        origin: "http://localhost",
        target: f.target,
        binding: "http",
        input: {},
        credentials: {},
        assert: () => {},
    };
    const operation = {
        ...call,
        target: {
            ...f.target,
            definition: {
                ...f.target.definition,
                behavior: { ...f.target.definition.behavior, execution: "operation" as const },
            },
        },
    };
    const accepted = await observe(
        operation,
        "trace",
        0,
        async () => Response.json({ operationId: "id" }, { status: 202 }),
        () => ({}),
    );
    expect(accepted.completed).toBe(false);
    expect(accepted.failure).toBe("operation-completion-adapter-required");
    const failed = await observe(
        call,
        "trace",
        0,
        async () => {
            throw new Error("Bearer private-credential");
        },
        () => ({}),
    );
    expect(failed.status).toBe(0);
    expect(failed.streamConsumed).toBe(false);
    expect(JSON.stringify(failed)).not.toContain("private-credential");
});
