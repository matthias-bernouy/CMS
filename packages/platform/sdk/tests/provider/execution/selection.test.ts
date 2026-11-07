import { notesProviderDefinition } from "../../../examples/provider";
import { unitProvider } from "../support/runtime";
import { expect, test } from "bun:test";
import { defineCapability, defineFeature, implementFeature, z } from "@bernouy/ulvia-sdk";
import { compileProvider, compileImplementations } from "@bernouy/ulvia-sdk/build";
import { registerProviderHandlers } from "@bernouy/ulvia-sdk/provider";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/cms-gateway/provider/server";

const scope = { siteId: "site-test", instanceId: "instance-test" };
const options = { providerId: "example/provider", scope };

async function fixture() {
    const mounted: string[] = [];
    const sources = [false, true].map((keyed) => {
        const id = keyed ? "send" : "read";
        const behavior = keyed
            ? ({ effect: "command", execution: "sync", sensitive: false, idempotency: "keyed" } as const)
            : ({ effect: "query", execution: "sync", sensitive: false } as const);
        const capability = defineCapability({
            id,
            access: "public",
            behavior,
            bindings: [
                {
                    id: "http",
                    transport: "http",
                    method: keyed ? "POST" : "GET",
                    path: `/${id}`,
                    response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: {} },
                },
            ],
            input: z.strictObject({}),
            output: z.boolean(),
            errors: {},
            execute: () => true,
        });
        return implementFeature(
            defineFeature({
                contractId: `example/${id}`,
                name: id,
                publisherId: "example",
                version: "1.0.0",
                capabilities: [capability],
            }),
            {
                services: (_dependencies: {}) => {
                    mounted.push(id);
                    return {};
                },
            },
        );
    });
    return { build: await compileImplementations(sources), mounted };
}

test("exact subset mounting constructs only selected services and does not require unselected durable adapters", async () => {
    const { build, mounted } = await fixture();
    const read = build.implementations.find(({ contractId }) => contractId === "example/read")!;
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerProviderHandlers(build, dispatcher, {}, { ...options, implementations: [read] });
    expect(mounted).toEqual(["read"]);
    dispatcher.seal(build.implementedContracts.filter(({ release }) => release.contractId === read.contractId));
    expect(
        await dispatcher.invoke(
            read.contractId,
            "read",
            {},
            {
                requestId: crypto.randomUUID(),
                providerId: options.providerId,
                siteId: scope.siteId,
                contractVersion: read.version,
                invocation: { contractId: read.contractId, instanceId: scope.instanceId },
            },
        ),
    ).toBe(true);
    await expect(
        dispatcher.invoke(
            "example/send",
            "send",
            {},
            {
                requestId: crypto.randomUUID(),
                providerId: options.providerId,
                siteId: scope.siteId,
                contractVersion: "1.0.0",
            },
        ),
    ).rejects.toMatchObject({ code: "CAPABILITY_NOT_FOUND" });
});

test("unapproved versions, digests, unknown releases and duplicate claims refuse before mounting", async () => {
    const { build, mounted } = await fixture();
    const read = build.implementations[0]!;
    for (const implementations of [
        [{ ...read, version: "1.1.0" }],
        [{ ...read, digest: `sha256:${"0".repeat(64)}` }],
        [{ ...read, contractId: "example/unknown" }],
        [read, read],
        [read, read, read],
    ]) {
        const dispatcher = new DefaultProviderCapabilityDispatcher();
        expect(() => registerProviderHandlers(build, dispatcher, {}, { ...options, implementations })).toThrow();
        dispatcher.seal([]);
    }
    expect(mounted).toEqual([]);
});

test("empty selection mounts nothing while the full default still requires durable execution", async () => {
    const { build, mounted } = await fixture();
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerProviderHandlers(build, dispatcher, {}, { ...options, implementations: [] });
    dispatcher.seal([]);
    expect(() => registerProviderHandlers(build, new DefaultProviderCapabilityDispatcher(), {}, options)).toThrow(
        "durable",
    );
    expect(mounted).toEqual([]);
});

test("a complete Provider cannot hide manifest implementations through extra JavaScript options", async () => {
    const build = await compileProvider(notesProviderDefinition("http://127.0.0.1:5103"));
    const extraOptions = { implementations: [], authorize: async () => true };
    const runtime = unitProvider(build, { notes: { read: async (id) => ({ id, text: "Visible" }) } }, extraOptions);
    const response = await runtime.call("example/notes", "notes.read", "/notes/welcome");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "welcome", text: "Visible" });
});
