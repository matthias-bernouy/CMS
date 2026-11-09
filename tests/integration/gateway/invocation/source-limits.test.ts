import { expect, test } from "bun:test";
import { loadOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import { CapabilityMcpBinding, capabilityToolName, createCapabilityMcpHttpHandler } from "@bernouy/cms-gateway/mcp";
import { MAX_CAPABILITY_JSON_BYTES } from "@bernouy/ulvia-contracts/protocol";

test("MCP HTTP and tool parsing accept escaped authoring sources above the former envelope limit", async () => {
    const build = await loadOfficialFeatures();
    const contract = build.contracts.find(({ release }) => release.contractId === "ulvia/cms.authoring")!;
    const sourceJson = JSON.stringify({
        files: Array.from({ length: 4 }, (_, index) => ({
            path: index ? `texts/${index}.json` : "definition.json",
            content: "\n".repeat(1024 * 1024 - 8192),
        })),
    });
    let calls = 0;
    const binding = new CapabilityMcpBinding({
        contracts: async () => [contract],
        invoker: {
            invoke: async (call) => {
                calls++;
                expect(call.actor.kind).toBe("administrator");
                expect(call.input).toEqual({ sourceJson });
                return { kind: "success", requestId: "large-source", output: { valid: true, diagnostics: [] } };
            },
        },
    });
    const handler = createCapabilityMcpHttpHandler({
        binding,
        allowedOrigins: ["https://cms.test"],
        serverInfo: { name: "test", version: "1.0.0" },
        resolveContext: async () => ({ siteId: "default", actor: { kind: "administrator", subjectId: "admin" } }),
    });
    const headers = {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-11-25",
    };
    const body = JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
            name: capabilityToolName(
                "ulvia/cms.authoring",
                "prepare-collection",
                "mcp",
                "authoring_prepare_collection",
            ),
            arguments: { input: { sourceJson } },
        },
    });
    expect(Buffer.byteLength(body)).toBeGreaterThan(8 * 1024 * 1024);
    expect(Buffer.byteLength(body)).toBeLessThan(MAX_CAPABILITY_JSON_BYTES);
    const response = await handler(new Request("https://cms.test/.cms/mcp", { method: "POST", headers, body }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ result: { structuredContent: { output: { valid: true } } } });
    expect(calls).toBe(1);
    const oversized = JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { padding: "x".repeat(MAX_CAPABILITY_JSON_BYTES) },
    });
    expect(
        (await handler(new Request("https://cms.test/.cms/mcp", { method: "POST", headers, body: oversized }))).status,
    ).toBe(400);
    expect(calls).toBe(1);
});
