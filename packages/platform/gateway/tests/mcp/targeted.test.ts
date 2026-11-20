import { expect, test } from "bun:test";
import { CapabilityMcpBinding, capabilityToolName } from "@bernouy/cms-gateway/mcp";
import { fixture, context } from "./fixture";
import type { GatewayInvocation } from "@bernouy/cms-gateway";

test("trusted targeted lookup preserves Gateway arguments and results; discovery stays complete", async () => {
    const f = await fixture(3);
    const invoked: GatewayInvocation[] = [];
    const lookedUp: string[] = [];
    let lists = 0;
    const name = capabilityToolName("example/catalog", "query.item0", "agent", "tool-3");
    const binding = new CapabilityMcpBinding({
        contracts: async () => {
            lists++;
            return [f.original];
        },
        resolveToolContract: async (tool, scope) => {
            expect(scope).toBe(context);
            lookedUp.push(tool);
            return tool === name ? f.original : null;
        },
        invoker: {
            invoke: async (invocation) => {
                invoked.push(invocation);
                return { kind: "success", requestId: "mcp-test-request", output: {} };
            },
        },
    });
    expect(await binding.call(name, { input: {} }, context)).toEqual(
        await f.binding.call(name, { input: {} }, context),
    );
    expect(invoked).toEqual(f.invoked);
    expect(lists).toBe(0);
    await expect(binding.call("unknown", { input: {} }, context)).rejects.toThrow("Unknown capability tool");
    expect(invoked).toHaveLength(1);
    expect(lookedUp).toEqual([name, "unknown"]);
    expect(await binding.list(context)).toEqual(await f.binding.list(context));
    expect(lists).toBe(1);
});

test("target resolution failures never fall back to a different catalogue or invoke business code", async () => {
    const f = await fixture(1);
    const failure = new Error("fresh control refused");
    const binding = new CapabilityMcpBinding({
        contracts: async () => {
            throw new Error("Unexpected fallback");
        },
        resolveToolContract: async () => {
            throw failure;
        },
        invoker: {
            invoke: async () => {
                throw new Error("Unexpected invocation");
            },
        },
    });
    await expect(binding.call("any", { input: {} }, context)).rejects.toBe(failure);
    expect(f.invoked).toHaveLength(0);
});
