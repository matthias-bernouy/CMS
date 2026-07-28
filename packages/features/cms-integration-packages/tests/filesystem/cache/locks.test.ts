import { afterEach, describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { FsIntegrationPackageCache } from "@bernouy/cms-integration-packages/fs";
import { withRepairLock } from "../../../src/default-implementation/fs/cache/publication/locks";
import { cleanupRoots, temporaryCacheRoot } from "./fixtures";

const cleanup: string[] = [];
afterEach(() => cleanupRoots(cleanup));

describe("integration package repair lock leases", () => {
    test("heartbeats a long repair so another process cannot reclaim it", async () => {
        const root = await temporaryCacheRoot(cleanup);
        await new FsIntegrationPackageCache({ root }).init();
        const digest = "a".repeat(64);
        const layout = {
            root,
            objects: join(root, "objects/sha256"),
            staging: join(root, ".staging"),
            corrupt: join(root, ".corrupt"),
            locks: join(root, ".locks"),
        };
        const options = {
            layout,
            staging: join(root, ".staging/unused"),
            digest,
            repairLockWaitMs: 500,
            repairLockStaleAgeMs: 40,
            now: Date.now,
        };
        let release = (): void => undefined;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        let announce = (): void => undefined;
        const entered = new Promise<void>((resolve) => {
            announce = resolve;
        });
        const first = withRepairLock(options, async (assertOwned) => {
            await assertOwned();
            announce();
            await gate;
            await assertOwned();
            return "first";
        });
        await entered;
        const second = withRepairLock(options, async (assertOwned) => {
            await assertOwned();
            return "second";
        });
        try {
            await delay(120);
            expect(await readdir(layout.locks)).toEqual([digest]);
            expect(await readdir(layout.corrupt)).toEqual([]);
        } finally {
            release();
        }

        expect(await Promise.all([first, second])).toEqual(["first", "second"]);
        expect(await readdir(layout.locks)).toEqual([]);
    });
});

function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
