import { expect, test } from "bun:test";
import { CapabilityMcpBinding } from "@bernouy/cms-gateway/mcp";
import type { GatewayInvocation } from "@bernouy/cms-gateway";
import { repositoryFixture } from "./fixture";

const context = { siteId: "default", actor: { kind: "administrator" as const, subjectId: "local:admin" } };

async function fixture() {
    const repository = await repositoryFixture();
    const release = repository.contracts.find(({ release }) => release.contractId === "ulvia.cms.observability")!;
    const calls: GatewayInvocation[] = [];
    const binding = new CapabilityMcpBinding({
        contracts: async () => [release],
        invoker: {
            invoke: async (invocation) => {
                calls.push(invocation);
                return { kind: "success", requestId: crypto.randomUUID(), output: {} };
            },
        },
    });
    return { release, binding, calls };
}

test("official observability exposes only three administrator read tools with bounded filter schemas", async () => {
    const { release, binding } = await fixture();
    expect(release.release.version).toBe("1.1.0");
    const { tools } = await binding.list(context);
    expect(tools.map(({ name }) => name)).toEqual([
        "observability_logs_aggregate",
        "observability_logs_get",
        "observability_logs_query",
    ]);
    for (const tool of tools) {
        expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
        expect(tool._meta["io.ulvia/access"]).toBe("admin");
        expect(tool.inputSchema).toMatchObject({ additionalProperties: false });
        expect(tool.description.length).toBeGreaterThan(50);
    }
    const query = release.release.capabilities.find(({ id }) => id === "logs.query")!;
    expect(query.input.properties.limit).toMatchObject({ minimum: 1, maximum: 200 });
    expect(query.input.properties).not.toHaveProperty("instanceId");
    expect(query.input.properties).toHaveProperty("traceId");
    const append = release.release.capabilities.find(({ id }) => id === "logs.append")!;
    expect(append.bindings.map(({ transport }) => transport)).toEqual(["http"]);
});

test("observability MCP reads preserve trusted invocation scope and the existing HTTP binding", async () => {
    const { binding, calls, release } = await fixture();
    const input = { minLevel: "error", eventPrefix: "gateway.", limit: 20 };
    await binding.call("observability_logs_query", { input }, context);
    expect(calls).toEqual([
        expect.objectContaining({
            ...context,
            input,
            contractId: "ulvia.cms.observability",
            capabilityId: "logs.query",
            bindingId: "mcp",
            bindingTransport: "mcp",
        }),
    ]);
    await expect(
        binding.call("observability_logs_query", { input, actor: { kind: "system" } }, context),
    ).rejects.toThrow();
    expect(calls).toHaveLength(1);
    expect(release.release.capabilities.find(({ id }) => id === "logs.query")!.bindings[0]).toMatchObject({
        transport: "http",
        method: "QUERY",
        path: "/observability/logs/query",
    });
});
