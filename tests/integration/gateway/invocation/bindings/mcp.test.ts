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
    await expect(
        binding.call(capabilityToolName("ulvia/catalog", "item.list"), { input: {} }, context),
    ).rejects.toThrow("Unknown capability tool");
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
        name: capabilityToolName("ulvia/catalog", "item.list", "agent", "search_items"),
        title: "Search items",
        description: "Find matching catalogue items.",
        _meta: { "io.ulvia/binding": "agent" },
    });
    expect(
        (
            await binding.call(
                capabilityToolName("ulvia/catalog", "item.list", "agent", "search_items"),
                { input: { term: "x" } },
                context,
            )
        ).structuredContent,
    ).toEqual({
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
        const result = await binding.call(
            capabilityToolName("ulvia/catalog", "item.list", "agent", "search_items"),
            { input: {} },
            context,
        );
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
    expect((await binding.list(context)).tools.map(({ name }) => name)).toEqual([
        capabilityToolName("ulvia/catalog", "item.list", "alternate", "find_items"),
        capabilityToolName("ulvia/catalog", "item.list", "agent", "search_items"),
    ]);
    await binding.call(
        capabilityToolName("ulvia/catalog", "item.list", "alternate", "find_items"),
        { input: {} },
        context,
    );
    expect(f.sent[0]?.bindingId).toBe("alternate");
});

test("equal authored tool names from two publishers dispatch to independent contracts", async () => {
    const first = await scope([mcp]);
    const second = await scope([mcp], { contractId: "other/catalog", providerId: "other/primary-provider" });
    const sent: string[] = [];
    const binding = new CapabilityMcpBinding({
        contracts: async () => [first.route.release.admission, second.route.release.admission],
        invoker: {
            invoke: async (invocation) => {
                sent.push(invocation.contractId);
                return { kind: "success", requestId: crypto.randomUUID(), output: { items: [invocation.contractId] } };
            },
        },
    });
    const tools = (await binding.list(context)).tools;
    expect(tools).toHaveLength(2);
    expect(new Set(tools.map((tool) => tool.name)).size).toBe(2);
    for (const tool of tools) {
        await binding.call(tool.name, { input: {} }, context);
    }
    expect(sent.toSorted()).toEqual(["other/catalog", "ulvia/catalog"]);
    await expect(binding.call("search_items", { input: {} }, context)).rejects.toThrow("Unknown capability tool");
    expect(sent).toHaveLength(2);
});
