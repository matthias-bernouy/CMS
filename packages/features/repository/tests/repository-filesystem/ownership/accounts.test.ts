import { expect, test } from "bun:test";
import { mongo, ownershipFixture } from "./fixture";

test.skipIf(!mongo)(
    "Mongo namespaces preserve account ownership, revisions, suspension and private owner IDs",
    async () => {
        const f = await ownershipFixture();
        try {
            const first = await f.namespaces.claim("account-a", "shop.components");
            expect(first).toMatchObject({ namespace: "shop.components", revision: 1, state: "active" });
            expect(first).not.toHaveProperty("ownerAccountId");
            expect(await f.namespaces.claim("account-a", "shop.components")).toEqual(first);
            expect((await f.store.get("shop.components"))?.ownerAccountId).toBe("account-a");
            let writes = 0;
            const publication = async () => ++writes;
            await expect(f.namespaces.execute("account-b", "shop.components", 1, publication)).rejects.toThrow("stale");
            await expect(f.namespaces.execute("account-a", "shop.components", 2, publication)).rejects.toThrow("stale");
            await expect(f.namespaces.claim("account-a", "../outside")).rejects.toThrow("Invalid repository namespace");
            await expect(f.namespaces.claim("absent-account", "unclaimed")).rejects.toThrow("unavailable");
            await expect(f.namespaces.transfer("account-b", "shop.components", 1, "account-a")).rejects.toThrow(
                "stale",
            );
            await expect(f.namespaces.transfer("account-a", "shop.components", 1, "absent-account")).rejects.toThrow(
                "unavailable",
            );
            await expect(f.namespaces.withoutOwnedNamespaces("account-a", publication)).rejects.toThrow(
                "Transfer owned",
            );
            expect(writes).toBe(0);
            expect(await f.namespaces.get("shop.components")).toEqual(first);

            const transferred = await f.namespaces.transfer("account-a", "shop.components", 1, "account-b");
            expect(transferred.revision).toBe(2);
            await expect(f.namespaces.execute("account-a", "shop.components", 1, publication)).rejects.toThrow("stale");
            await expect(f.namespaces.execute("account-b", "shop.components", 1, publication)).rejects.toThrow("stale");
            expect(await f.namespaces.execute("account-b", "shop.components", 2, publication)).toBe(1);
            expect(await f.namespaces.listOwned("account-a")).toEqual([]);
            expect(await f.namespaces.listOwned("account-b")).toEqual([transferred]);

            const suspended = await f.namespaces.suspend("account-b", "shop.components", 2);
            expect(suspended).toMatchObject({ state: "suspended", revision: 3 });
            await expect(f.namespaces.claim("account-a", "shop.components")).rejects.toThrow("reserved");
            await expect(f.namespaces.execute("account-b", "shop.components", 3, publication)).rejects.toThrow("stale");
            expect(writes).toBe(1);
            const reserved = await f.namespaces.transfer("account-b", "shop.components", 3, "account-a");
            expect(reserved).toMatchObject({ state: "suspended", revision: 4 });
            await f.namespaces.withoutOwnedNamespaces("account-b", async () => f.accounts.delete("account-b"));
            expect(f.accounts.has("account-b")).toBe(false);
            f.accounts.delete("account-a");
            f.accounts.add("account-b");
            await expect(f.namespaces.claim("account-b", "shop.components")).rejects.toThrow("reserved");
            await expect(f.namespaces.withoutOwnedNamespaces("account-a", publication)).rejects.toThrow(
                "Transfer owned",
            );
            expect(await f.namespaces.get("shop.components")).toEqual(reserved);
            expect(JSON.stringify(await f.namespaces.get("shop.components"))).not.toContain("account-a");
        } finally {
            await f.close();
        }
    },
);
