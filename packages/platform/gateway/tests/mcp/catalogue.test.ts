import { expect, test } from "bun:test";
import { capabilityToolName } from "@bernouy/cms-gateway/mcp";
import { fixture, context } from "./fixture";

test("discovery keeps ordinal pagination while hashing each current identity only once before projection", async () => {
    const f = await fixture();
    const expected = f.original.release.capabilities
        .map((capability) =>
            capabilityToolName(
                "example/catalog",
                capability.id,
                "agent",
                capability.bindings[0]!.transport === "mcp" ? capability.bindings[0]!.tool?.name : undefined,
            ),
        )
        .sort();
    const first = await f.binding.list(context);
    expect(first.tools.map(({ name }) => name)).toEqual(expected.slice(0, 64));
    expect(first.nextCursor).toBe("64");
    expect(f.names()).toBeLessThanOrEqual(70 + 64);
    const second = await f.binding.list(context, first.nextCursor);
    expect(second.tools.map(({ name }) => name)).toEqual(expected.slice(64));
    expect(second.nextCursor).toBeUndefined();
    expect(f.reads()).toBe(2);
    await expect(f.binding.list(context, "65invalid")).rejects.toThrow("Invalid tools cursor");
});

test("call lookup has a linear identity-work bound and preserves exact Gateway dispatch", async () => {
    const f = await fixture();
    await expect(f.binding.call("missing-tool", { input: {} }, context)).rejects.toThrow("Unknown capability tool");
    expect(f.names()).toBe(70);
    expect(f.invoked).toHaveLength(0);
    const capability = f.original.release.capabilities[0]!;
    const name = capabilityToolName("example/catalog", capability.id, "agent", "tool-70");
    expect((await f.binding.call(name, { input: {} }, context)).structuredContent).toEqual({ output: {} });
    expect(f.names()).toBe(140);
    expect(f.invoked).toEqual([
        {
            ...context,
            contractId: "example/catalog",
            capabilityId: capability.id,
            bindingId: "agent",
            bindingTransport: "mcp",
            input: {},
        },
    ]);
    f.replace([]);
    await expect(f.binding.call(name, { input: {} }, context)).rejects.toThrow("Unknown capability tool");
    expect(f.invoked).toHaveLength(1);
    expect(f.reads()).toBe(3);
});

test("duplicate identities and catalogue bounds still fail before exposure filtering", async () => {
    const f = await fixture(1);
    f.replace([f.tracked, f.tracked]);
    await expect(f.binding.list(context)).rejects.toThrow("duplicate tool identities");
    await expect(f.binding.call("missing", { input: {} }, context)).rejects.toThrow("duplicate tool identities");
    const capability = f.original.release.capabilities[0]!;
    const hidden = {
        ...f.tracked,
        release: { ...f.tracked.release, capabilities: [{ ...capability, responseEffects: ["session" as const] }] },
    };
    f.replace([hidden, hidden]);
    await expect(f.binding.list(context)).rejects.toThrow("duplicate tool identities");
    f.replace(Array.from({ length: 1_025 }, () => f.tracked));
    const before = f.names();
    await expect(f.binding.list(context)).rejects.toThrow("catalogue exceeds limits");
    expect(f.names()).toBe(before);
    expect(f.invoked).toHaveLength(0);
});
