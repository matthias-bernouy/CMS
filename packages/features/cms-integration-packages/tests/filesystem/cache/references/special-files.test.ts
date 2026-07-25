import { afterEach, describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
    FsIntegrationPackageCache,
    IntegrationPackageCacheReferenceCorruptionError,
} from "@bernouy/cms-integration-packages/fs";
import { cleanupRoots, temporaryCacheRoot } from "../fixtures";

const cleanup: string[] = [];
afterEach(() => cleanupRoots(cleanup));

describe("filesystem integration package cache special-file references", () => {
    test("rejects a FIFO without blocking", async () => {
        const cacheRoot = await temporaryCacheRoot(cleanup);
        const cache = new FsIntegrationPackageCache({ root: cacheRoot });
        await cache.init();
        const directory = join(cacheRoot, "refs", "cache-demo");
        await mkdir(directory);
        const created = Bun.spawnSync(["mkfifo", join(directory, "1.0.0.json")]);
        expect(created.exitCode).toBe(0);

        await expect(cache.getReference("cache-demo", "1.0.0")).rejects.toBeInstanceOf(
            IntegrationPackageCacheReferenceCorruptionError,
        );
    });
});
