import { describe, expect, test } from "bun:test";
import { FsIntegrationPackageSource } from "@bernouy/cms-integration-packages/fs";
import { createVersionRoot, readerOptions } from "./fixtures";

describe("filesystem integration package source", () => {
    test("singleflights and caches successful immutable package reads", async () => {
        const root = createVersionRoot();
        let locateCalls = 0;
        const source = new FsIntegrationPackageSource({
            locate: async () => {
                locateCalls += 1;
                return readerOptions(root);
            },
        });

        const [first, second] = await Promise.all([
            source.getPackage("demo", "1.0.0"),
            source.getPackage("demo", "1.0.0"),
        ]);
        const third = await source.getPackage("demo", "1.0.0");

        expect(first).toBe(second);
        expect(second).toBe(third);
        expect(first?.digest).toMatch(/^[a-f0-9]{64}$/);
        expect(locateCalls).toBe(1);
    });

    test("does not cache missing packages or failed reads", async () => {
        const root = createVersionRoot();
        let locateCalls = 0;
        const source = new FsIntegrationPackageSource({
            locate: async () => {
                locateCalls += 1;
                if (locateCalls === 1) {
                    return null;
                }
                if (locateCalls === 2) {
                    return { ...readerOptions(root), definition: "missing.json" };
                }
                return readerOptions(root);
            },
        });

        expect(await source.getPackage("demo", "1.0.0")).toBeNull();
        await expect(source.getPackage("demo", "1.0.0")).rejects.toThrow(/definition does not reference/);
        expect(await source.getPackage("demo", "1.0.0")).not.toBeNull();
        expect(locateCalls).toBe(3);
    });

    test("supports targeted and global invalidation", async () => {
        const root = createVersionRoot();
        let locateCalls = 0;
        const source = new FsIntegrationPackageSource({
            locate: async () => {
                locateCalls += 1;
                return readerOptions(root);
            },
        });

        await source.getPackage("demo", "1.0.0");
        source.invalidate("demo", "1.0.0");
        await source.getPackage("demo", "1.0.0");
        source.invalidate();
        await source.getPackage("demo", "1.0.0");

        expect(locateCalls).toBe(3);
    });
});
