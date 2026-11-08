import { expect, test } from "bun:test";
import { defineFeature, defineCapability, contractBinary, z } from "@bernouy/ulvia-sdk";
import { compileContract } from "@bernouy/ulvia-sdk/build";
import { resolveContract } from "@bernouy/ulvia-contracts";
import { resourcePreviewBindings } from "../../../src/runtime/instances/verification/resources/bindings";

async function executionFixture() {
    const common = {
        description: "Read a resource",
        access: "public" as const,
        behavior: { effect: "query" as const, execution: "sync" as const, sensitive: false },
        input: z.strictObject({}),
        errors: {},
    };
    const feature = defineFeature({
        contractId: "acme/resources",
        publisherId: "acme",
        name: "Resources",
        version: "1.0.0",
        capabilities: [
            defineCapability({
                ...common,
                id: "read",
                output: z.strictObject({ ready: z.boolean() }),
                bindings: [{ id: "mcp", transport: "mcp", tool: { name: "resource_read" } }],
            }),
            defineCapability({
                ...common,
                id: "svg",
                output: contractBinary({ maxBytes: 1024 }),
                bindings: [
                    {
                        id: "http",
                        transport: "http",
                        method: "GET",
                        path: "/icon",
                        input: {},
                        response: { successStatuses: [200], contentTypes: ["image/svg+xml"], errorStatuses: {} },
                    },
                ],
            }),
            defineCapability({
                ...common,
                id: "private-svg",
                access: "admin",
                output: contractBinary({ maxBytes: 1024 }),
                bindings: [
                    {
                        id: "http",
                        transport: "http",
                        method: "GET",
                        path: "/private",
                        input: {},
                        response: { successStatuses: [200], contentTypes: ["image/svg+xml"], errorStatuses: {} },
                    },
                ],
            }),
        ],
    });
    const admission = await compileContract(feature);
    return {
        fingerprint: "selected",
        selected: [
            await resolveContract(
                { get: async () => null, findByDigest: async () => null, list: async () => [] },
                admission,
            ),
        ],
        denied: [],
    };
}

test("resource candidate bindings use current selected effect and deny grants without invoking services", async () => {
    const execution = await executionFixture();
    const target = { contractId: "acme/resources", capabilityId: "read", effect: "query" as const };
    const binding = resourcePreviewBindings(execution);
    expect((await binding.resolveCapabilities([target])).map(({ capabilityId }) => capabilityId)).toEqual(["read"]);
    for (const invalid of [
        { ...execution, selected: [] },
        { ...execution, denied: [{ contractId: target.contractId, capabilityId: target.capabilityId }] },
    ]) {
        await expect(resourcePreviewBindings(invalid).resolveCapabilities([target])).rejects.toThrow(
            "available selected",
        );
    }
    await expect(binding.resolveCapabilities([{ ...target, effect: "command" }])).rejects.toThrow("available selected");
    await expect(binding.resolveCapabilities([{ ...target, capabilityId: "svg" }])).rejects.toThrow(
        "available selected",
    );
});

test("resource candidate SVG references require an admitted public binary GET and respect deny grants", async () => {
    const execution = await executionFixture();
    const target = { contractId: "acme/resources", bindingPath: "/icon" };
    const binding = resourcePreviewBindings(execution);
    await binding.validateSvgCapabilities([target, target]);
    await expect(binding.validateSvgCapabilities([{ ...target, bindingPath: "/private" }])).rejects.toThrow(
        "public SVG GET",
    );
    await expect(binding.validateSvgCapabilities([{ ...target, bindingPath: "/missing" }])).rejects.toThrow(
        "public SVG GET",
    );
    await expect(
        resourcePreviewBindings({
            ...execution,
            denied: [{ contractId: target.contractId, capabilityId: "svg" }],
        }).validateSvgCapabilities([target]),
    ).rejects.toThrow("public SVG GET");
});
