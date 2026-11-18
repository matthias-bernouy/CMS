import { expect, test } from "bun:test";
import { MemorySiteUpgradeStorage } from "@bernouy/repository/upgrades";
import { interruptPreparedUpgrade } from "./boundary";
import type { SiteUpgradeIntent } from "@bernouy/repository/upgrades";
import { resolve } from "node:path";

const intent = (): SiteUpgradeIntent<unknown> => ({
    id: `sha256:${"a".repeat(64)}`,
    siteId: "default",
    kind: "collection",
    planDigest: `sha256:${"b".repeat(64)}`,
    expectedRevision: 2,
    sourceStateDigest: `sha256:${"c".repeat(64)}`,
    targetStateDigest: `sha256:${"d".repeat(64)}`,
    status: "prepared",
    payload: { targets: [] },
    createdAt: new Date().toISOString(),
});

test("interruption retains the actual durable prepared record without executing the business commit", async () => {
    const storage = new MemorySiteUpgradeStorage();
    const begin = storage.begin;
    const planned = intent();
    let committed = false;
    const prepared = await interruptPreparedUpgrade(
        storage,
        async () => {
            await storage.begin(planned);
            committed = true;
        },
        (value) => {
            expect(value).toBe(planned);
        },
    );
    expect(committed).toBe(false);
    expect(prepared.id).toBe(planned.id);
    expect(prepared.status).toBe("prepared");
    expect(await storage.get("default", planned.id, "collection")).toEqual(planned);
    expect(storage.begin).toBe(begin);
});

test("scope refusal and unrelated failures are never accepted as a successful interruption", async () => {
    const storage = new MemorySiteUpgradeStorage();
    const begin = storage.begin;
    const refusal = new Error("fixture scope refused");
    await expect(
        interruptPreparedUpgrade(
            storage,
            () => storage.begin(intent()),
            () => {
                throw refusal;
            },
        ),
    ).rejects.toBe(refusal);
    expect(await storage.getActive("default")).toBeNull();
    expect(storage.begin).toBe(begin);
    await expect(
        interruptPreparedUpgrade(
            storage,
            async () => {
                throw refusal;
            },
            () => {},
        ),
    ).rejects.toBe(refusal);
    await expect(
        interruptPreparedUpgrade(
            storage,
            async () => {},
            () => {},
        ),
    ).rejects.toThrow("durable preparation boundary");
    expect(storage.begin).toBe(begin);
});

test("the standalone fixture module preserves interruption and adapter ownership when loaded inside the candidate process", async () => {
    const built = await Bun.build({
        entrypoints: [resolve(import.meta.dir, "boundary.ts")],
        target: "bun",
        format: "esm",
    });
    expect(built.success).toBe(true);
    expect(built.outputs).toHaveLength(1);
    const bytes = await built.outputs[0]!.arrayBuffer();
    expect(bytes.byteLength).toBeLessThan(16 * 1024);
    const module = await import(`data:text/javascript;base64,${Buffer.from(bytes).toString("base64")}`);
    const storage = new MemorySiteUpgradeStorage();
    const before = storage.begin;
    let committed = false;
    const prepared = await module.interruptPreparedUpgrade(
        storage,
        async () => {
            await storage.begin(intent());
            committed = true;
        },
        () => {},
    );
    expect(prepared.status).toBe("prepared");
    expect(committed).toBe(false);
    expect((await storage.getActive("default"))?.id).toBe(prepared.id);
    expect(storage.begin).toBe(before);
});
