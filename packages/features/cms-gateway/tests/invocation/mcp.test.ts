import { expect, test } from "bun:test";
import { CapabilityGateway } from "@bernouy/cms-gateway";
import { InMemoryGatewayCommandAuditStore } from "@bernouy/cms-gateway/audit";
import { CapabilityMcpBinding, capabilityToolName, createCapabilityMcpHttpHandler } from "@bernouy/cms-gateway/mcp";
import { gatewayRoute, NOW } from "../fixtures";

const context = { siteId: "site-a", actor: { kind: "anonymous" as const } };

async function fixture(options: Parameters<typeof gatewayRoute>[0] = {}) {
    const route = await gatewayRoute({ ...options, mcp: true });
    let calls = 0;
    const gateway = new CapabilityGateway({
        routes: { resolve: async () => route, isCurrent: async () => true },
        authorize: async () => true,
        now: () => NOW,
        commandAudit: new InMemoryGatewayCommandAuditStore(),
        transport: {
            async send() {
                calls++;
                return { status: 200, contentType: "application/json", output: { items: ["found"] } };
            },
        },
    });
    const binding = new CapabilityMcpBinding({ invoker: gateway, contracts: async () => [route.release.admission] });
    return { binding, calls: () => calls };
}

test("MCP discovery projects declared schema and calls the normal Gateway", async () => {
    const { binding, calls } = await fixture();
    const tools = await binding.list(context);
    expect(tools.tools[0]?.annotations.readOnlyHint).toBe(true);
    expect(tools.tools[0]?.inputSchema).toMatchObject({
        additionalProperties: false,
        properties: { input: { additionalProperties: false } },
    });
    const result = await binding.call(capabilityToolName("catalog", "item.list"), { input: { term: "x" } }, context);
    expect(result.structuredContent).toEqual({ output: { items: ["found"] } });
    expect(calls()).toBe(1);
    const invalid = await binding.call(
        capabilityToolName("catalog", "item.list"),
        { input: { unknown: true } },
        context,
    );
    expect(invalid.isError).toBe(true);
    expect(calls()).toBe(1);
});

test("MCP access hints never authorize a caller or accept a forged actor", async () => {
    const { binding, calls } = await fixture({ access: "admin" });
    const result = await binding.call(capabilityToolName("catalog", "item.list"), { input: {} }, context);
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ type: "text", text: expect.stringContaining("not_authorized") });
    await expect(
        binding.call(
            capabilityToolName("catalog", "item.list"),
            { input: {}, actor: { kind: "administrator" } },
            context,
        ),
    ).rejects.toThrow();
    expect(calls()).toBe(0);
});

test("MCP preserves declared errors and requires explicit keyed command retry identity", async () => {
    const { binding, calls } = await fixture({
        behavior: { sensitive: false, effect: "command", execution: "sync", idempotency: "keyed" },
    });
    const name = capabilityToolName("catalog", "item.list");
    await expect(binding.call(name, { input: {} }, context)).rejects.toThrow();
    expect(calls()).toBe(0);
    expect((await binding.list(context)).tools[0]?.annotations).toMatchObject({
        readOnlyHint: false,
        idempotentHint: true,
    });
    expect((await binding.call(name, { input: {}, idempotencyKey: "retry-1" }, context)).structuredContent).toEqual({
        output: { items: ["found"] },
    });
});

test("MCP HTTP validates origin, media negotiation, methods and protocol version", async () => {
    const { binding } = await fixture();
    const handle = createCapabilityMcpHttpHandler({
        binding,
        allowedOrigins: [],
        serverInfo: { name: "test", version: "1.0.0" },
        resolveContext: async () => context,
    });
    const request = (method: string, headers = {}) =>
        new Request("https://cms.test/mcp", {
            method: "POST",
            headers: {
                Accept: "application/json, text/event-stream",
                "Content-Type": "application/json",
                "MCP-Protocol-Version": "2025-11-25",
                ...headers,
            },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: {} }),
        });
    expect((await handle(request("tools/list", { Origin: "https://evil.test" }))).status).toBe(403);
    expect((await handle(request("tools/list", { "MCP-Protocol-Version": "invalid" }))).status).toBe(400);
    expect((await handle(new Request("https://cms.test/mcp"))).status).toBe(405);
    const initialized = await handle(request("initialize"));
    expect(await initialized.json()).toMatchObject({
        result: { protocolVersion: "2025-11-25", capabilities: { tools: {} } },
    });
    expect(await (await handle(request("unsupported"))).json()).toMatchObject({ error: { code: -32601 } });
});
