import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, readdir, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FsIntegrationPackageCache } from "@bernouy/cms-integration-packages/fs";
import { cleanupRoots, temporaryCacheRoot } from "./fixtures";

const cleanup: string[] = [];
afterEach(() => cleanupRoots(cleanup));

describe("integration package staging cleanup", () => {
    test("removes only entries beyond the configured safety age", async () => {
        const root = await temporaryCacheRoot(cleanup);
        const staging = join(root, ".staging");
        const stale = join(staging, "stale-operation");
        const fresh = join(staging, "fresh-operation");
        await Promise.all([mkdir(stale, { recursive: true }), mkdir(fresh, { recursive: true })]);
        await writeFile(join(stale, "readonly"), "stale", { mode: 0o400 });
        await utimes(stale, new Date(1_000), new Date(1_000));
        await utimes(fresh, new Date(9_500), new Date(9_500));

        await new FsIntegrationPackageCache({
            root,
            stagingSafetyAgeMs: 1_000,
            now: () => 10_000,
        }).init();

        expect(await readdir(staging)).toEqual(["fresh-operation"]);
    });
});
