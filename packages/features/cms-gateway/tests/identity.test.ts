import { expect, test } from "bun:test";
import { InMemoryInstallationIdentityService } from "@bernouy/cms-gateway/identity";

test("pairwise aliases are stable per installation and removed on revoke", async () => {
    const identities = new InMemoryInstallationIdentityService();
    const first = { siteId: "site-a", installationId: "install-a" };
    const second = { siteId: "site-a", installationId: "install-b" };
    const alias = await identities.getOrCreate(first, "user-1");
    expect(await identities.getOrCreate(first, "user-1")).toBe(alias);
    expect(await identities.getOrCreate(second, "user-1")).not.toBe(alias);
    expect(await identities.resolve(first, alias)).toBe("user-1");
    expect(await identities.resolve(second, alias)).toBeNull();
    await identities.revoke(first);
    expect(await identities.resolve(first, alias)).toBeNull();
    expect(await identities.getOrCreate(first, "user-1")).not.toBe(alias);
});

test("scope IDs reject whitespace variants", async () => {
    const identities = new InMemoryInstallationIdentityService();
    await expect(
        identities.getOrCreate({ siteId: " site-a", installationId: "install-a" }, "user-1"),
    ).rejects.toThrow();
    await expect(identities.resolve({ siteId: "site-a", installationId: "install-a " }, "alias")).rejects.toThrow();
});
