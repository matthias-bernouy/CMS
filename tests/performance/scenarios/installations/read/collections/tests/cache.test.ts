import { performanceCapabilityInventory } from "../../../../../capabilities/inventory";
import { collectionStateModel } from "./model";
import { collectionReadState } from "../context/state";
import { expect, test } from "bun:test";
import { collectionCorpusCache } from "../context";
import type { QueryEnvironment } from "../../../../queries/execute";
import { collectionFixtureStage } from "../context/stage";
import { ClientFailure } from "../../../../../harness/clients/failure";

test("three owned corpus profiles coalesce pending loads per environment and retain tracked mutable state", async () => {
    const environment = {} as QueryEnvironment;
    const other = {} as QueryEnvironment;
    let calls = 0;
    const cache = collectionCorpusCache(async (_environment, profile) => ({ profile, counter: 0, id: ++calls }));
    const pending = cache(environment, "invalidation");
    expect(cache(environment, "invalidation")).toBe(pending);
    const state = await pending;
    state.counter++;
    expect((await cache(environment, "invalidation")).counter).toBe(1);
    await Promise.all([cache(environment, "large"), cache(environment, "history")]);
    expect(calls).toBe(3);
    expect(await cache(other, "invalidation")).not.toBe(state);
    expect(calls).toBe(4);
    expect(() => cache(environment, "unknown")).toThrow("profile");
    expect(calls).toBe(4);
});

test("fixture diagnostics retain only explicit phase/client codes, never arbitrary error messages", async () => {
    await expect(
        collectionFixtureStage("registry", async () => {
            throw new Error("private-example-password");
        }),
    ).rejects.toThrow("collection-fixture-registry-internal");
    try {
        await collectionFixtureStage("registry", async () => {
            throw new Error("private-example-password");
        });
    } catch (error) {
        expect(String(error)).not.toContain("private-example-password");
    }
    await expect(
        collectionFixtureStage("registry", async () => {
            throw new ClientFailure("known-code");
        }),
    ).rejects.toThrow("collection-fixture-registry-known-code");
});

test("a failed corpus stays latched so unknown mutation outcomes cannot trigger a fresh implicit publication", async () => {
    const environment = {} as QueryEnvironment;
    let calls = 0;
    const cache = collectionCorpusCache(async () => {
        calls++;
        throw new Error("unit unknown write outcome");
    });
    const pending = cache(environment, "invalidation");
    await expect(pending).rejects.toThrow("unknown write");
    expect(cache(environment, "invalidation")).toBe(pending);
    await expect(cache(environment, "invalidation")).rejects.toThrow("unknown write");
    expect(calls).toBe(1);
});

test("unknown publication or installation outcomes latch the corpus and prevent implicit writes in later reader cases", async () => {
    const inventory = await performanceCapabilityInventory();
    for (const failing of ["publish", "install"]) {
        const { state: original } = await collectionStateModel(inventory);
        const resource = await original.create(0, 0);
        let publications = 0;
        let installations = 0;
        const fixture: typeof original.tenant.fixture = async (capability, input, contract) => {
            if (capability === "install-collections") {
                installations++;
                throw new Error("Unit unknown installation result");
            }
            return original.tenant.fixture(capability, input, contract);
        };
        const state = collectionReadState({
            tenant: { ...original.tenant, fixture },
            registry: {
                ...original.registry,
                async publish() {
                    publications++;
                    if (failing === "publish") {
                        throw new Error("Unit unknown publication result");
                    }
                },
            },
            repositoryId: original.repositoryId,
            namespace: original.namespace,
            namespaceRevision: 1,
            revision: 0,
            create: original.create,
        });
        if (failing === "publish") {
            await expect(state.publish(resource)).rejects.toThrow("unknown publication");
            expect(state.resources).toHaveLength(0);
        } else {
            await state.publish(resource);
            await expect(state.install([resource])).rejects.toThrow("unknown installation");
            expect(state.installed.size).toBe(0);
        }
        await expect(state.publish(resource)).rejects.toThrow("unknown-write-outcome");
        await expect(state.install([resource])).rejects.toThrow("unknown-write-outcome");
        expect(publications).toBe(1);
        expect(installations).toBe(failing === "publish" ? 0 : 1);
        expect(state.revision()).toBe(0);
    }
});
