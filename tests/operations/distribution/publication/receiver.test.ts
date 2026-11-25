import { expect, test } from "bun:test";
import { receiverFixture } from "./receiverFixture";

test("a real Registry HTTP refusal can be unblocked after runtime publication without changing any release bytes", async () => {
    const f = await receiverFixture();
    try {
        await f.publish("runtime");
        expect(f.attempts()).toBe(0);
        expect(f.tags.latest).toBe("1.0.0");
        expect(f.imageStores.every(({ registry }) => registry.writes.length === 1)).toBe(true);
        await expect(f.publish("catalogue")).rejects.toThrow("409");
        expect(await f.remoteFiles.list("contracts")).toHaveLength(1);
        expect(f.tags.latest).toBe("1.0.0");
        f.upgradeReceiver();
        await f.publish("catalogue");
        expect(await f.remoteFiles.list("contracts")).toHaveLength(2);
        expect(f.tags.latest).toBe(f.version);
        expect(f.calls.filter((args) => args[0] === "bun")).toHaveLength(1);
        expect(f.calls.filter((args) => args[0] === "npm")).toHaveLength(1);
        await f.publish("catalogue");
        expect(await f.remoteFiles.list("contracts")).toHaveLength(2);
        expect(f.imageStores.every(({ registry }) => registry.writes.length === 1)).toBe(true);
        expect(f.calls).toHaveLength(2);
    } finally {
        await f.close();
    }
});
