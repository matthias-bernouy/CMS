import { expect, test } from "bun:test";
import { compileContract, compileImplementations } from "@bernouy/ulvia-sdk/build";
import { executeCapability } from "@bernouy/ulvia-sdk/local";
import { defineFeature, defineCapability, implementFeature, z } from "@bernouy/ulvia-sdk";
import { initializationFixture } from "../initialization/fixtures";
import { resourcesFeature } from "../../src/application/feature";

test("resource initialization is one generated feature with HTTP/MCP bindings, named mocks and scanned Markdown", async () => {
    const admission = await compileContract(resourcesFeature);
    expect(admission.release.contractId).toBe("ulvia/cms.resources");
    expect(admission.release.version).toBe("1.0.0");
    expect(admission.release.capabilities.map(({ id }) => id)).toEqual([
        "initialization.apply",
        "initialization.entry",
        "initialization.plan",
        "initialization.status",
    ]);
    expect(
        admission.release.capabilities.every(
            ({ bindings }) => bindings.map(({ transport }) => transport).join() === "http,mcp",
        ),
    ).toBe(true);
    expect(
        admission.release.capabilities.find(({ id }) => id === "initialization.entry")!.mocks?.map(({ id }) => id),
    ).toEqual(["pending", "completed"]);
    expect(admission.release.documentation?.map(({ path }) => path)).toEqual(["initialization.md"]);
    expect(Object.hasOwn(admission.release, "mapError")).toBe(false);
    expect(admission.release.capabilities.some((capability) => Object.hasOwn(capability, "execute"))).toBe(false);
    const implementation = implementFeature(resourcesFeature, {
        services: () => {
            throw new Error("Build must not construct services");
        },
    });
    const compiled = await compileImplementations([implementation]);
    expect(compiled.contracts[0]!.digest).toBe(admission.digest);
});

test("resource defaults preserve instance scope when inherited by a concrete specialized feature", async () => {
    const f = await initializationFixture();
    const feature = defineFeature({
        contractId: "example/custom-resources",
        publisherId: "example",
        name: "Custom resources",
        version: "1.0.0",
        extends: resourcesFeature,
        capabilities: [
            defineCapability({
                id: "custom.ready",
                description: "Inspect the specialized service",
                access: "public",
                behavior: { effect: "query", execution: "sync", sensitive: false },
                input: z.strictObject({}),
                output: z.boolean(),
                errors: {},
                bindings: [{ id: "mcp", transport: "mcp", tool: { name: "custom_resource_ready" } }],
                execute: () => true,
            }),
        ],
    });
    await compileContract(feature);
    const result = await executeCapability(feature, "initialization.entry", {
        input: {},
        services: {
            resources: {
                initialization: f.service,
                administrators: { resolve: async () => "admin", enabled: async () => true },
                operation: async () => ({ operationId: "", operationStatus: "none", errorMessage: "" }),
            },
        },
        context: {
            providerId: "example/provider",
            siteId: "site-a",
            contractVersion: "1.0.0",
            requestId: crypto.randomUUID(),
            invocation: { instanceId: "instance-a", contractId: feature.contractId, bindingId: "http" },
            signal: new AbortController().signal,
        },
    });
    expect(result).toEqual({ pending: true });
});
