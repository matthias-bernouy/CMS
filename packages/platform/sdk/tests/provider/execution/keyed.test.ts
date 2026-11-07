import { expect, test } from "bun:test";
import { defineContract, defineOperation, implementContract, z } from "@bernouy/ulvia-sdk";
import { compileProvider } from "@bernouy/ulvia-sdk/build";
import { createProvider } from "@bernouy/ulvia-sdk/provider";
import { notesProviderDefinition } from "../../../examples/provider";
import { unitProvider } from "../support/runtime";

const command = defineContract({
    contractId: "example/flag",
    name: "Flag",
    publisherId: "example",
    version: "1.0.0",
    capabilities: {
        "flag.set": {
            operation: defineOperation({
                input: z.strictObject({ flag: z.boolean() }),
                output: z.boolean(),
                errors: {},
            }),
            access: "admin",
            behavior: { effect: "command", execution: "sync", sensitive: false, idempotency: "keyed" },
            bindings: [
                {
                    id: "http",
                    transport: "http",
                    method: "POST",
                    path: "/flag",
                    input: { body: true },
                    response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: {} },
                },
            ],
        },
    },
});

test("keyed commands require an explicit durable execution port before handlers are initialized", async () => {
    let initialized = 0;
    const base = notesProviderDefinition("http://127.0.0.1:5103");
    const build = await compileProvider({
        ...base,
        implementations: [
            implementContract(command, {
                "flag.set": (_dependencies: {}) => {
                    initialized++;
                    return (input) => input.flag;
                },
            }),
        ],
    });
    expect(() =>
        createProvider(
            build,
            {},
            {
                scope: { siteId: "site-test", instanceId: "instance:test" },
                authenticate: async () => null,
                authorize: async () => true,
            },
        ),
    ).toThrow("durable");
    expect(initialized).toBe(0);
});

test("trusted keyed execution receives complete scope and refusal leaves business state unchanged", async () => {
    let writes = 0;
    const receipts = new Map<string, { input: string; result: unknown }>(); // Test double for the required durable host port.
    const base = notesProviderDefinition("http://127.0.0.1:5103");
    const build = await compileProvider({
        ...base,
        implementations: [
            implementContract(command, {
                "flag.set": (_dependencies: {}) => (input) => {
                    writes++;
                    return input.flag;
                },
            }),
        ],
    });
    const runtime = unitProvider(
        build,
        {},
        {
            executeKeyed: async (invocation, execute) => {
                expect(invocation.instanceId).toBe("instance:test");
                expect(invocation.siteId).toBe("site-test");
                const key = [
                    invocation.providerId,
                    invocation.instanceId,
                    invocation.siteId,
                    invocation.contractId,
                    invocation.version,
                    invocation.capabilityId,
                    invocation.key,
                ].join("/");
                const input = JSON.stringify(invocation.input);
                const previous = receipts.get(key);
                if (previous) {
                    if (previous.input !== input) {
                        throw new Error("Key reused for a different input");
                    }
                    return previous.result;
                }
                const result = await execute();
                receipts.set(key, { input, result });
                return result;
            },
        },
    );
    const call = (body: string, key?: string) =>
        runtime.call("example/flag", "flag.set", "/flag", {
            method: "POST",
            body,
            headers: { "content-type": "application/json", ...(key ? { "idempotency-key": key } : {}) },
        });
    expect((await call('{"flag":true}')).status).toBe(400);
    expect((await call('{"flag":"wrong"}', "request-1")).status).toBe(400);
    expect(writes).toBe(0);
    expect(await (await call('{"flag":true}', "request-1")).json()).toBe(true);
    expect(await (await call('{"flag":true}', "request-1")).json()).toBe(true);
    expect(writes).toBe(1);
    expect((await call('{"flag":false}', "request-1")).status).toBe(503);
    expect(writes).toBe(1);
});
