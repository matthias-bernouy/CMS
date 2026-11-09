import {
    MemoryProviderOperationStore,
    ProviderOperationExecutor,
    createProviderOperationAdapter,
} from "@bernouy/ulvia-provider";
import { expect, test } from "bun:test";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { registerOfficialFeatures, loadOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import { RepositoryCapabilityError } from "@bernouy/repository/repository/capabilities";
import { repositoryTransport } from "./transport";
import { repositoryServices } from "./services";

test("Repository mounting requires its exact pin and services while unselected profiles require neither", async () => {
    const build = await loadOfficialFeatures();
    const pin = build.implementations.find(({ contractId }) => contractId === "ulvia/repository")!;
    const options = {
        operations: createProviderOperationAdapter(new ProviderOperationExecutor(new MemoryProviderOperationStore())),
        providerId: "ulvia/primary-provider",
        scope: { siteId: "default", instanceId: "instance-a" },
    };
    let reads = 0;
    const services = {
        get repository(): never {
            reads++;
            throw new Error("No service projection before admission");
        },
    };
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    await expect(
        registerOfficialFeatures(dispatcher, services, [{ ...pin, digest: `sha256:${"0".repeat(64)}` }], options),
    ).rejects.toThrow();
    expect(reads).toBe(0);
    await expect(registerOfficialFeatures(dispatcher, {}, [pin], options)).rejects.toThrow("injected domain services");
    await registerOfficialFeatures(dispatcher, {}, []);
    dispatcher.seal([]);
});

test("Repository public error classification preserves declared refusals and conceals technical details", async () => {
    for (const [error, status, code] of [
        [new RepositoryCapabilityError("NOT_FOUND"), 404, "NOT_FOUND"],
        [new RepositoryCapabilityError("REJECTED"), 409, "REJECTED"],
        [new Error("private-path-or-token"), 503, "CORE_UNAVAILABLE"],
    ] as const) {
        const call = await repositoryTransport(
            repositoryServices({
                reads: {
                    info: async () => {
                        throw error;
                    },
                },
            }),
        );
        const response = await call("repository-info", {});
        expect(response.status).toBe(status);
        const text = await response.text();
        expect(text).toContain(code);
        expect(text).not.toContain("private-path-or-token");
    }
});

test("the public SDK collection catalogue forwards a bounded query and its signal without resolving an account", async () => {
    const controller = new AbortController();
    const calls: unknown[] = [];
    const call = await repositoryTransport(
        repositoryServices({
            reads: {
                collectionCatalogue: async (input, signal) => {
                    calls.push(input);
                    expect(signal).toBe(controller.signal);
                    return { releases: [] };
                },
            },
        }),
        async () => {
            throw new Error("Public catalogue cannot resolve account authority");
        },
    );
    const response = await call(
        "collection-catalogue",
        { limit: 25, channel: "stable" },
        { signal: controller.signal, claims: { actorKind: "anonymous", subjectId: undefined } },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ releases: [] });
    expect(calls).toEqual([{ limit: 25, channel: "stable" }]);
    expect((await call("collection-catalogue", { limit: 257 })).status).toBe(400);
    expect(calls).toHaveLength(1);
});
