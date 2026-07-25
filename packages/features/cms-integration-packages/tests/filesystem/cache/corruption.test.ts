import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, readFile, readdir, rename, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
    FsIntegrationPackageCache,
    IntegrationPackageCacheCorruptionError,
} from "@bernouy/cms-integration-packages/fs";
import { cleanupRoots, resolvedPackage, temporaryCacheRoot } from "./fixtures";

const cleanup: string[] = [];
afterEach(() => cleanupRoots(cleanup));

describe("integration package cache corruption", () => {
    test("fails closed on read and repairs through quarantine when source bytes are available", async () => {
        const root = await temporaryCacheRoot(cleanup);
        const input = await resolvedPackage();
        const cache = new FsIntegrationPackageCache({ root });
        const materialized = await cache.materialize(input);
        const definition = join(materialized.root, "definition.json");
        await chmod(definition, 0o640);
        await writeFile(definition, '{"kind":"tampered"}');

        await expect(new FsIntegrationPackageCache({ root }).get(input.digest)).rejects.toBeInstanceOf(
            IntegrationPackageCacheCorruptionError,
        );

        const repaired = await new FsIntegrationPackageCache({ root }).materialize(input);
        expect(repaired.digest).toBe(input.digest);
        expect(await readdir(join(root, ".corrupt"))).toHaveLength(1);
        expect((await new FsIntegrationPackageCache({ root }).get(input.digest))?.digest).toBe(input.digest);
    });

    test("rejects an internal layout symlink without writing through it", async () => {
        const root = await temporaryCacheRoot(cleanup);
        const outside = await temporaryCacheRoot(cleanup);
        await mkdir(outside, { recursive: true });
        await symlink(outside, join(root, "objects"));

        await expect(new FsIntegrationPackageCache({ root }).init()).rejects.toThrow(/real directory/);
        expect(await readdir(outside)).toEqual([]);
    });

    test.each(["file", "symlink"] as const)("quarantines a %s at the digest target", async (targetType) => {
        const root = await temporaryCacheRoot(cleanup);
        const outside = await temporaryCacheRoot(cleanup);
        const input = await resolvedPackage();
        const cache = new FsIntegrationPackageCache({ root });
        await cache.init();
        const destination = join(root, "objects/sha256", input.digest);
        const external = join(outside, "external");
        await writeFile(external, "unchanged", { mode: 0o600 });
        if (targetType === "file") {
            await writeFile(destination, "corrupt");
        } else {
            await symlink(external, destination);
        }
        const externalMode = (await stat(external)).mode & 0o777;

        const materialized = await cache.materialize(input);

        expect(materialized.digest).toBe(input.digest);
        expect(await readdir(join(root, ".corrupt"))).toHaveLength(1);
        expect(await readFile(external, "utf8")).toBe("unchanged");
        expect((await stat(external)).mode & 0o777).toBe(externalMode);
    });

    test("rejects a symlink substituted for the materialized root", async () => {
        const root = await temporaryCacheRoot(cleanup);
        const input = await resolvedPackage();
        const cache = new FsIntegrationPackageCache({ root });
        const materialized = await cache.materialize(input);
        const object = join(root, "objects/sha256", input.digest);
        const movedRoot = join(object, "actual-root");
        await chmod(object, 0o750);
        await rename(materialized.root, movedRoot);
        await symlink("actual-root", materialized.root);
        await chmod(object, 0o550);

        await expect(new FsIntegrationPackageCache({ root }).get(input.digest)).rejects.toBeInstanceOf(
            IntegrationPackageCacheCorruptionError,
        );
    });

    test("recovers an expired repair lock after restart", async () => {
        const root = await temporaryCacheRoot(cleanup);
        const input = await resolvedPackage();
        const cache = new FsIntegrationPackageCache({
            root,
            now: () => 10_000,
            repairLockWaitMs: 100,
            repairLockStaleAgeMs: 1_000,
        });
        await cache.init();
        await writeFile(join(root, "objects/sha256", input.digest), "corrupt");
        const lock = join(root, ".locks", input.digest);
        await mkdir(lock);
        await utimes(lock, new Date(0), new Date(0));

        expect((await cache.materialize(input)).digest).toBe(input.digest);
        expect(await readdir(join(root, ".locks"))).toEqual([]);
        expect(await readdir(join(root, ".corrupt"))).toHaveLength(2);
    });
});
