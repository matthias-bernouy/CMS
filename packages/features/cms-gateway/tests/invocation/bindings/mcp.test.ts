import { expect, test } from "bun:test";
import { CapabilityMcpBinding, capabilityToolName } from "@bernouy/cms-gateway/mcp";
import { scope, context, mcp, http } from "./fixture";

test("HTTP-only capabilities are neither discoverable nor callable through MCP", async () => {
    const f = await scope([http()]);
    const binding = new CapabilityMcpBinding({
        invoker: f.gateway,
        contracts: async () => [f.route.release.admission],
    });
    expect((await binding.list(context)).tools).toEqual([]);
    await expect(binding.call(capabilityToolName("catalog", "item.list"), { input: {} }, context)).rejects.toThrow(
        "Unknown capability tool",
    );
    expect(f.sent).toHaveLength(0);
});

test("an explicit MCP-only binding supplies its own metadata and executes without an HTTP binding or status", async () => {
    const f = await scope([mcp]);
    const binding = new CapabilityMcpBinding({
        invoker: f.gateway,
        contracts: async () => [f.route.release.admission],
    });
    expect(f.route.release.admission.bindings).toEqual([]);
    expect((await binding.list(context)).tools[0]).toMatchObject({
        name: "search_items",
        title: "Search items",
        description: "Find matching catalogue items.",
        _meta: { "io.ulvia/binding": "agent" },
    });
    expect((await binding.call("search_items", { input: { term: "x" } }, context)).structuredContent).toEqual({
        output: { items: ["found"] },
    });
    expect(f.sent[0]).toMatchObject({ bindingId: "agent", bindingTransport: "mcp" });
    expect(f.sent[0]).not.toHaveProperty("binding");
});

test("discovery cannot grant an MCP binding missing from the selected release or change an HTTP binding into MCP", async () => {
    const exposed = await scope([mcp]);
    for (const bindings of [[http()], [http("agent")]]) {
        const actual = await scope(bindings);
        const binding = new CapabilityMcpBinding({
            invoker: actual.gateway,
            contracts: async () => [exposed.route.release.admission],
        });
        const result = await binding.call("search_items", { input: {} }, context);
        expect(result).toMatchObject({ isError: true });
        expect(result.content[0]).toMatchObject({ text: expect.stringContaining("invalid_route") });
        expect(actual.sent).toHaveLength(0);
    }
});

test("alternate MCP bindings retain independent names for one shared capability", async () => {
    const f = await scope([mcp, { id: "alternate", transport: "mcp", tool: { name: "find_items" } }]);
    const binding = new CapabilityMcpBinding({
        invoker: f.gateway,
        contracts: async () => [f.route.release.admission],
    });
    expect((await binding.list(context)).tools.map(({ name }) => name)).toEqual(["find_items", "search_items"]);
    await binding.call("find_items", { input: {} }, context);
    expect(f.sent[0]?.bindingId).toBe("alternate");
});
