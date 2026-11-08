import { expect, test } from "bun:test";
import { compileOfficialFeatures } from "@bernouy/ulvia-provider/build";
import { registerOfficialFeatures, loadOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";

const options = { providerId: "ulvia/primary-provider", scope: { siteId: "default", instanceId: "instance-a" } };

test("published instance discovery remains a template with no executable claim or mounted route", async () => {
    const build = await compileOfficialFeatures();
    const id = "ulvia/provider.cms-instances";
    const contract = build.contracts.find(({ release }) => release.contractId === id)!;
    expect(contract.release.capabilities.map(({ id }) => id).sort()).toEqual(["get-current", "list"]);
    expect(build.implementations.some(({ contractId }) => contractId === id)).toBe(false);
    expect(build.implementedContracts.some(({ release }) => release.contractId === id)).toBe(false);
    const runtime = await loadOfficialFeatures();
    expect(runtime.contracts.find(({ release }) => release.contractId === id)!.canonicalJson).toBe(
        contract.canonicalJson,
    );
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    await expect(
        registerOfficialFeatures(
            dispatcher,
            {},
            [{ contractId: id, version: contract.release.version, digest: contract.digest }],
            options,
        ),
    ).rejects.toThrow("Unsupported");
    dispatcher.seal([]);
});

test("connection mounting rejects missing services and wrong pins before projecting services or writing handlers", async () => {
    const build = await loadOfficialFeatures();
    const pin = build.implementations.find(({ contractId }) => contractId === "ulvia/provider.connections")!;
    let reads = 0;
    const services = {
        get providerConnections(): never {
            reads++;
            throw new Error("No service projection before exact admission");
        },
    };
    for (const pins of [[{ ...pin, version: "1.1.0" }], [{ ...pin, digest: `sha256:${"0".repeat(64)}` }], [pin, pin]]) {
        const dispatcher = new DefaultProviderCapabilityDispatcher();
        await expect(registerOfficialFeatures(dispatcher, services, pins, options)).rejects.toThrow();
        dispatcher.seal([]);
    }
    expect(reads).toBe(0);
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    await expect(registerOfficialFeatures(dispatcher, {}, [pin], options)).rejects.toThrow("injected return-channel");
    dispatcher.seal([]);
});
