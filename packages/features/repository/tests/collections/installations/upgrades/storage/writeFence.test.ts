import { expect, test } from "bun:test";
import { MemorySiteUpgradeStorage } from "repository/site-upgrades/memory";
import { withSiteWriteFence } from "repository/site-upgrades/writeFence";

test("fenced adapters preserve private-field receivers for reads, getters and writes", async () => {
    class Adapter {
        #value = 1;
        get revision() {
            return this.#value;
        }
        read() {
            return this.#value;
        }
        write() {
            return ++this.#value;
        }
    }
    const fence = new MemorySiteUpgradeStorage();
    const store = withSiteWriteFence(new Adapter(), fence, "site", ["write"]);
    const detachedRead = store.read;
    expect(detachedRead()).toBe(1);
    expect(store.revision).toBe(1);
    expect(await store.write()).toBe(2);
    await fence.claimMaintenance("site", "upgrade:one");
    expect(store.read()).toBe(2);
    expect(store.revision).toBe(2);
    await expect(Promise.resolve().then(() => store.write())).rejects.toMatchObject({ status: 423 });
});

test("only explicitly draft-only methods suppress resource invalidation while retaining the write fence", async () => {
    const calls: Array<{ siteId: string; options?: { invalidateResources?: boolean } }> = [];
    const store = withSiteWriteFence(
        { draft: () => "draft", publish: () => "public" },
        {
            async withWrite(siteId, operation, options) {
                calls.push({ siteId, ...(options ? { options } : {}) });
                return operation();
            },
        },
        "site",
        ["draft", "publish"],
        ["draft"],
    );
    expect(await store.draft()).toBe("draft");
    expect(await store.publish()).toBe("public");
    expect(calls).toEqual([{ siteId: "site", options: { invalidateResources: false } }, { siteId: "site" }]);
});
