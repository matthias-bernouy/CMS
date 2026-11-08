import { expect, test } from "bun:test";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { loadOfficialFeatures, registerOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import { installationFixturePorts } from "./mount";

test("Installations pins and durable adapter are preflighted before service projection or worker registration", async () => {
    const build = await loadOfficialFeatures();
    const claim = build.implementations.find(({ contractId }) => contractId === "ulvia/cms.installations")!;
    let reads = 0;
    let registrations = 0;
    const ports = {
        get collections(): never {
            reads++;
            throw new Error("Unexpected projection");
        },
    };
    const options = { providerId: "ulvia/primary-provider", scope: { siteId: "default", instanceId: "instance-a" } };
    for (const claims of [
        [{ ...claim, digest: "sha256:" + "0".repeat(64) }],
        [{ ...claim, version: "1.1.0" }],
        [claim, claim],
        [{ ...claim, contractId: "example/unknown" }],
    ]) {
        const dispatcher = new DefaultProviderCapabilityDispatcher();
        await expect(
            registerOfficialFeatures(dispatcher, ports, claims, {
                ...options,
                operations: {
                    register: () => {
                        registrations++;
                    },
                    enqueue: async () => {
                        throw new Error("Unexpected receipt");
                    },
                },
            }),
        ).rejects.toThrow();
        dispatcher.seal([]);
    }
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    await expect(registerOfficialFeatures(dispatcher, ports, [claim], options)).rejects.toThrow(
        "durable operation adapter",
    );
    dispatcher.seal([]);
    expect(reads).toBe(0);
    expect(registrations).toBe(0);
});
test("a selected Installations claim refuses missing domain integrations without partially mounting handlers", async () => {
    const build = await loadOfficialFeatures();
    const claim = build.implementations.find(({ contractId }) => contractId === "ulvia/cms.installations")!;
    const full = installationFixturePorts();
    const required = [
        "collections",
        "collectionUpgrades",
        "gateway",
        "management",
        "documentation",
        "discovery",
        "operations",
    ] as const;
    for (const missing of required) {
        const dispatcher = new DefaultProviderCapabilityDispatcher();
        let registrations = 0;
        await expect(
            registerOfficialFeatures(dispatcher, { ...full, [missing]: undefined }, [claim], {
                providerId: "ulvia/primary-provider",
                scope: { siteId: "default", instanceId: "instance-a" },
                operations: {
                    register: () => {
                        registrations++;
                    },
                    enqueue: async () => {
                        throw new Error("Unexpected receipt");
                    },
                },
            }),
        ).rejects.toThrow("Installations requires injected");
        expect(registrations).toBe(0);
        dispatcher.seal([]);
    }
});
