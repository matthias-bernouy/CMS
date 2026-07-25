import { afterEach, describe, expect, test } from "bun:test";
import { access, lstat, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    FsIntegrationPackageCache,
    INTEGRATION_PACKAGE_CACHE_REFERENCE_SCHEMA,
    IntegrationPackageCacheReferenceConflictError,
} from "@bernouy/cms-integration-packages/fs";
import { cleanupRoots, resolvedPackage, temporaryCacheRoot } from "../fixtures";

const cleanup: string[] = [];
afterEach(() => cleanupRoots(cleanup));

describe("filesystem integration package cache references", () => {
    test("performs no filesystem work during construction or invalid coordinate validation", async () => {
        const parent = await temporaryCacheRoot(cleanup);
        const cacheRoot = join(parent, "not-created");
        const cache = new FsIntegrationPackageCache({ root: cacheRoot });

        await expect(access(cacheRoot)).rejects.toThrow();
        await expect(cache.getReference("../escape", "1.0.0")).rejects.toThrow(/path-safe identifier/);
        await expect(cache.recordReference("demo", "1", "f".repeat(64))).rejects.toThrow(/exact SemVer/);
        await expect(cache.recordReference("demo", "1.0.0", "F".repeat(64))).rejects.toThrow(/lowercase hexadecimal/);
        await expect(access(cacheRoot)).rejects.toThrow();
    });

    test("records a dangling canonical reference that survives restart", async () => {
        const cacheRoot = await temporaryCacheRoot(cleanup);
        const input = await resolvedPackage();
        const cache = new FsIntegrationPackageCache({ root: cacheRoot });

        const recorded = await cache.recordReference(input.envelope.kind, input.envelope.version, input.digest);

        expect(recorded).toEqual({
            schema: INTEGRATION_PACKAGE_CACHE_REFERENCE_SCHEMA,
            kind: input.envelope.kind,
            version: input.envelope.version,
            digest: input.digest,
        });
        expect(await cache.get(input.digest)).toBeNull();
        const path = join(cacheRoot, "refs", input.envelope.kind, `${input.envelope.version}.json`);
        expect(await readFile(path)).toEqual(canonicalJsonBytes(recorded));
        expect((await stat(path)).mode & 0o777).toBe(0o440);
        expect((await stat(join(cacheRoot, "refs"))).dev).toBe((await stat(join(cacheRoot, "objects/sha256"))).dev);

        const restarted = new FsIntegrationPackageCache({ root: cacheRoot });
        expect(await restarted.getReference(input.envelope.kind, input.envelope.version)).toEqual(recorded);
    });

    test("reuses an existing reference to the same digest without replacing it", async () => {
        const cacheRoot = await temporaryCacheRoot(cleanup);
        const input = await resolvedPackage();
        const first = new FsIntegrationPackageCache({ root: cacheRoot });
        await first.recordReference(input.envelope.kind, input.envelope.version, input.digest);
        const path = join(cacheRoot, "refs", input.envelope.kind, `${input.envelope.version}.json`);
        const before = await lstat(path);

        const result = await new FsIntegrationPackageCache({ root: cacheRoot }).recordReference(
            input.envelope.kind,
            input.envelope.version,
            input.digest,
        );

        expect(result.digest).toBe(input.digest);
        expect((await lstat(path)).ino).toBe(before.ino);
        expect(await readdir(join(cacheRoot, "refs", input.envelope.kind))).toEqual([`${input.envelope.version}.json`]);
    });

    test("concurrent writers of the same digest converge without temporary files", async () => {
        const cacheRoot = await temporaryCacheRoot(cleanup);
        const input = await resolvedPackage();
        const caches = Array.from({ length: 12 }, () => new FsIntegrationPackageCache({ root: cacheRoot }));

        const references = await Promise.all(
            caches.map((cache) => cache.recordReference(input.envelope.kind, input.envelope.version, input.digest)),
        );

        expect(new Set(references.map(({ digest }) => digest))).toEqual(new Set([input.digest]));
        expect(await readdir(join(cacheRoot, "refs", input.envelope.kind))).toEqual([`${input.envelope.version}.json`]);
    });

    test("concurrent different digests preserve one winner and return a typed conflict", async () => {
        const cacheRoot = await temporaryCacheRoot(cleanup);
        const input = await resolvedPackage();
        const otherDigest = "f".repeat(64);
        const first = new FsIntegrationPackageCache({ root: cacheRoot });
        const second = new FsIntegrationPackageCache({ root: cacheRoot });

        const settled = await Promise.allSettled([
            first.recordReference(input.envelope.kind, input.envelope.version, input.digest),
            second.recordReference(input.envelope.kind, input.envelope.version, otherDigest),
        ]);

        const fulfilled = settled.find((result) => result.status === "fulfilled");
        const rejected = settled.find((result) => result.status === "rejected");
        expect(fulfilled?.status).toBe("fulfilled");
        expect(rejected?.status).toBe("rejected");
        if (fulfilled?.status !== "fulfilled" || rejected?.status !== "rejected") {
            throw new Error("Expected one immutable reference winner and one conflict");
        }
        expect(rejected.reason).toBeInstanceOf(IntegrationPackageCacheReferenceConflictError);
        const conflict = rejected.reason as IntegrationPackageCacheReferenceConflictError;
        expect(conflict.existingDigest).toBe(fulfilled.value.digest);
        expect(conflict.requestedDigest).not.toBe(conflict.existingDigest);
        expect(await first.getReference(input.envelope.kind, input.envelope.version)).toEqual(fulfilled.value);
    });

    test("materialization does not implicitly publish a coordinate reference", async () => {
        const cacheRoot = await temporaryCacheRoot(cleanup);
        const input = await resolvedPackage();
        const cache = new FsIntegrationPackageCache({ root: cacheRoot });

        await cache.materialize(input);

        expect(await cache.getReference(input.envelope.kind, input.envelope.version)).toBeNull();
    });
});
