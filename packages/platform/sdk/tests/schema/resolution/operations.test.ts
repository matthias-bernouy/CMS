import { expect, test } from "bun:test";
import { defineFeature, implementFeature } from "@bernouy/ulvia-sdk";
import { compileProvider } from "@bernouy/ulvia-sdk/build";
import { executeCapability } from "@bernouy/ulvia-sdk/local";
import type { ProviderOperationRegistration, ProviderOperationInvocation } from "@bernouy/ulvia-sdk/provider";
import { resolveSchema } from "@bernouy/ulvia-contracts/resolution";
import type { SchemaResolutionOptions } from "@bernouy/ulvia-contracts/resolution";
import { unitProvider } from "../../provider/support/runtime";
import { dynamicFixture, value } from "./fixture";

test("restored default operations validate dynamic DTOs with stored scope before execution and refuse a missing resolution port", async () => {
    const f = dynamicFixture();
    const original = f.capability;
    const capability = {
        ...original,
        behavior: { effect: "command", execution: "operation", idempotency: "natural", sensitive: false } as const,
        bindings: [
            {
                ...original.bindings[0],
                method: "POST",
                response: { ...original.bindings[0].response, successStatuses: [202] },
            },
        ] as const,
    };
    const feature = defineFeature({ ...f.feature, capabilities: [f.resolver, capability] });
    const build = await compileProvider({ ...f.provider, implementations: [implementFeature(feature)] });
    let worker: ProviderOperationRegistration | undefined;
    let pending: ProviderOperationInvocation | undefined;
    const operations = {
        register: (operation: ProviderOperationRegistration) => {
            worker = operation;
        },
        enqueue: async (invocation: ProviderOperationInvocation) => {
            pending = invocation;
            return { operationId: "00000000-0000-4000-8000-000000000001" };
        },
    };
    expect(() => unitProvider(build, {}, { schemaVersions: f.versions, operations })).toThrow(
        "schema resolution authority",
    );
    const host = unitProvider(
        build,
        {},
        {
            schemaVersions: f.versions,
            operations,
            resolveSchema: async (_capability, schema, selected, input, context) => {
                const options: SchemaResolutionOptions = {
                    capabilities: build.contracts[0]!.release.capabilities,
                    input,
                    seal: (resolver, descriptor) =>
                        f.versions.seal(
                            {
                                siteId: context.siteId,
                                instanceId: context.invocation!.instanceId,
                                installationId: context.connectionId!,
                                providerId: context.providerId,
                                contractId: feature.contractId,
                                resolverId: resolver.id,
                            },
                            descriptor,
                        ),
                    invoke: (_resolver, query) =>
                        executeCapability(f.resolver, {
                            input: query,
                            context,
                            services: {},
                            schemaResolution: options,
                        }),
                };
                return (await resolveSchema(schema, selected, options)).schema;
            },
        },
    );
    const response = await host.call(feature.contractId, capability.id, "/read", {
        method: "POST",
        body: JSON.stringify(value),
        headers: { "content-type": "application/json" },
    });
    expect(response.status).toBe(202);
    expect(f.state.calls).toBe(0);
    const { http: _http, ...stored } = pending!.context;
    await expect(worker!.execute({ ...value, payload: { email: 42 } }, stored)).rejects.toThrow();
    expect(f.state.calls).toBe(0);
    expect(await worker!.execute(pending!.input, stored)).toEqual({ echo: value.payload });
    expect(f.state.calls).toBe(1);
    f.state.malformedOutput = true;
    await expect(worker!.execute(pending!.input, stored)).rejects.toThrow();
    await expect(worker!.execute(pending!.input, { ...stored, siteId: "foreign" })).rejects.toThrow("Provider scope");
});
