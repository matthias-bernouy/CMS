import { expect, test } from "bun:test";
import { implementFeature } from "@bernouy/ulvia-sdk";
import { compileImplementations, createImplementationArtifact } from "@bernouy/ulvia-sdk/build";
import { loadImplementations, registerProviderHandlers } from "@bernouy/ulvia-sdk/provider";
import type { ProviderOperationRegistration, ProviderOperationAdapter } from "@bernouy/ulvia-sdk/provider";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { jobFeature, contractId, providerId } from "./feature";

test("runtime artifacts attach default operation code and exact worker metadata without invoking business services", async () => {
    const feature = jobFeature();
    const implementation = implementFeature(feature);
    const build = await compileImplementations([implementation]);
    const artifact = createImplementationArtifact(build);
    const loaded = await loadImplementations([implementation], artifact);
    const control = { allowed: true, fail: false, invalid: false, calls: [] as string[] };
    let registered: ProviderOperationRegistration | undefined;
    const operations: ProviderOperationAdapter = {
        register(operation) {
            registered = operation;
        },
        enqueue: async () => {
            throw new Error("No queue call during runtime attachment");
        },
    };
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerProviderHandlers(
        loaded,
        dispatcher,
        { control },
        { providerId, scope: { siteId: "site-a", instanceId: "instance-a" }, operations },
    );
    expect(control.calls).toEqual([]);
    expect(registered!.versions[0]!.digest).toBe(loaded.implementations[0]!.digest);
    expect(Object.isFrozen(registered!.versions[0]!.capability)).toBe(true);
    expect(
        await registered!.execute(
            { value: "test" },
            {
                requestId: crypto.randomUUID(),
                contractVersion: "1.0.0",
                providerId,
                siteId: "site-a",
                invocation: { contractId, instanceId: "instance-a", bindingId: "review" },
                requestContext: { headers: { "accept-language": "fr" } },
            },
        ),
    ).toEqual({ marker: "1.0.0" });
    expect(control.calls).toEqual(["1.0.0"]);
});
