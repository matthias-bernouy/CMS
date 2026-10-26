import { expect, test } from "bun:test";
import { MemorySiteUpgradeStorage, withSiteWriteFence } from "@bernouy/cms-repository/upgrades";

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
