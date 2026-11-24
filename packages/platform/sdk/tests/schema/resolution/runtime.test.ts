import { defineFeature, implementFeature } from "@bernouy/ulvia-sdk";
import { expect, test } from "bun:test";
import { compileContract, compileProvider } from "@bernouy/ulvia-sdk/build";
import { executeCapability } from "@bernouy/ulvia-sdk/local";
import { unitProvider } from "../../provider/support/runtime";
import { dynamicFixture, value } from "./fixture";
import type { SchemaResolutionOptions } from "@bernouy/ulvia-contracts/resolution";
const context = { requestId: "local", contractVersion: "1.0.0", siteId: "site", providerId: "example/provider" };

test("local execution requires a resolver authority, validates dynamic inputs before execution and validates dynamic results", async () => {
    const f = dynamicFixture();
    const contract = await compileContract(f.feature);
    await expect(executeCapability(f.capability, { input: value, services: {}, context })).rejects.toThrow(
        "resolution authority",
    );
    expect(f.state.calls).toBe(0);
    const resolution: SchemaResolutionOptions = {
        capabilities: contract.release.capabilities,
        seal: (resolver, descriptor) =>
            f.versions.seal(
                {
                    siteId: "site",
                    providerId: "example/provider",
                    instanceId: "instance",
                    installationId: "local-installation",
                    contractId: f.feature.contractId,
                    resolverId: resolver.id,
                },
                descriptor,
            ),
        invoke: (_resolver, input) =>
            executeCapability(f.resolver, { input, services: {}, context, schemaResolution: resolution }),
    };
    await expect(
        executeCapability(f.capability, {
            input: { ...value, payload: { email: 42 } },
            services: {},
            context,
            schemaResolution: resolution,
        }),
    ).rejects.toThrow();
    expect(f.state.calls).toBe(0);
    expect(
        await executeCapability(f.capability, { input: value, services: {}, context, schemaResolution: resolution }),
    ).toEqual({ echo: value.payload });
    f.state.malformedOutput = true;
    await expect(
        executeCapability(f.capability, { input: value, services: {}, context, schemaResolution: resolution }),
    ).rejects.toThrow();
});

test("Provider receiver rechecks resolver policy and guards, refuses invalid data and seals direct resolver queries", async () => {
    const f = dynamicFixture();
    const build = await compileProvider(f.provider);
    expect(() => unitProvider(build, {})).toThrow("durable version store");
    let denyHostResolver = false;
    const host = unitProvider(
        build,
        {},
        {
            schemaVersions: f.versions,
            authorize: async (claims) => !(denyHostResolver && claims.capabilityId === f.resolver.id),
        },
    );
    const call = (input: unknown) =>
        host.call(f.feature.contractId, "read", "/read", {
            method: "QUERY",
            body: JSON.stringify(input),
            headers: { "content-type": "application/json" },
        });
    expect((await call({ ...value, payload: { email: 42 } })).status).toBe(400);
    expect(f.state.calls).toBe(0);
    expect(await (await call(value)).json()).toEqual({ echo: value.payload });
    expect(f.state.calls).toBe(1);
    denyHostResolver = true;
    expect((await call(value)).status).toBe(503);
    denyHostResolver = false;
    f.state.denyResolver = true;
    expect((await call(value)).status).toBe(503);
    expect(f.state.calls).toBe(1);
    f.state.denyResolver = false;
    f.state.malformedOutput = true;
    expect((await call(value)).status).toBe(503);
    f.state.changed = true;
    const conflict = await host.call(f.feature.contractId, f.resolver.id, "/schema", {
        method: "QUERY",
        body: JSON.stringify({ selectorJson: '{"formId":"contact"}', version: "1" }),
        headers: { "content-type": "application/json" },
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: { code: "SCHEMA_VERSION_CONFLICT" } });
});

test("an invalid streamed resolver result is cancelled before the consuming capability executes", async () => {
    const f = dynamicFixture();
    let cancelled = false;
    const response = new Response(
        new ReadableStream({
            cancel: () => {
                cancelled = true;
            },
        }),
    );
    const resolver = { ...f.resolver, execute: () => response as never };
    const feature = defineFeature({ ...f.feature, capabilities: [resolver, f.capability] });
    const build = await compileProvider({ ...f.provider, implementations: [implementFeature(feature)] });
    const host = unitProvider(build, {}, { schemaVersions: f.versions });
    const result = await host.call(feature.contractId, "read", "/read", {
        method: "QUERY",
        body: JSON.stringify(value),
        headers: { "content-type": "application/json" },
    });
    expect(result.status).toBe(503);
    expect(cancelled).toBe(true);
    expect(f.state.calls).toBe(0);
});
