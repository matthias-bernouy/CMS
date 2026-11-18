import { expect, test } from "bun:test";
import { inventoryFixture } from "../../fixtures/inventory";
import { observeHttp } from "./http";
import { observeMcp } from "./mcp";
import type { CapabilityTarget } from "../../capabilities/types";
import { ClientFailure } from "./failure";

test("a declared null output with an empty HTTP body remains a valid fully consumed result", async () => {
    const f = await inventoryFixture();
    let status = 204;
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(null, { status }) });
    try {
        const target = {
            ...f.target,
            definition: {
                ...f.target.definition,
                output: { type: "null" as const },
                bindings: f.target.definition.bindings.map((binding) =>
                    binding.transport === "http"
                        ? { ...binding, response: { ...binding.response, contentTypes: [], successStatuses: [204] } }
                        : binding,
                ),
            },
        };
        const sample = await observeHttp({
            origin: server.url.origin,
            target,
            binding: "http",
            input: {},
            credentials: {},
            assert: (output) => {
                expect(output).toBeNull();
            },
        });
        expect(sample.validated).toBe(true);
        expect(sample.completed).toBe(true);
        expect(sample.streamConsumed).toBe(true);
        expect(sample.responseBytes).toBe(0);
        status = 200;
        const unexpected = await observeHttp({
            origin: server.url.origin,
            target,
            binding: "http",
            input: {},
            credentials: {},
            assert: () => {},
        });
        expect(unexpected.validated).toBe(false);
        expect(unexpected.failure).toBe("undeclared-http-success-status");
    } finally {
        server.stop(true);
    }
});

test("HTTP and MCP send the fixture-owned replay key without retaining it in observations", async () => {
    const { target: original } = await inventoryFixture();
    const target: CapabilityTarget = {
        ...original,
        definition: {
            ...original.definition,
            behavior: { effect: "command", execution: "sync", sensitive: true, idempotency: "keyed" },
            bindings: original.definition.bindings.map((binding) =>
                binding.transport === "http" ? { ...binding, method: "POST" } : binding,
            ),
        },
    };
    const keys: unknown[] = [];
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(request) {
            if (new URL(request.url).pathname === "/.cms/mcp") {
                const message = await request.json();
                keys.push(message.params.arguments.idempotencyKey);
                return Response.json({
                    jsonrpc: "2.0",
                    id: message.id,
                    result: { structuredContent: { output: { ok: true } } },
                });
            }
            keys.push(request.headers.get("idempotency-key"));
            return Response.json({ ok: true });
        },
    });
    const idempotencyKey = crypto.randomUUID();
    const call = {
        origin: server.url.origin,
        target,
        binding: "http",
        input: {},
        credentials: { token: "fixture-only" },
        idempotencyKey,
        assert: () => {},
    };
    try {
        const http = await observeHttp(call);
        const mcp = await observeMcp({ ...call, binding: "mcp" }, [
            {
                name: "fixture",
                _meta: {
                    "io.ulvia/contract": target.release.contractId,
                    "io.ulvia/digest": target.release.digest,
                    "io.ulvia/capability": target.definition.id,
                    "io.ulvia/binding": "mcp",
                },
            },
        ]);
        expect(http.validated && mcp.validated).toBe(true);
        expect(keys).toEqual([idempotencyKey, idempotencyKey]);
        expect(JSON.stringify([http, mcp])).not.toContain(idempotencyKey);
    } finally {
        await server.stop(true);
    }
});

test("business diagnostics retain test-owned identifiers but discard arbitrary assertion messages", async () => {
    const { target } = await inventoryFixture();
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => Response.json({ ok: true }) });
    try {
        for (const [error, code] of [
            [
                new ClientFailure("provider-reader-selected-contract-missing"),
                "provider-reader-selected-contract-missing",
            ],
            [new Error("private-token-and-remote-payload"), "business-postcondition-failed"],
        ] as const) {
            const result = await observeHttp({
                origin: server.url.origin,
                target,
                binding: "http",
                input: {},
                credentials: {},
                assert() {
                    throw error;
                },
            });
            expect(result.failure).toBe(code);
            expect(result.validated).toBe(false);
            expect(result.streamConsumed).toBe(true);
            expect(JSON.stringify(result)).not.toContain("private-token-and-remote-payload");
        }
    } finally {
        server.stop(true);
    }
});
