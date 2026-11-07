import { expect, test } from "bun:test";
import { ProviderIdentityAliases, InMemoryIdentityService } from "@bernouy/cms-gateway/identity";

test("one string alias is reused across sites and installations with one lookup per resolution", async () => {
    const store = new InMemoryIdentityService();
    const original = store.resolve.bind(store);
    let reads = 0;
    store.resolve = async (...args) => {
        reads++;
        return original(...args);
    };
    const identities = new ProviderIdentityAliases(store);
    const provider = { providerId: "ulvia/ulvia.example" };
    const alias = await identities.getOrCreate(provider, "user-1");
    expect(await identities.getOrCreate({ ...provider }, "user-1")).toBe(alias);
    reads = 0;
    expect(await identities.resolve(provider, alias)).toBe("user-1");
    expect(reads).toBe(1);
    expect(await identities.getOrCreate({ providerId: "ulvia/other.example" }, "user-1")).not.toBe(alias);
    expect(await identities.resolve({ providerId: "ulvia/other.example" }, alias)).toBeNull();
});

test("numeric Source aliases are refused without changing the existing identity binding", async () => {
    const store = new InMemoryIdentityService();
    await store.bind("user-1", { authority: "ulvia/commerce", kind: "user", value: 184 });
    const identities = new ProviderIdentityAliases(store);
    const scope = { providerId: "ulvia/commerce" };
    await expect(identities.getOrCreate(scope, "user-1")).rejects.toThrow("must be a transmissible string");
    await expect(identities.resolve(scope, 184 as never)).rejects.toThrow("must be a transmissible string");
    expect(await identities.resolve(scope, "184")).toBeNull();
    expect(await store.resolve({ authority: "cms", kind: "user", value: "user-1" }, "ulvia/commerce")).toBe(184);
});

test("provider aliases reject unsafe IDs without replacing existing bindings", async () => {
    const store = new InMemoryIdentityService();
    await store.bind("user-1", { authority: "ulvia/commerce", kind: "user", value: "bad\nheader" });
    const identities = new ProviderIdentityAliases(store);
    await expect(identities.getOrCreate({ providerId: "ulvia/commerce" }, "user-1")).rejects.toThrow("transmissible");
    await expect(identities.getOrCreate({ providerId: " cms" }, "user-1")).rejects.toThrow("provider ID");
});

test("string aliases resolve exactly without probing numeric identity variants", async () => {
    const store = new InMemoryIdentityService();
    await store.bind("user-1", { authority: "ulvia/commerce", kind: "user", value: 184 });
    await store.bind("user-2", { authority: "ulvia/commerce", kind: "user", value: "184" });
    const identities = new ProviderIdentityAliases(store);
    expect(await identities.getOrCreate({ providerId: "ulvia/commerce" }, "user-2")).toBe("184");
    expect(await identities.resolve({ providerId: "ulvia/commerce" }, "184")).toBe("user-2");
});
