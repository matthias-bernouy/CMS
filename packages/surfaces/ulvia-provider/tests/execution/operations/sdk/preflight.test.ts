import { expect, test } from "bun:test";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { registerProviderHandlers } from "@bernouy/ulvia-sdk/provider";
import { compileImplementations } from "@bernouy/ulvia-sdk/build";
import { implementFeature, defineFeature, contractBinary } from "@bernouy/ulvia-sdk";
import type { ProviderOperationAdapter } from "@bernouy/ulvia-sdk/provider";
import { jobFeature } from "./feature";

const options = { providerId: "example/job-provider", scope: { siteId: "site-a", instanceId: "instance-a" } };
test("default operations require host durability and exact pins before any service projection or registration", async () => {
    let projections = 0;
    let registrations = 0;
    const feature = jobFeature();
    const build = await compileImplementations([
        implementFeature(feature, {
            services: () => {
                projections++;
                return { control: { allowed: true, fail: false, invalid: false, calls: [] } };
            },
        }),
    ]);
    const adapter: ProviderOperationAdapter = {
        register() {
            registrations++;
        },
        enqueue: async () => ({ operationId: crypto.randomUUID() }),
    };
    for (const extra of [
        {},
        {
            operations: adapter,
            implementations: [{ ...build.implementations[0]!, digest: `sha256:${"0".repeat(64)}` }],
        },
    ]) {
        const dispatcher = new DefaultProviderCapabilityDispatcher();
        expect(() => registerProviderHandlers(build, dispatcher, {}, { ...options, ...extra })).toThrow();
        dispatcher.seal([]);
    }
    expect(projections).toBe(0);
    expect(registrations).toBe(0);
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerProviderHandlers(build, dispatcher, {}, { ...options, implementations: [] });
    dispatcher.seal([]);
    expect(projections).toBe(0);
});

test("all selected service factories are prepared before the first dispatcher or operation registration", async () => {
    let registrations = 0;
    const first = jobFeature("1.0.0");
    const second = jobFeature("2.0.0");
    const build = await compileImplementations([
        implementFeature(first, {
            services: () => ({ control: { allowed: true, fail: false, invalid: false, calls: [] } }),
        }),
        implementFeature(second, {
            services: () => {
                throw new Error("Missing second service");
            },
        }),
    ]);
    const adapter: ProviderOperationAdapter = {
        register() {
            registrations++;
        },
        enqueue: async () => ({ operationId: crypto.randomUUID() }),
    };
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    expect(() => registerProviderHandlers(build, dispatcher, {}, { ...options, operations: adapter })).toThrow(
        "Missing second service",
    );
    dispatcher.seal([]);
    expect(registrations).toBe(0);
});

test("unsupported default durable binary schemas refuse before service factories or worker registration", async () => {
    let projections = 0;
    let registrations = 0;
    const feature = jobFeature();
    const unsupported = defineFeature({
        ...feature,
        capabilities: [{ ...feature.capabilities[0]!, output: contractBinary({ maxBytes: 4 }) }],
    });
    const build = await compileImplementations([
        implementFeature(unsupported, {
            services: () => {
                projections++;
                return { control: { allowed: true, fail: false, invalid: false, calls: [] } };
            },
        }),
    ]);
    const operations: ProviderOperationAdapter = {
        register() {
            registrations++;
        },
        enqueue: async () => ({ operationId: crypto.randomUUID() }),
    };
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    expect(() => registerProviderHandlers(build, dispatcher, {}, { ...options, operations })).toThrow(
        "JSON input and terminal output",
    );
    dispatcher.seal([]);
    expect(projections).toBe(0);
    expect(registrations).toBe(0);
});
