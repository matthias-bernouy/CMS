import { expect, test } from "bun:test";
import { discoveryContexts } from "../context";
import type { QueryEnvironment } from "../../../queries/execute";

function environment(): QueryEnvironment {
    const session = {
        origin: "http://registry.localhost:5101",
        cookie: "unit",
        token: "unit",
        tools: [],
        subjectId: "unit",
    };
    return {
        main: session,
        registry: session,
        stack: {
            id: "unit",
            providerName: "unit",
            edgeName: "unit",
            instanceId: "unit",
            restartProvider: async () => {},
        },
    };
}

test("shared discovery corpora coalesce pending loads by environment/profile; invalidation and recipes never reuse mutable state", async () => {
    const env = environment();
    let loads = 0;
    const get = discoveryContexts(async (_env, profile, bootstrap) => ({ id: ++loads, profile, bootstrap }));
    const first = get(env, "large");
    const second = get(env, "large");
    expect(first).toBe(second);
    expect((await first).id).toBe(1);
    expect((await get(env, "history")).id).toBe(2);
    expect((await get(environment(), "large")).id).toBe(3);
    expect((await get(env, "invalidation")).id).not.toBe((await get(env, "invalidation")).id);
    expect((await get(env, "invalidation", true)).bootstrap).toBe(true);
    expect(() => get(env, "large", true)).toThrow("registry-discovery-context-profile");
});

test("failed discovery corpus loads remain latched so unknown publication outcomes are never retried automatically", async () => {
    let loads = 0;
    const get = discoveryContexts(async () => {
        loads++;
        throw Error("controlled corpus failure");
    });
    const env = environment();
    await expect(get(env, "history")).rejects.toThrow("controlled corpus failure");
    await expect(get(env, "history")).rejects.toThrow("controlled corpus failure");
    expect(loads).toBe(1);
});
