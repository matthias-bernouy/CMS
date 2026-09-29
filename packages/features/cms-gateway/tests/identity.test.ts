import { expect, test } from "bun:test";
import { ProviderIdentityAliases } from "@bernouy/cms-gateway/identity";
import { InMemoryIdentityService } from "@bernouy/cms-gateway/identity";

test("one alias is reused for a user and provider across sites and installations", async () => {
    const identities = new ProviderIdentityAliases(new InMemoryIdentityService());
    const provider = { providerId: "ulvia.example" };
    const alias = await identities.getOrCreate(provider, "user-1");
    expect(await identities.getOrCreate({ ...provider }, "user-1")).toBe(alias);
    expect(await identities.resolve(provider, alias)).toBe("user-1");
    expect(await identities.getOrCreate({ providerId: "other.example" }, "user-1")).not.toBe(alias);
    expect(await identities.resolve({ providerId: "other.example" }, alias)).toBeNull();
});

test("gateway reuses a provider alias already bound by the Source identity store", async () => {
    const oldIdentities = new InMemoryIdentityService();
    await oldIdentities.bind("user-1", { authority: "commerce", kind: "user", value: 184 });
    const identities = new ProviderIdentityAliases(oldIdentities);
    expect(await identities.getOrCreate({ providerId: "commerce" }, "user-1")).toBe("184");
    expect(await identities.resolve({ providerId: "commerce" }, "184")).toBe("user-1");
    expect(await identities.resolve({ providerId: "commerce" }, 184)).toBe("user-1");
    expect(await oldIdentities.resolve({ authority: "cms", kind: "user", value: "user-1" }, "commerce")).toBe(184);
});

test("provider aliases reject unsafe IDs without replacing existing bindings", async () => {
    const oldIdentities = new InMemoryIdentityService();
    await oldIdentities.bind("user-1", { authority: "commerce", kind: "user", value: "bad\nheader" });
    const identities = new ProviderIdentityAliases(oldIdentities);
    await expect(identities.getOrCreate({ providerId: "commerce" }, "user-1")).rejects.toThrow("cannot be transmitted");
    await expect(identities.getOrCreate({ providerId: " cms" }, "user-1")).rejects.toThrow("provider ID");
});

test("numeric and string legacy aliases cannot collide in the gateway header", async () => {
    const oldIdentities = new InMemoryIdentityService();
    await oldIdentities.bind("user-1", { authority: "commerce", kind: "user", value: 184 });
    await oldIdentities.bind("user-2", { authority: "commerce", kind: "user", value: "184" });
    const identities = new ProviderIdentityAliases(oldIdentities);
    await expect(identities.getOrCreate({ providerId: "commerce" }, "user-1")).rejects.toThrow("ambiguous");
    await expect(identities.getOrCreate({ providerId: "commerce" }, "user-2")).rejects.toThrow("ambiguous");
    await expect(identities.resolve({ providerId: "commerce" }, "184")).rejects.toThrow("ambiguous");
});
