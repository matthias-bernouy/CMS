import { expect, test } from "bun:test";
import { inventoryFixture } from "../../fixtures/inventory";
import { observeMcp } from "./mcp";
import type { CapabilityTarget } from "../../capabilities/types";

test("MCP refusal evidence requires the matching envelope, exact declared code and validated error output without granting nominal success", async () => {
    const fixture = await inventoryFixture();
    const target: CapabilityTarget = {
        ...fixture.target,
        definition: {
            ...fixture.target.definition,
            errors: [
                {
                    code: "REFUSED",
                    retryable: false,
                    output: {
                        type: "object",
                        properties: { message: { type: "string", minLength: 1, maxLength: 128 } },
                        required: ["message"],
                    },
                },
            ],
        },
    };
    let mode = "declared";
    const privateMessage = "private fixture refusal text";
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(request) {
            const message = await request.json();
            return Response.json({
                jsonrpc: "2.0",
                id: mode === "wrong-id" ? "foreign" : message.id,
                ...(mode === "rpc-error" ? { error: { code: -32603, message: privateMessage } } : {}),
                result: {
                    isError: true,
                    structuredContent: {
                        error: {
                            code: mode === "unknown-code" ? "UNDECLARED" : "REFUSED",
                            ...(mode === "no-output"
                                ? {}
                                : { output: mode === "invalid-output" ? {} : { message: privateMessage } }),
                        },
                    },
                },
            });
        },
    });
    const tools = [
        {
            name: "fixture",
            _meta: {
                "io.ulvia/contract": target.release.contractId,
                "io.ulvia/capability": target.definition.id,
                "io.ulvia/binding": "mcp",
                "io.ulvia/digest": target.release.digest,
            },
        },
    ];
    let businessAssertions = 0;
    const call = {
        origin: server.url.origin,
        target,
        binding: "mcp",
        input: {},
        credentials: { token: "fixture-token" },
        assert: () => {
            businessAssertions++;
        },
    };
    try {
        for (const [next, failure] of [
            ["declared", "mcp-declared-REFUSED"],
            ["wrong-id", "mcp-envelope-mismatch"],
            ["rpc-error", "mcp-envelope-mismatch"],
            ["unknown-code", "mcp-error-result"],
            ["invalid-output", "mcp-error-output-invalid"],
        ]) {
            mode = next!;
            const observation = await observeMcp(call, tools);
            expect(observation.failure).toBe(failure);
            expect(observation.validated).toBe(false);
            expect(observation.completed).toBe(false);
            expect(observation.streamConsumed).toBe(true);
            expect(JSON.stringify(observation)).not.toContain(privateMessage);
        }
        const noOutput = {
            ...target,
            definition: { ...target.definition, errors: [{ code: "REFUSED", retryable: false }] },
        };
        mode = "no-output";
        expect((await observeMcp({ ...call, target: noOutput }, tools)).failure).toBe("mcp-declared-REFUSED");
        mode = "declared";
        expect((await observeMcp({ ...call, target: noOutput }, tools)).failure).toBe("mcp-error-output-invalid");
        expect(businessAssertions).toBe(0);
    } finally {
        await server.stop(true);
    }
});
