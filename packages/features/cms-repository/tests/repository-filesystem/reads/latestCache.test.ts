import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LatestCollectionCatalogue } from "../../../src/repository/filesystem/artifacts/latestCatalogue";

test("all shared latest readers observe invalidation and failed loads are retryable", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-latest-race-"));
    try {
        const directory = join(root, "releases/test/item");
        await mkdir(directory, { recursive: true });
        for (const version of ["1.0.0", "2.0.0"]) {
            await writeFile(join(directory, `${version}.json`), "not hydrated");
        }
        let calls = 0;
        let unblock!: () => void;
        const gate = new Promise<void>((resolve) => {
            unblock = resolve;
        });
        const cache = new LatestCollectionCatalogue(root, {
            entries: async () => {
                calls++;
                const snapshot =
                    calls === 1
                        ? [
                              {
                                  coordinate: "collection\0test\0test/item\0" + "2.0.0",
                                  yank: { reason: "old", yankedAt: "2026-11-07T00:00:00Z" },
                              },
                          ]
                        : [];
                if (calls === 1) {
                    await gate;
                }
                return snapshot;
            },
        });
        const first = cache.read("stable");
        const shared = cache.read("stable");
        cache.invalidate();
        const after = cache.read("stable");
        unblock();
        const pages = await Promise.all([first, shared, after]);
        expect(pages.every((page) => page[0]!.version === "2.0.0")).toBe(true);
        expect(calls).toBe(2);
        expect(await cache.read("stable")).toBe(pages[0]!);
        expect(Object.isFrozen(pages[0])).toBe(true);
        expect(Object.isFrozen(pages[0]![0])).toBe(true);
        let failed = false;
        const retry = new LatestCollectionCatalogue(root, {
            entries: async () => {
                if (!failed) {
                    failed = true;
                    throw new Error("temporary");
                }
                return [];
            },
        });
        await expect(retry.read("stable")).rejects.toThrow("temporary");
        expect((await retry.read("stable"))[0]!.version).toBe("2.0.0");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("latest cursors preserve publisher order when namespace names share a prefix", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-publisher-order-"));
    try {
        for (const publisher of ["test.foo", "test", "test-foo"]) {
            const directory = join(root, "releases", publisher, "item");
            await mkdir(directory, { recursive: true });
            await writeFile(join(directory, "1.0.0.json"), "not hydrated");
        }
        const cache = new LatestCollectionCatalogue(root, { entries: async () => [] });
        expect((await cache.read("stable")).map((entry) => entry.publisherId)).toEqual([
            "test",
            "test-foo",
            "test.foo",
        ]);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
